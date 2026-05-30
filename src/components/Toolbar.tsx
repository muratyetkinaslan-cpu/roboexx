import { ModeTabs, type AppMode } from './ModeTabs';
import type { BridgeState, PortInfo } from '../serial/types';
import type { ThemeId } from '../themes/types';
import { branding } from '../config/branding';

interface Props {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;

  bridgeState: BridgeState;
  portInfo: PortInfo | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRun: () => void;
  onUpload: () => void;
  onStop: () => void;

  /** Bağlantı modu — USB veya BLE */
  connectionMode: 'usb' | 'ble';
  onConnectionModeChange: (mode: 'usb' | 'ble') => void;
  /** BLE bağlanma butonu */
  onBleConnect: () => void;

  projectName: string | null;
  isDirty: boolean;
  /** Son kaydedilme zamanı (göreceli metin) — topbar'da gösterilir */
  lastSavedText?: string | null;

  /* Canlı Paylaşım topbar'dan kaldırıldı — sol rail'deki "Sınıf" sekmesinden yönetilir. */

  /** "Modülleri Yükle" — roboexx.py kütüphanesini Pico'ya yaz */
  onUploadLibrary: () => void;

  /** Force reset — bridge sıkışırsa kurtarma */
  onForceReset: () => void;

  /** Sensör paneli aç — canlı sensör değerleri popup'ı */
  onSensorPanel: () => void;

  /** Açık/koyu tema geçişi */
  themeId: ThemeId;
  onToggleLight: () => void;
}

export function Toolbar(props: Props) {
  const { bridgeState, portInfo } = props;
  const isConnected = bridgeState === 'connected' || bridgeState === 'busy';
  const isBusy = bridgeState === 'busy';
  const isConnecting = bridgeState === 'connecting';
  const isLight = props.themeId === 'galaxy-orange-light';

  return (
    <header className="toolbar">
      <div className="toolbar-section toolbar-left">
        <Brand isLight={isLight} />

        <div className="toolbar-divider" />

        {/* Proje adı + son kaydedilme zamanı göstergesi */}
        <div className="project-info project-info-compact">
          <div className="project-name-wrap">
            <span className="project-label">Proje</span>
            <span className="project-name">
              {props.projectName ?? 'Yeni Proje'}
              {props.isDirty && <span className="project-dirty" title="Kaydedilmemiş değişiklikler">•</span>}
            </span>
            {props.lastSavedText && (
              <span className="project-saved-time">{props.lastSavedText}</span>
            )}
          </div>
        </div>
      </div>

      <div className="toolbar-section toolbar-center">
        <ModeTabs mode={props.mode} onChange={props.onModeChange} />
      </div>

      <div className="toolbar-section toolbar-right">
        {/* Açık/koyu tema geçiş butonu */}
        <button
          className="theme-toggle-btn"
          onClick={props.onToggleLight}
          title={isLight ? 'Koyu temaya geç' : 'Açık temaya geç'}
        >
          {isLight ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* GRUP 1: Bağlantı — USB/BLE toggle + cihaz durumu + bağlan/kes */}
        <div className="toolbar-group toolbar-group-connection">
          <div className="connection-mode-toggle" role="group" aria-label="Bağlantı modu">
            <button
              className={`cm-btn ${props.connectionMode === 'usb' ? 'is-active' : ''}`}
              onClick={() => props.onConnectionModeChange('usb')}
              disabled={isConnected || isConnecting}
              title="USB üzerinden bağlan (Web Serial)"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <rect x="6" y="1" width="4" height="3" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 4v11M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              USB
            </button>
            <button
              className={`cm-btn ${props.connectionMode === 'ble' ? 'is-active' : ''}`}
              onClick={() => props.onConnectionModeChange('ble')}
              disabled={isConnected || isConnecting}
              title="Bluetooth Low Energy üzerinden bağlan"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M5 4l6 8-3 2V2l3 2-6 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              BLE
            </button>
          </div>

          <div
            className="device-pill"
            data-state={bridgeState}
            data-mode={props.connectionMode}
            onClick={isBusy ? props.onForceReset : undefined}
            style={isBusy ? { cursor: 'pointer' } : undefined}
            title={isBusy ? 'Sıkıştıysa tıklayarak resetle' : undefined}
          >
            <span className="device-icon">
              {isConnected && <span className="device-pulse" />}
              {props.connectionMode === 'ble' ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M5 4l6 8-3 2V2l3 2-6 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="3.5" y="2" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6.5 5h3M6.5 7h3M7 13v1.5h2V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <div className="device-text">
              {bridgeState === 'disconnected' && <span>Cihaz yok</span>}
              {bridgeState === 'connecting' && <span>Bağlanılıyor…</span>}
              {(bridgeState === 'connected' || bridgeState === 'busy') && portInfo && (
                <>
                  <span className="device-name">{portInfo.friendlyName}</span>
                  <span className="device-meta">
                    {isBusy ? 'meşgul · sıfırla' : (props.connectionMode === 'ble' ? 'BLE bağlı' : 'bağlı · 115200')}
                  </span>
                </>
              )}
            </div>
          </div>

          {!isConnected ? (
            <button
              className="btn btn-secondary"
              onClick={props.connectionMode === 'ble' ? props.onBleConnect : props.onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Bağlanılıyor…' : 'Bağlan'}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={props.onDisconnect} disabled={isBusy}>
              Kes
            </button>
          )}
        </div>

        {/* GRUP 2: Çalıştırma — modülleri yükle + çalıştır/durdur + yükle */}
        <div className="toolbar-group toolbar-group-actions">
          <button
            className="btn btn-ghost btn-upload-lib"
            onClick={props.onUploadLibrary}
            disabled={!isConnected || isBusy}
            title="RoboExx kütüphanesini (roboexx.py) Pico'ya yükle. Bir kez yaparsın yeter."
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="13" cy="4" r="2" fill="currentColor" />
            </svg>
            Modülleri Yükle
          </button>

          {/* Sensör paneli — robot resmi üzerinde canlı sensör değerleri */}
          <button
            className="btn btn-ghost btn-sensor-panel"
            onClick={props.onSensorPanel}
            disabled={!isConnected || props.connectionMode !== 'ble'}
            title={props.connectionMode === 'ble'
              ? "Sensör paneli — robot resmi üzerinde canlı sensör değerleri"
              : "Sensör paneli BLE bağlantısında kullanılabilir"}
          >
            <span style={{ fontSize: 14 }}>🤖</span>
            Sensör Paneli
          </button>

          {/* Çalıştır — sadece USB modunda (BLE'de canlı çıktı pratik değil) */}
          {props.connectionMode === 'usb' && (
            isBusy ? (
              <button className="btn btn-stop" onClick={props.onStop} title="Çalışan programı durdur (Ctrl+C)">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                </svg>
                Durdur
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={props.onRun}
                disabled={!isConnected}
                title="REPL üzerinden RAM'de anında çalıştır"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2.5 1.5v9l8-4.5-8-4.5z" />
                </svg>
                Çalıştır
              </button>
            )
          )}

          <button
            className="btn btn-primary"
            onClick={props.onUpload}
            disabled={!isConnected || isBusy}
            title="main.py olarak flash'a kalıcı yaz"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1.5v7M3 4.5L6 1.5l3 3M2 10.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Yükle
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Marka bileşeni.
 *
 * Wordmark modunda 2 katman:
 *   1. Alt katman: orijinal logo (her zaman)
 *   2. Üst katman: aynı logo, kafa kısmı clipped, RGB animasyonlu (rgbHead aktifse)
 */
function Brand({ isLight }: { isLight: boolean }) {
  const { logo, productName, productSubtitle } = branding;

  if (logo.mode === 'wordmark') {
    const rgb = logo.rgbHead === true ? {} : (logo.rgbHead || null);
    const hasRgb = !!rgb;
    const widthPct = (rgb && typeof rgb === 'object' && rgb.widthPercent) ?? 24;
    const speed = (rgb && typeof rgb === 'object' && rgb.speed) ?? 10;
    // Açık temada srcLight varsa onu kullan, yoksa normal src
    const logoSrc = isLight && logo.srcLight ? logo.srcLight : logo.src;

    return (
      <div className="brand brand-wordmark">
        <div
          className="brand-wordmark-stack"
          style={{ width: logo.width, height: logo.height }}
        >
          <img
            src={logoSrc}
            alt={productName}
            className="brand-wordmark-img"
            onError={(e) => {
              // logo-light.svg yoksa normal logoya düş
              const img = e.currentTarget;
              if (img.src.indexOf(logo.src) === -1) img.src = logo.src;
            }}
          />
          {hasRgb && (
            <img
              src={logoSrc}
              alt=""
              aria-hidden="true"
              className="brand-rgb-overlay"
              style={
                {
                  '--rx-rgb-clip': `${100 - widthPct}%`,
                  '--rx-rgb-speed': `${speed}s`,
                } as React.CSSProperties
              }
            />
          )}
        </div>
      </div>
    );
  }

  if (logo.mode === 'icon') {
    const size = logo.size ?? 22;
    const logoSrc = isLight && logo.srcLight ? logo.srcLight : logo.src;
    return (
      <div className="brand">
        <div className="brand-logo">
          <img
            src={logoSrc}
            alt={productName}
            className="brand-logo-img"
            style={{ width: size, height: size }}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.indexOf(logo.src) === -1) img.src = logo.src;
            }}
          />
        </div>
        {!logo.hideWordmark && (
          <div className="brand-text">
            <span className="brand-name">{productName}</span>
            <span className="brand-target">{productSubtitle}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="brand">
      <div className="brand-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" fill="currentColor" />
        </svg>
      </div>
      <div className="brand-text">
        <span className="brand-name">{productName}</span>
        <span className="brand-target">{productSubtitle}</span>
      </div>
    </div>
  );
}
