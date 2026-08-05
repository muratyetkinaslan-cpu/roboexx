import { useEffect, useRef, useState } from 'react';
import { ModeTabs, type AppMode } from './ModeTabs';
import type { BridgeState, PortInfo } from '../serial/types';
import type { ThemeId } from '../themes/types';
import { branding } from '../config/branding';

type CodeTargetT = 'micropython' | 'arduino' | 'berrybot';

const TARGET_META: Record<CodeTargetT, { emoji: string; label: string; hint: string }> = {
  micropython: { emoji: '🐍', label: 'MicroPython', hint: 'Pico / ESP32' },
  berrybot:    { emoji: '🍓', label: 'BerryBot',    hint: 'Bluetooth ile kablosuz' },
  arduino:     { emoji: '🔌', label: 'Arduino',     hint: 'Uno / Nano · C++' },
};

/** Dışarı tıklayınca kapanan basit dropdown iskeleti. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

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

  /** "Modülleri Yükle" — roboexx.py kütüphanesini karta (Pico / ESP32) yaz */
  onUploadLibrary: () => void;

  /** Force reset — bridge sıkışırsa kurtarma */
  onForceReset: () => void;

  /** Sensör paneli aç — canlı sensör değerleri popup'ı */
  onSensorPanel: () => void;

  /** Pico'ya UF2 firmware (MicroPython) yükle */
  onFirmwareUpload: () => void;

  /** Kod hedefi — MicroPython (Pico / ESP32), Arduino veya BerryBot */
  codeTarget: 'micropython' | 'arduino' | 'berrybot';
  /** Kod hedefini değiştir */
  onTargetChange: (target: 'micropython' | 'arduino' | 'berrybot') => void;
  /** 🍓 BerryBot pil yüzdesi (BLE bağlıyken) — null: bilinmiyor/ölçüm yok */
  batteryPct?: number | null;
  /** Arduino'ya derle+yükle popup'ını aç */
  onArduinoUpload: () => void;

  /** Robot kol simülasyonunu aç/kapat */
  onRobotArm: () => void;
  /** Robot kol paneli açık mı (buton aktif görünümü) */
  robotArmActive: boolean;

  /** RoboBOT (diferansiyel sürüş) simülasyonunu aç/kapat */
  onRoboBot: () => void;
  /** RoboBOT paneli açık mı (buton aktif görünümü) */
  roboBotActive: boolean;

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

  const targetDd = useDropdown();
  const toolsDd = useDropdown();
  const curTarget = TARGET_META[props.codeTarget];

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

        {/* Kod hedefi — DROPDOWN (eski 3'lü buton grubu topbar'a sığmıyordu) */}
        <div className="tb-dropdown tb-dropdown-target" ref={targetDd.ref}>
          <button
            className={`tb-dd-trigger ${targetDd.open ? 'is-open' : ''}`}
            onClick={() => targetDd.setOpen(!targetDd.open)}
            title="Kod hedefini değiştir"
            aria-haspopup="menu"
            aria-expanded={targetDd.open}
          >
            <span className="tb-dd-emoji">{curTarget.emoji}</span>
            <span className="tb-dd-label">{curTarget.label}</span>
            <svg className="tb-dd-caret" width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {targetDd.open && (
            <div className="tb-dd-menu" role="menu">
              {(Object.keys(TARGET_META) as CodeTargetT[]).map((t) => (
                <button
                  key={t}
                  role="menuitem"
                  className={`tb-dd-item ${props.codeTarget === t ? 'is-active' : ''}`}
                  onClick={() => { props.onTargetChange(t); targetDd.setOpen(false); }}
                >
                  <span className="tb-dd-item-emoji">{TARGET_META[t].emoji}</span>
                  <span className="tb-dd-item-text">
                    <span className="tb-dd-item-name">{TARGET_META[t].label}</span>
                    <span className="tb-dd-item-hint">{TARGET_META[t].hint}</span>
                  </span>
                  {props.codeTarget === t && <span className="tb-dd-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-section toolbar-right">
        {/* 🍓 BerryBot pil göstergesi (BLE bağlıyken) */}
        {props.codeTarget === 'berrybot' && props.batteryPct !== undefined && (
          <span
            className="berrybot-battery-badge"
            data-tooltip="BerryBot pili"
            data-tooltip-detail={props.batteryPct === null
              ? 'Pil ölçümü yok — berrybot.py içinde PIN_BATTERY ayarlanmalı (bkz. BERRYBOT.md)'
              : 'Robottan 10 saniyede bir okunur'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12, fontSize: 12,
              background: props.batteryPct === null ? 'rgba(128,128,128,.18)'
                : props.batteryPct < 20 ? 'rgba(220,60,60,.22)' : 'rgba(60,180,90,.18)',
            }}
          >
            🔋 {props.batteryPct === null ? '—' : `%${props.batteryPct}`}
          </span>
        )}

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

        {/* GRUP 2: Çalıştırma — Araçlar dropdown + çalıştır/durdur + yükle */}
        <div className="toolbar-group toolbar-group-actions">
          {/* 🧰 ARAÇLAR — Firmware, Modüller, Sensör Paneli, Robot Kol, RoboBOT
              tek dropdown'da (eski 5 ikon topbar'a sığmıyordu) */}
          <div className="tb-dropdown tb-dropdown-tools" ref={toolsDd.ref}>
            <button
              className={`btn btn-ghost tb-dd-trigger tb-tools-trigger ${toolsDd.open ? 'is-open' : ''} ${(props.robotArmActive || props.roboBotActive) ? 'has-active' : ''}`}
              onClick={() => toolsDd.setOpen(!toolsDd.open)}
              title="Araçlar — firmware, modüller, sensörler, simülasyonlar"
              aria-haspopup="menu"
              aria-expanded={toolsDd.open}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              <span className="tb-tools-label">Araçlar</span>
              <svg className="tb-dd-caret" width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {toolsDd.open && (
              <div className="tb-dd-menu tb-dd-menu-right" role="menu">
                {props.codeTarget !== 'arduino' && (
                  <button
                    role="menuitem"
                    className="tb-dd-item"
                    onClick={() => { toolsDd.setOpen(false); props.onFirmwareUpload(); }}
                  >
                    <span className="tb-dd-item-emoji">⚡</span>
                    <span className="tb-dd-item-text">
                      <span className="tb-dd-item-name">Firmware Yükle</span>
                      <span className="tb-dd-item-hint">Pico'ya MicroPython UF2 (yeni kart için)</span>
                    </span>
                  </button>
                )}
                {props.codeTarget !== 'arduino' && (
                  <button
                    role="menuitem"
                    className="tb-dd-item"
                    disabled={!isConnected || isBusy}
                    onClick={() => { toolsDd.setOpen(false); props.onUploadLibrary(); }}
                  >
                    <span className="tb-dd-item-emoji">📦</span>
                    <span className="tb-dd-item-text">
                      <span className="tb-dd-item-name">Modülleri Yükle</span>
                      <span className="tb-dd-item-hint">
                        {props.codeTarget === 'berrybot'
                          ? 'BerryBot kütüphanesi + bootloader — bir kez yeter'
                          : 'RoboExx kütüphanesini karta yaz — bir kez yeter'}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  role="menuitem"
                  className="tb-dd-item"
                  disabled={!isConnected || props.connectionMode !== 'ble'}
                  onClick={() => { toolsDd.setOpen(false); props.onSensorPanel(); }}
                >
                  <span className="tb-dd-item-emoji">🤖</span>
                  <span className="tb-dd-item-text">
                    <span className="tb-dd-item-name">Sensör Paneli</span>
                    <span className="tb-dd-item-hint">
                      {props.connectionMode === 'ble' ? 'Canlı sensör değerleri' : 'Sadece BLE bağlantısında'}
                    </span>
                  </span>
                </button>
                <button
                  role="menuitem"
                  className={`tb-dd-item ${props.robotArmActive ? 'is-active' : ''}`}
                  onClick={() => { toolsDd.setOpen(false); props.onRobotArm(); }}
                >
                  <span className="tb-dd-item-emoji">🦾</span>
                  <span className="tb-dd-item-text">
                    <span className="tb-dd-item-name">Robot Kol</span>
                    <span className="tb-dd-item-hint">4 eksen simülasyon — gerçek kol senkron</span>
                  </span>
                  {props.robotArmActive && <span className="tb-dd-check">✓</span>}
                </button>
                <button
                  role="menuitem"
                  className={`tb-dd-item ${props.roboBotActive ? 'is-active' : ''}`}
                  onClick={() => { toolsDd.setOpen(false); props.onRoboBot(); }}
                >
                  <span className="tb-dd-item-emoji">🚗</span>
                  <span className="tb-dd-item-text">
                    <span className="tb-dd-item-name">RoboBOT Simülasyonu</span>
                    <span className="tb-dd-item-hint">Çizgi izleme · engelden kaçma</span>
                  </span>
                  {props.roboBotActive && <span className="tb-dd-check">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Durdur — MEŞGUL her durumda görünür (USB run, BLE yükleme,
              takılı kalan işlem). Yeni iptal sistemi süren işlemi anında
              düşürür; enerji kesmeye / fiziksel resete gerek kalmaz. */}
          {isBusy && (
            <button className="btn btn-stop" onClick={props.onStop} title="Süren işlemi durdur / iptal et">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
              Durdur
            </button>
          )}

          {/* Çalıştır — sadece USB modunda + Pico hedefinde (BLE'de canlı çıktı pratik değil) */}
          {!isBusy && props.codeTarget !== 'arduino' && props.connectionMode === 'usb' && (
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
          )}

          {props.codeTarget !== 'arduino' ? (
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
          ) : (
            <button
              className="btn btn-primary"
              onClick={props.onArduinoUpload}
              title="Arduino'ya derle ve yükle (veya .ino indir)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1.5v7M3 4.5L6 1.5l3 3M2 10.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Arduino'ya Yükle
            </button>
          )}
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
