import { useEffect, useState } from 'react';
import { ARDUINO_BOARDS, type ArduinoBoard } from '../arduino/boards';
import {
  compileArduino,
  downloadIno,
  getCompileUrl,
  setCompileUrl,
} from '../arduino/compile';
import { Stk500Flasher, type FlashProgress } from '../arduino/stk500';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Bloklardan üretilmiş Arduino (.ino) kaynağı */
  source: string;
}

type Step =
  | 'choose-board'
  | 'settings'
  | 'compiling'
  | 'flashing'
  | 'done'
  | 'error';

const PHASE_LABEL: Record<FlashProgress['phase'], string> = {
  reset: 'Kart sıfırlanıyor…',
  sync: 'Bootloader ile eşitleniyor…',
  progmode: 'Programlama moduna giriliyor…',
  writing: 'Flash yazılıyor…',
  done: 'Tamamlanıyor…',
};

export function ArduinoUploader({ open, onClose, source }: Props) {
  const [step, setStep] = useState<Step>('choose-board');
  const [board, setBoard] = useState<ArduinoBoard>(ARDUINO_BOARDS[0]);
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [stderrMsg, setStderrMsg] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [compileUrl, setCompileUrlState] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('choose-board');
    setProgress(null);
    setErrorMsg('');
    setStderrMsg('');
    const u = getCompileUrl();
    setCompileUrlState(u);
    setUrlInput(u || '');
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (step === 'compiling' || step === 'flashing') return; // işlem sürüyorsa kapatma
    onClose();
  };

  const handleDownload = () => {
    downloadIno(source, 'roboexx_sketch');
  };

  const handleSaveUrl = () => {
    setCompileUrl(urlInput);
    setCompileUrlState(urlInput.trim() || null);
    setStep('choose-board');
  };

  const handleCompileAndFlash = async () => {
    setErrorMsg('');
    setStderrMsg('');

    // 1) Derle
    setStep('compiling');
    let hex: string;
    try {
      const result = await compileArduino(source, board.fqbn);
      hex = result.hex;
      if (result.stderr) setStderrMsg(result.stderr);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'NO_COMPILE_URL') {
        setStep('settings');
        return;
      }
      setErrorMsg(msg);
      setStep('error');
      return;
    }

    // 2) Port seç + flash
    const flasher = new Stk500Flasher();
    if (!flasher.isSupported()) {
      setErrorMsg(
        'Web Serial bu tarayıcıda desteklenmiyor. Chrome veya Edge (masaüstü) kullan.'
      );
      setStep('error');
      return;
    }
    try {
      await flasher.requestPort();
    } catch {
      setErrorMsg('Seri port seçilmedi. Yüklemek için Arduino portunu seçmelisin.');
      setStep('error');
      return;
    }

    setStep('flashing');
    setProgress({ phase: 'reset', pct: 0 });
    try {
      await flasher.flashHex(hex, board, (p) => setProgress(p));
      setStep('done');
    } catch (e) {
      setErrorMsg((e as Error).message || 'Yükleme sırasında hata oluştu.');
      setStep('error');
    }
  };

  const hasUrl = !!compileUrl;

  return (
    <div className="fw-overlay" onClick={handleClose}>
      <div className="fw-card" onClick={(e) => e.stopPropagation()}>
        <div className="fw-header">
          <div className="fw-title">
            <span className="fw-title-icon">🔌</span>
            <span>Arduino'ya Yükle</span>
          </div>
          <button className="fw-close" onClick={handleClose} title="Kapat">
            ✕
          </button>
        </div>

        <div className="fw-body">
          {/* ----- Adım 1: Kart seç ----- */}
          {step === 'choose-board' && (
            <div className="fw-step">
              <h3>1. Kartını seç</h3>
              <p className="fw-hint">
                Bloklardan Arduino (C++) kodu üretildi. Kartını seç, sonra ister
                doğrudan yükle ister <strong>.ino</strong> olarak indir.
              </p>

              <div className="fw-board-grid">
                {ARDUINO_BOARDS.map((b) => (
                  <button
                    key={b.id}
                    className={
                      'fw-board-card' + (board.id === b.id ? ' fw-board-card-active' : '')
                    }
                    onClick={() => setBoard(b)}
                  >
                    <div className="fw-board-card-top">
                      <span className="fw-board-name">{b.shortName}</span>
                      <span className="fw-board-badge">{board.id === b.id ? '✓' : ''}</span>
                    </div>
                    <div className="fw-board-chip">{b.chip}</div>
                    <div className="fw-board-desc">{b.description}</div>
                  </button>
                ))}
              </div>

              <div className="fw-arduino-actions">
                <button
                  className="fw-btn fw-btn-primary fw-btn-big"
                  onClick={handleCompileAndFlash}
                  title={
                    hasUrl
                      ? 'Sunucuda derle ve karta yükle'
                      : 'Derleme sunucusu ayarlı değil — önce ayarla veya .ino indir'
                  }
                >
                  ⚡ Derle ve Yükle
                </button>
                <button className="fw-btn fw-btn-secondary" onClick={handleDownload}>
                  ⬇ .ino indir
                </button>
              </div>

              <div className="fw-arduino-url-status">
                {hasUrl ? (
                  <span className="fw-arduino-url-ok">
                    Derleme sunucusu: <code>{compileUrl}</code>{' '}
                    <button className="fw-link-btn" onClick={() => setStep('settings')}>
                      değiştir
                    </button>
                  </span>
                ) : (
                  <span className="fw-arduino-url-warn">
                    ⚠️ Derleme sunucusu ayarlı değil. Doğrudan yükleme için{' '}
                    <button className="fw-link-btn" onClick={() => setStep('settings')}>
                      sunucu URL'i ayarla
                    </button>
                    , ya da yukarıdan <strong>.ino indir</strong> ve Arduino IDE ile yükle.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ----- Ayarlar: derleme sunucusu URL ----- */}
          {step === 'settings' && (
            <div className="fw-step">
              <h3>Derleme sunucusu</h3>
              <p className="fw-hint">
                Tarayıcı C++ derleyemez. <code>arduino-cli</code> çalıştıran küçük bir
                sunucu URL'i gir (bkz. <code>server/arduino-compile.js</code>). Boş
                bırakırsan sadece .ino indirme kullanılabilir.
              </p>
              <input
                className="fw-url-input"
                type="text"
                placeholder="https://senin-derleme-sunucun.onrender.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <div className="fw-step-actions">
                <button
                  className="fw-btn fw-btn-secondary"
                  onClick={() => setStep('choose-board')}
                >
                  ← Geri
                </button>
                <button className="fw-btn fw-btn-primary" onClick={handleSaveUrl}>
                  Kaydet
                </button>
              </div>
            </div>
          )}

          {/* ----- Derleniyor ----- */}
          {step === 'compiling' && (
            <div className="fw-step">
              <h3>Derleniyor…</h3>
              <div className="fw-writing-illustration">
                <div className="fw-spinner" />
              </div>
              <p className="fw-hint">
                Kod sunucuda <code>arduino-cli</code> ile derleniyor. Bu birkaç saniye
                sürebilir.
              </p>
            </div>
          )}

          {/* ----- Yükleniyor (flash) ----- */}
          {step === 'flashing' && (
            <div className="fw-step">
              <h3>Karta yükleniyor…</h3>
              <div className="fw-writing-illustration">
                <div className="fw-spinner" />
              </div>
              {progress && (
                <>
                  <div className="fw-progress-track">
                    <div
                      className="fw-progress-fill"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <div className="fw-progress-text">
                    {PHASE_LABEL[progress.phase]} ({Math.round(progress.pct)}%)
                  </div>
                </>
              )}
              <p className="fw-hint">
                Yükleme bitene kadar kartın USB kablosunu çıkarma.
              </p>
            </div>
          )}

          {/* ----- Başarılı ----- */}
          {step === 'done' && (
            <div className="fw-step fw-step-done">
              <div className="fw-success-icon">🎉</div>
              <h3>Yükleme tamamlandı!</h3>
              <p>
                Kod <strong>{board.name}</strong> kartına yüklendi ve çalışmaya başladı.
              </p>
              {stderrMsg && (
                <details className="fw-arduino-stderr">
                  <summary>Derleyici uyarıları</summary>
                  <pre>{stderrMsg}</pre>
                </details>
              )}
              <div className="fw-step-actions">
                <button className="fw-btn fw-btn-primary" onClick={onClose}>
                  Kapat
                </button>
              </div>
            </div>
          )}

          {/* ----- Hata ----- */}
          {step === 'error' && (
            <div className="fw-step">
              <div className="fw-error-box">
                <strong>Hata:</strong> {errorMsg}
              </div>
              {stderrMsg && (
                <details className="fw-arduino-stderr" open>
                  <summary>Derleyici çıktısı</summary>
                  <pre>{stderrMsg}</pre>
                </details>
              )}
              <div className="fw-step-actions">
                <button
                  className="fw-btn fw-btn-secondary"
                  onClick={() => setStep('choose-board')}
                >
                  ← Geri
                </button>
                <button className="fw-btn fw-btn-primary" onClick={handleDownload}>
                  ⬇ Bunun yerine .ino indir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
