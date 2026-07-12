import { useEffect, useRef, useState } from 'react';
import {
  ARDUINO_BOARDS,
  getBoard,
  guessBoardFromUsb,
  type ArduinoBoard,
  type BoardGuess,
} from '../arduino/boards';
import {
  compileArduinoWithWake,
  discoverCompileUrl,
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
  | 'connect'      // Adım 1: portu seç
  | 'choose-board' // Adım 2: kartı doğrula + yükle
  | 'settings'     // derleme sunucusu ayarı
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
  const [step, setStep] = useState<Step>('connect');
  const [board, setBoard] = useState<ArduinoBoard>(ARDUINO_BOARDS[0]);
  const [guess, setGuess] = useState<BoardGuess | null>(null);
  const [portReused, setPortReused] = useState(false);
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [flashNote, setFlashNote] = useState('');
  const [wakeMsg, setWakeMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [stderrMsg, setStderrMsg] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [compileUrl, setCompileUrlState] = useState<string | null>(null);
  const [searchingServer, setSearchingServer] = useState(false);

  // Flasher tüm adımlar boyunca yaşasın (port seçimi korunur)
  const flasherRef = useRef<Stk500Flasher | null>(null);
  if (!flasherRef.current) flasherRef.current = new Stk500Flasher();
  const flasher = flasherRef.current;

  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setErrorMsg('');
    setStderrMsg('');
    setFlashNote('');
    setGuess(null);
    setPortReused(false);

    // Derleme sunucusunu arkaplanda bul (localStorage → env → origin → localhost)
    setSearchingServer(true);
    discoverCompileUrl()
      .then((u) => setCompileUrlState(u))
      .finally(() => setSearchingServer(false));
    setUrlInput(getCompileUrl() || '');

    // Daha önce izin verilmiş tek bir Arduino portu varsa dialogsuz devam et
    (async () => {
      if (flasher.hasPort()) {
        applyGuess();
        setPortReused(true);
        setStep('choose-board');
        return;
      }
      const reused = await flasher.tryReuseKnownPort();
      if (reused) {
        applyGuess();
        setPortReused(true);
        setStep('choose-board');
      } else {
        setStep('connect');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const busy = step === 'compiling' || step === 'flashing';

  const handleClose = () => {
    if (busy) return; // işlem sürüyorsa kapatma
    onClose();
  };

  const handleDownload = () => {
    downloadIno(source, 'roboexx_sketch');
  };

  /** Port bilgisinden kartı tahmin edip ön-seç. */
  const applyGuess = () => {
    const info = flasher.getPortInfo();
    if (!info) return;
    const g = guessBoardFromUsb(info);
    setGuess(g);
    if (g) {
      const b = getBoard(g.boardId);
      if (b) setBoard(b);
    }
  };

  /** Adım 1 → 2: port dialogu aç. */
  const handlePickPort = async () => {
    setErrorMsg('');
    if (!flasher.isSupported()) {
      setErrorMsg(
        'Web Serial bu tarayıcıda desteklenmiyor. Chrome veya Edge (masaüstü) kullanmalısın.'
      );
      setStep('error');
      return;
    }
    try {
      await flasher.requestPort();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'PORT_NOT_SELECTED') return; // dialog iptal — aynı adımda kal
      setErrorMsg(msg);
      setStep('error');
      return;
    }
    setPortReused(false);
    applyGuess();
    setStep('choose-board');
  };

  const handleChangePort = async () => {
    flasher.forgetPort();
    setGuess(null);
    setPortReused(false);
    setStep('connect');
  };

  const handleSaveUrl = () => {
    setCompileUrl(urlInput);
    setCompileUrlState(urlInput.trim() || null);
    setStep('choose-board');
  };

  /** Adım 2 → yükleme: derle + flash. */
  const handleUpload = async () => {
    setErrorMsg('');
    setStderrMsg('');
    setFlashNote('');
    setWakeMsg('');

    // 1) Derle (önbellekte varsa anında döner; sunucu uyuyorsa uyandırılır)
    setStep('compiling');
    let hex: string;
    try {
      const result = await compileArduinoWithWake(source, board.fqbn, (m) =>
        setWakeMsg(m)
      );
      hex = result.hex;
      if (result.stderr) setStderrMsg(result.stderr);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'NO_COMPILE_URL') {
        // Son bir kez otomatik ara, yine yoksa ayar ekranı
        const found = await discoverCompileUrl();
        if (found) {
          setCompileUrlState(found);
          return handleUpload();
        }
        setStep('settings');
        return;
      }
      setErrorMsg(msg);
      setStep('error');
      return;
    }

    // 2) Flash (bootloader hızı gerekirse otomatik değişir)
    if (!flasher.hasPort()) {
      setStep('connect');
      return;
    }
    setStep('flashing');
    setProgress({ phase: 'reset', pct: 0 });
    try {
      await flasher.flashHexAuto(
        hex,
        board,
        (p) => setProgress(p),
        (note) => setFlashNote(note)
      );
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
          {/* ----- Adım 1: Portu seç ----- */}
          {step === 'connect' && (
            <div className="fw-step">
              <h3>1. Arduino'yu bilgisayara tak</h3>
              <p className="fw-hint">
                USB kablosuyla bağla, sonra aşağıdaki butona bas ve açılan listeden
                kartını seç. Listede yalnız Arduino benzeri cihazlar görünür.
              </p>
              <div className="fw-arduino-actions">
                <button
                  className="fw-btn fw-btn-primary fw-btn-big"
                  onClick={handlePickPort}
                >
                  🔍 Portu Seç
                </button>
                <button className="fw-btn fw-btn-secondary" onClick={handleDownload}>
                  ⬇ .ino indir
                </button>
              </div>
              <p className="fw-hint fw-hint-small">
                İpucu: Listede hiçbir şey yoksa kabloyu kontrol et — bazı kablolar
                yalnızca şarj içindir, veri taşımaz.
              </p>
            </div>
          )}

          {/* ----- Adım 2: Kartı doğrula + yükle ----- */}
          {step === 'choose-board' && (
            <div className="fw-step">
              <h3>2. Kartını doğrula ve yükle</h3>
              {(guess || portReused) && (
                <p className="fw-hint">
                  {portReused && <>✅ Daha önce kullandığın port hazır. </>}
                  {guess && (
                    <>
                      🔎 {guess.reason} — <strong>{getBoard(guess.boardId)?.name}</strong>{' '}
                      önerildi{guess.confidence !== 'high' ? ' (emin değilsen değiştirebilirsin)' : ''}.
                    </>
                  )}
                </p>
              )}

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

              <p className="fw-hint fw-hint-small">
                Nano'da bootloader'ın eski mi yeni mi olduğunu bilmene gerek yok —
                yükleme sırasında ikisi de otomatik denenir.
              </p>

              <div className="fw-arduino-actions">
                <button
                  className="fw-btn fw-btn-primary fw-btn-big"
                  onClick={handleUpload}
                >
                  ⚡ Karta Yükle
                </button>
                <button className="fw-btn fw-btn-secondary" onClick={handleDownload}>
                  ⬇ .ino indir
                </button>
                <button className="fw-btn fw-btn-secondary" onClick={handleChangePort}>
                  🔁 Portu değiştir
                </button>
              </div>

              <div className="fw-arduino-url-status">
                {searchingServer ? (
                  <span>Derleme sunucusu aranıyor…</span>
                ) : hasUrl ? (
                  <span className="fw-arduino-url-ok">
                    Derleme sunucusu: <code>{compileUrl}</code>{' '}
                    <button className="fw-link-btn" onClick={() => setStep('settings')}>
                      değiştir
                    </button>
                  </span>
                ) : (
                  <span className="fw-arduino-url-warn">
                    ⚠️ Derleme sunucusu bulunamadı. Tek tıkla yükleme için{' '}
                    <button className="fw-link-btn" onClick={() => setStep('settings')}>
                      sunucu URL'i ayarla
                    </button>
                    , ya da <strong>.ino indir</strong> ve Arduino IDE ile yükle.
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
                sunucu URL'i gir (bkz. <code>server/arduino-compile.js</code>).
                Öğretmen ipucu: siteyi <code>?derleme=https://sunucu-adresi</code> ile
                açarsan URL herkeste otomatik kaydolur.
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
              {wakeMsg && <p className="fw-hint">⏳ {wakeMsg}</p>}
              <p className="fw-hint">
                Kod sunucuda <code>arduino-cli</code> ile derleniyor. Bu birkaç saniye
                sürebilir. (Aynı kodu tekrar yüklersen bu adım atlanır.)
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
              {flashNote && <p className="fw-hint">🔁 {flashNote}</p>}
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
                <button
                  className="fw-btn fw-btn-secondary"
                  onClick={() => setStep('choose-board')}
                >
                  🔁 Tekrar yükle
                </button>
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
              <div className="fw-arduino-checklist">
                <strong>Kontrol listesi:</strong>
                <ul>
                  <li>USB kablosu tam takılı mı? (Bazı kablolar veri taşımaz)</li>
                  <li>Arduino IDE'nin Seri Monitör'ü açık mı? Kapat — portu meşgul eder.</li>
                  <li>Doğru portu mu seçtin? "Portu değiştir" ile yeniden seç.</li>
                  <li>Kart tipi doğru mu? (Uno / Nano)</li>
                </ul>
              </div>
              {stderrMsg && (
                <details className="fw-arduino-stderr" open>
                  <summary>Derleyici çıktısı</summary>
                  <pre>{stderrMsg}</pre>
                </details>
              )}
              <div className="fw-step-actions">
                <button className="fw-btn fw-btn-secondary" onClick={handleChangePort}>
                  🔁 Portu değiştir
                </button>
                <button
                  className="fw-btn fw-btn-primary"
                  onClick={() =>
                    setStep(flasher.hasPort() ? 'choose-board' : 'connect')
                  }
                >
                  ↻ Tekrar dene
                </button>
                <button className="fw-btn fw-btn-secondary" onClick={handleDownload}>
                  ⬇ .ino indir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
