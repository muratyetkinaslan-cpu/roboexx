import { useEffect, useState } from 'react';
import {
  DEFAULT_SENSORS,
  SENSOR_TYPE,
  SENSOR_TYPE_LABEL,
  PIN_LIMITS,
  formatValue,
  isErrorValue,
  type SensorConfig,
  type SensorReading,
  type SensorTypeValue,
} from '../sensors/types';
import { bleBridge } from '../bluetooth/ble-bridge';

const STORAGE_KEY = 'roboexx.sensor-configs';
const POLL_INTERVAL_MS = 500;

interface Props {
  open: boolean;
  onClose: () => void;
}

/** localStorage'dan kayıtlı config'leri yükle, yoksa default */
function loadConfigs(): SensorConfig[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_SENSORS;
}

function saveConfigs(cfgs: SensorConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfgs));
  } catch {}
}

export function SensorDashboard({ open, onClose }: Props) {
  const [configs, setConfigs] = useState<SensorConfig[]>(loadConfigs);
  const [readings, setReadings] = useState<Record<string, SensorReading>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Polling — popup açıkken her 500ms sensör değerlerini iste
  useEffect(() => {
    if (!open) return;

    // BLE'den gelen cevabı parse et
    const onReply = (payload: Uint8Array) => {
      const now = Date.now();
      const newReadings: Record<string, SensorReading> = {};
      for (let i = 0; i < configs.length; i++) {
        const offset = i * 2;
        if (offset + 1 >= payload.length) break;
        const raw = payload[offset] | (payload[offset + 1] << 8);
        newReadings[configs[i].id] = {
          raw,
          ok: !isErrorValue(raw),
          ts: now,
        };
      }
      setReadings((prev) => ({ ...prev, ...newReadings }));
    };
    bleBridge.onSensorReply = onReply;

    const sendRequest = () => {
      if (configs.length === 0) return;
      const tuples: Array<[number, number, number]> = configs.map((c) => [
        c.type, c.pin1, c.pin2,
      ]);
      bleBridge.requestSensors(tuples).catch(() => {});
    };
    sendRequest();
    const interval = setInterval(sendRequest, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (bleBridge.onSensorReply === onReply) {
        bleBridge.onSensorReply = null;
      }
    };
  }, [open, configs]);

  if (!open) return null;

  const handleSaveConfigs = (newConfigs: SensorConfig[]) => {
    setConfigs(newConfigs);
    saveConfigs(newConfigs);
    setSettingsOpen(false);
  };

  const handleReset = () => {
    if (confirm('Sensör ayarlarını varsayılana sıfırlamak istiyor musun?')) {
      setConfigs(DEFAULT_SENSORS);
      saveConfigs(DEFAULT_SENSORS);
    }
  };

  return (
    <div className="sensor-overlay" onClick={onClose}>
      <div className="sensor-card" onClick={(e) => e.stopPropagation()}>
        {/* Başlık çubuğu */}
        <div className="sensor-header">
          <div className="sensor-title">
            <span className="sensor-title-icon">🤖</span>
            <span>Canlı Sensör Paneli</span>
            <span className="sensor-poll-dot" title="Her 500ms güncellenir" />
          </div>
          <div className="sensor-header-actions">
            <button
              className="sensor-header-btn"
              onClick={() => setSettingsOpen(true)}
              title="Pin ayarları"
            >
              ⚙ Ayarlar
            </button>
            <button className="sensor-close-btn" onClick={onClose} title="Kapat">
              ✕
            </button>
          </div>
        </div>

        {/* Robot resmi + sensör balonları */}
        <div className="sensor-stage">
          <img
            src="/robot/roboturtle-iso.png"
            alt="RoboTurtle 3D model"
            className="sensor-robot-img"
            draggable={false}
          />
          {configs.map((cfg) => {
            const r = readings[cfg.id];
            return (
              <SensorBubble
                key={cfg.id}
                cfg={cfg}
                reading={r}
              />
            );
          })}
        </div>

        {/* Alt değer listesi (tablo) */}
        <div className="sensor-list">
          {configs.map((cfg) => {
            const r = readings[cfg.id];
            return (
              <div key={cfg.id} className="sensor-row">
                <span className="sensor-row-name">{cfg.name}</span>
                <span className="sensor-row-meta">
                  {SENSOR_TYPE_LABEL[cfg.type]} ·{' '}
                  {cfg.type === SENSOR_TYPE.ULTRASONIC
                    ? `T:${cfg.pin1} E:${cfg.pin2}`
                    : cfg.type === SENSOR_TYPE.TEMP_INTERNAL
                    ? 'dahili'
                    : `Pin ${cfg.pin1}`}
                </span>
                <span className={`sensor-row-value ${r?.ok ? 'ok' : 'err'}`}>
                  {r ? formatValue(cfg, r) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ayarlar popup'ı */}
      {settingsOpen && (
        <SensorSettings
          configs={configs}
          onSave={handleSaveConfigs}
          onCancel={() => setSettingsOpen(false)}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Sensör balonu (resim üzerinde mutlak konumlu)                       */
/* ================================================================== */

function SensorBubble({ cfg, reading }: { cfg: SensorConfig; reading?: SensorReading }) {
  const value = reading ? formatValue(cfg, reading) : '—';
  const ok = reading?.ok ?? false;
  return (
    <div
      className={`sensor-bubble sensor-bubble-${cfg.anchor} ${ok ? 'ok' : 'err'}`}
      style={{
        left: `${cfg.x}%`,
        top: `${cfg.y}%`,
      }}
    >
      <span className="sensor-bubble-label">{cfg.name}</span>
      <span className="sensor-bubble-value">{value}</span>
      <span className="sensor-bubble-dot" />
    </div>
  );
}

/* ================================================================== */
/* Pin ayarları popup'ı                                                */
/* ================================================================== */

function SensorSettings({
  configs,
  onSave,
  onCancel,
  onReset,
}: {
  configs: SensorConfig[];
  onSave: (c: SensorConfig[]) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<SensorConfig[]>(configs);

  const updateOne = (id: string, patch: Partial<SensorConfig>) => {
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const updatePin = (id: string, key: 'pin1' | 'pin2', value: number, type: SensorTypeValue) => {
    const limits = PIN_LIMITS[type];
    const range = key === 'pin1' ? limits.pin1 : limits.pin2;
    if (!range) return;
    const clamped = Math.max(range[0], Math.min(range[1], Math.floor(value || 0)));
    updateOne(id, { [key]: clamped } as Partial<SensorConfig>);
  };

  return (
    <div className="sensor-settings-backdrop" onClick={onCancel}>
      <div className="sensor-settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="sensor-settings-header">
          <h3>⚙ Sensör Pin Ayarları</h3>
          <button className="sensor-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="sensor-settings-body">
          <div className="sensor-settings-hint">
            Her sensörün takıldığı Pico W pinini gir. Değişiklikler kaydedildiğinde
            canlı panelde anında etkin olur.
          </div>

          {draft.map((cfg) => {
            const isUltra = cfg.type === SENSOR_TYPE.ULTRASONIC;
            const isTemp = cfg.type === SENSOR_TYPE.TEMP_INTERNAL;
            const isAnalog = cfg.type === SENSOR_TYPE.ANALOG;
            return (
              <div key={cfg.id} className="sensor-settings-row">
                <div className="sensor-settings-row-main">
                  <input
                    className="sensor-settings-name-input"
                    type="text"
                    value={cfg.name}
                    onChange={(e) => updateOne(cfg.id, { name: e.target.value.slice(0, 24) })}
                  />
                  <span className="sensor-settings-type">
                    {SENSOR_TYPE_LABEL[cfg.type]}
                  </span>
                </div>

                {!isTemp && (
                  <div className="sensor-settings-pins">
                    <label>
                      <span>{isUltra ? 'Trig' : isAnalog ? 'ADC Pin' : 'Pin'}</span>
                      <input
                        type="number"
                        value={cfg.pin1}
                        min={PIN_LIMITS[cfg.type].pin1[0]}
                        max={PIN_LIMITS[cfg.type].pin1[1]}
                        onChange={(e) => updatePin(cfg.id, 'pin1', +e.target.value, cfg.type)}
                      />
                    </label>
                    {isUltra && (
                      <label>
                        <span>Echo</span>
                        <input
                          type="number"
                          value={cfg.pin2}
                          min={PIN_LIMITS[cfg.type].pin2![0]}
                          max={PIN_LIMITS[cfg.type].pin2![1]}
                          onChange={(e) => updatePin(cfg.id, 'pin2', +e.target.value, cfg.type)}
                        />
                      </label>
                    )}
                    {isAnalog && (
                      <span className="sensor-settings-hint-inline">
                        (sadece 26-29 ADC)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sensor-settings-footer">
          <button className="sensor-settings-btn-reset" onClick={onReset}>
            Varsayılana Sıfırla
          </button>
          <div className="sensor-settings-footer-right">
            <button className="sensor-settings-btn-cancel" onClick={onCancel}>İptal</button>
            <button
              className="sensor-settings-btn-save"
              onClick={() => onSave(draft)}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
