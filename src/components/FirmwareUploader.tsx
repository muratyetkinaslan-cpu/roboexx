import { useEffect, useState } from 'react';
import {
  BOARDS,
  fetchFirmwareList,
  downloadFirmware,
  writeFirmwareToDrive,
  isFileSystemAccessSupported,
  type BoardOption,
  type FirmwareList,
} from '../firmware/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'choose-board' | 'bootsel' | 'pick-drive' | 'writing' | 'done' | 'error';

export function FirmwareUploader({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose-board');
  const [list, setList] = useState<FirmwareList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<BoardOption | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successInfo, setSuccessInfo] = useState<{ version: string } | null>(null);

  // Popup açıldığında liste çek
  useEffect(() => {
    if (!open) return;
    // State sıfırla
    setStep('choose-board');
    setSelectedBoard(null);
    setProgress(null);
    setErrorMsg('');
    setSuccessInfo(null);
    setList(null);
    setListError(null);

    // Liste çek
    fetchFirmwareList()
      .then((boards) => setList(boards))
      .catch((err) => setListError(err.message || 'Liste alınamadı'));
  }, [open]);

  if (!open) return null;

  const handleSelectBoard = (board: BoardOption) => {
    setSelectedBoard(board);
    setStep('bootsel');
  };

  const handleBootselReady = () => {
    setStep('pick-drive');
  };

  const handlePickDrive = async () => {
    if (!selectedBoard) return;
    try {
      setStep('writing');
      setProgress({ loaded: 0, total: 0 });

      // 1) UF2 indir
      const { buffer, filename, version } = await downloadFirmware(
        selectedBoard.id,
        (loaded, total) => setProgress({ loaded, total }),
      );

      // 2) Sürücü seçimi popup'ı (User gesture'ı yeni — burada açılması garanti)
      await writeFirmwareToDrive(buffer, filename);

      setSuccessInfo({ version });
      setStep('done');
    } catch (err: any) {
      // Kullanıcı iptal etti
      if (err?.name === 'AbortError' || /abort|user/i.test(err?.message || '')) {
        setStep('pick-drive');
        return;
      }
      setErrorMsg(err?.message || 'Bilinmeyen hata');
      setStep('error');
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fw-overlay" onClick={handleClose}>
      <div className="fw-card" onClick={(e) => e.stopPropagation()}>
        <div className="fw-header">
          <div className="fw-title">
            <span className="fw-title-icon">⚡</span>
            <span>Pico'ya Firmware Yükle</span>
          </div>
          <button className="fw-close" onClick={handleClose} title="Kapat">✕</button>
        </div>

        <div className="fw-body">
          {/* Adım göstergesi */}
          <StepIndicator current={step} />

          {/* ----- Adım 1: Kart seç ----- */}
          {step === 'choose-board' && (
            <div className="fw-step">
              <h3>1. Kart tipini seç</h3>
              <p className="fw-hint">
                Hangi Pico kartını kullanıyorsun? Doğru sürümü seç, yoksa Pico çalışmaz.
              </p>

              {!isFileSystemAccessSupported() && (
                <div className="fw-warning">
                  ⚠️ Bu özellik için <strong>Chrome</strong> veya <strong>Edge</strong>
                  {' '}tarayıcısı gerekiyor. Firefox/Safari'de çalışmaz.
                </div>
              )}

              {listError && (
                <div className="fw-error-box">
                  ❌ {listError}
                  <button className="fw-link-btn" onClick={() => {
                    setListError(null);
                    fetchFirmwareList()
                      .then(setList)
                      .catch((e) => setListError(e.message));
                  }}>Tekrar dene</button>
                </div>
              )}

              {!list && !listError && (
                <div className="fw-loading">Sürüm bilgileri yükleniyor…</div>
              )}

              {list && (
                <div className="fw-board-grid">
                  {BOARDS.map((board) => {
                    const info = list[board.id];
                    const hasError = info?.error;
                    return (
                      <button
                        key={board.id}
                        className={`fw-board-card ${hasError ? 'fw-board-card-disabled' : ''}`}
                        onClick={() => !hasError && handleSelectBoard(board)}
                        disabled={!!hasError}
                      >
                        <div className="fw-board-card-top">
                          <span className="fw-board-name">{board.shortName}</span>
                          {board.hasWifi && (
                            <span className="fw-board-badge">📶 WiFi/BT</span>
                          )}
                        </div>
                        <div className="fw-board-chip">{board.chip}</div>
                        <div className="fw-board-desc">{board.description}</div>
                        {hasError ? (
                          <div className="fw-board-version-error">⚠️ Sürüm alınamadı</div>
                        ) : info ? (
                          <div className="fw-board-version">
                            En son: <strong>{info.version}</strong> ({formatDate(info.date)})
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ----- Adım 2: BOOTSEL talimatı ----- */}
          {step === 'bootsel' && selectedBoard && (
            <div className="fw-step">
              <h3>2. Pico'yu BOOTSEL modunda bağla</h3>
              <div className="fw-bootsel-row">
                <div className="fw-bootsel-visual">
                  <div className="fw-bootsel-pico">
                    <div className="fw-bootsel-pico-usb">USB</div>
                    <div className="fw-bootsel-pico-btn">BOOTSEL</div>
                    <div className="fw-bootsel-pico-arrow">⬇</div>
                  </div>
                </div>
                <ol className="fw-bootsel-steps">
                  <li>Pico'nun <strong>USB kablosunu çıkar</strong></li>
                  <li><strong>BOOTSEL düğmesini basılı tut</strong> (Pico üstünde küçük beyaz buton)</li>
                  <li>BOOTSEL'i basılı tutarken USB kablosunu tak</li>
                  <li>Bilgisayarda <strong>"{selectedBoard.volumeName}"</strong> adında bir disk belirir</li>
                  <li>BOOTSEL düğmesini bırak</li>
                </ol>
              </div>

              <div className="fw-step-actions">
                <button className="fw-btn fw-btn-secondary" onClick={() => setStep('choose-board')}>
                  ← Geri
                </button>
                <button className="fw-btn fw-btn-primary" onClick={handleBootselReady}>
                  Disk göründü, devam et →
                </button>
              </div>
            </div>
          )}

          {/* ----- Adım 3: Sürücü seç ----- */}
          {step === 'pick-drive' && selectedBoard && (
            <div className="fw-step">
              <h3>3. {selectedBoard.volumeName} sürücüsünü seç</h3>
              <p className="fw-hint">
                Aşağıdaki butona bas, açılan klasör seçim penceresinde
                {' '}<strong>"{selectedBoard.volumeName}"</strong> sürücüsünü seç.
                Tarayıcı izin isteyebilir, "İzin ver" de.
              </p>

              <div className="fw-pick-drive-illustration">
                <div className="fw-pick-emoji">💾</div>
                <div className="fw-pick-arrow">→</div>
                <div className="fw-pick-emoji">📁</div>
              </div>

              <div className="fw-step-actions">
                <button className="fw-btn fw-btn-secondary" onClick={() => setStep('bootsel')}>
                  ← Geri
                </button>
                <button className="fw-btn fw-btn-primary fw-btn-big" onClick={handlePickDrive}>
                  📁 Sürücüyü seç ve yükle
                </button>
              </div>
            </div>
          )}

          {/* ----- Adım 4: İndirme + yazma ----- */}
          {step === 'writing' && (
            <div className="fw-step">
              <h3>4. Yükleniyor…</h3>
              <div className="fw-writing-illustration">
                <div className="fw-spinner" />
              </div>
              {progress && progress.total > 0 ? (
                <>
                  <div className="fw-progress-track">
                    <div
                      className="fw-progress-fill"
                      style={{ width: `${(progress.loaded / progress.total) * 100}%` }}
                    />
                  </div>
                  <div className="fw-progress-text">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                    {' '}({Math.round((progress.loaded / progress.total) * 100)}%)
                  </div>
                </>
              ) : (
                <div className="fw-progress-text">İndiriliyor…</div>
              )}
              <p className="fw-hint">
                UF2 dosyası MicroPython sunucusundan indiriliyor, sonra Pico'ya yazılacak.
                Bu birkaç saniye sürer.
              </p>
            </div>
          )}

          {/* ----- Adım 5: Başarılı ----- */}
          {step === 'done' && (
            <div className="fw-step fw-step-done">
              <div className="fw-success-icon">🎉</div>
              <h3>Yükleme tamamlandı!</h3>
              <p>
                Pico kendiliğinden yeniden başlatıldı.{' '}
                {successInfo?.version && (
                  <>MicroPython <strong>{successInfo.version}</strong> yüklendi.</>
                )}
              </p>
              <div className="fw-success-next">
                <strong>Sıradaki adımlar:</strong>
                <ol>
                  <li>USB kablosunu çıkarıp tekrar tak (normal modda açılsın)</li>
                  <li>Toolbar'dan USB ile bağlan</li>
                  <li><strong>"Modülleri Yükle"</strong> butonuna bas (RoboExx kütüphanesini Pico'ya kur)</li>
                </ol>
              </div>
              <div className="fw-step-actions fw-step-actions-center">
                <button className="fw-btn fw-btn-primary" onClick={handleClose}>
                  Kapat
                </button>
              </div>
            </div>
          )}

          {/* ----- Hata ----- */}
          {step === 'error' && (
            <div className="fw-step fw-step-error">
              <div className="fw-error-icon">❌</div>
              <h3>Bir sorun oldu</h3>
              <p className="fw-error-msg">{errorMsg}</p>
              <div className="fw-step-actions">
                <button className="fw-btn fw-btn-secondary" onClick={handleClose}>Kapat</button>
                <button className="fw-btn fw-btn-primary" onClick={() => setStep('choose-board')}>
                  Tekrar dene
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------ yardımcılar ------------------ */

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'choose-board', label: 'Kart' },
    { key: 'bootsel', label: 'BOOTSEL' },
    { key: 'pick-drive', label: 'Sürücü' },
    { key: 'writing', label: 'Yükle' },
    { key: 'done', label: 'Bitti' },
  ];
  const idx = steps.findIndex((s) => s.key === current);
  if (current === 'error') return null;
  return (
    <div className="fw-stepper">
      {steps.map((s, i) => (
        <div
          key={s.key}
          className={
            'fw-stepper-dot ' +
            (i < idx ? 'done' : i === idx ? 'active' : 'todo')
          }
        >
          <span className="fw-stepper-num">{i < idx ? '✓' : i + 1}</span>
          <span className="fw-stepper-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
