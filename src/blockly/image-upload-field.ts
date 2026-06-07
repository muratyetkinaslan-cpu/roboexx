import * as Blockly from 'blockly';

/**
 * Özel Blockly field: Resim Upload.
 *
 * Davranış:
 *   - Blok üstünde küçük bir önizleme (32×16 thumbnail)
 *   - Tıklayınca dosya seçici açılır
 *   - PNG/JPG → 128×64 grayscale → threshold (mid=127) → mono bitmap
 *   - Bitmap framebuf.MONO_VLSB formatında bytearray olarak saklanır
 *   - Blockly serialization için JSON value: { data: base64, width, height, threshold }
 *
 * Generator bu field'dan bitmap'i okur ve `bytes(<...>)` literal'i olarak
 * üretilen koda gömer (geçici, kalıcı yazılmaz).
 */

interface ImageData {
  /** Base64 encoded MONO_VLSB bitmap bytes */
  data: string;
  width: number;
  height: number;
  threshold: number;
  /** Önizleme için renkli data URL (PNG, küçültülmüş) */
  thumbnail: string;
}

const EMPTY_VALUE: ImageData = { data: '', width: 0, height: 0, threshold: 127, thumbnail: '' };

export class FieldImageUpload extends Blockly.Field<ImageData> {
  static readonly EDITABLE = true;
  static readonly SERIALIZABLE = true;

  private previewImg_: SVGImageElement | null = null;

  constructor(value: ImageData | undefined = undefined) {
    super(value ?? EMPTY_VALUE);
    this.SERIALIZABLE = true;
  }

  static fromJson(options: { value?: ImageData }): FieldImageUpload {
    return new FieldImageUpload(options.value);
  }

  protected override initView(): void {
    // SVG group: çerçeve + thumbnail
    const SIZE_W = 36;
    const SIZE_H = 22;

    const rect = Blockly.utils.dom.createSvgElement(
      'rect',
      {
        x: 0,
        y: 0,
        width: SIZE_W,
        height: SIZE_H,
        rx: 4,
        ry: 4,
        fill: 'rgba(0,0,0,0.25)',
        stroke: 'rgba(255,255,255,0.5)',
        'stroke-width': 1,
      },
      this.fieldGroup_
    );

    this.previewImg_ = Blockly.utils.dom.createSvgElement(
      'image',
      {
        x: 1,
        y: 1,
        width: SIZE_W - 2,
        height: SIZE_H - 2,
        preserveAspectRatio: 'xMidYMid meet',
      },
      this.fieldGroup_
    ) as SVGImageElement;

    this.updatePreview_();
    this.size_ = new Blockly.utils.Size(SIZE_W, SIZE_H);
  }

  protected override render_(): void {
    this.size_ = new Blockly.utils.Size(36, 22);
    this.updatePreview_();
  }

  protected override updateSize_(): void {
    this.size_ = new Blockly.utils.Size(36, 22);
  }

  private updatePreview_(): void {
    if (!this.previewImg_) return;
    const v = this.getValue();
    if (v && v.thumbnail) {
      this.previewImg_.setAttributeNS('http://www.w3.org/1999/xlink', 'href', v.thumbnail);
      this.previewImg_.setAttribute('href', v.thumbnail);
    } else {
      this.previewImg_.removeAttribute('href');
      this.previewImg_.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
    }
  }

  protected override showEditor_(): void {
    // Modal aç — resim yükleme ve önizleme
    showImageUploadModal(this.getValue() ?? EMPTY_VALUE, (newValue) => {
      this.setValue(newValue);
    });
  }

  protected override doClassValidation_(newValue?: ImageData | null): ImageData | null {
    if (!newValue) return EMPTY_VALUE;
    if (typeof newValue.data !== 'string') return null;
    return newValue;
  }

  protected override doValueUpdate_(newValue: ImageData): void {
    super.doValueUpdate_(newValue);
    this.updatePreview_();
  }

  override getText(): string {
    const v = this.getValue();
    if (!v || !v.data) return '(resim yok)';
    return `${v.width}×${v.height}`;
  }
}

// Blockly registry'ye kaydet
Blockly.fieldRegistry.register('field_image_upload', FieldImageUpload);

// ====================================================================
// MODAL — dosya seç, threshold ayarla, önizleme
// ====================================================================

function showImageUploadModal(
  currentValue: ImageData,
  onSave: (value: ImageData) => void
): void {
  // Eski varsa kaldır
  const existing = document.getElementById('rx-image-upload-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'rx-image-upload-modal';
  backdrop.className = 'rx-img-modal-backdrop';

  let threshold = currentValue.threshold || 127;
  let invert = false;
  let originalBitmap: ImageBitmap | null = null;

  backdrop.innerHTML = `
    <div class="rx-img-modal">
      <header class="rx-img-modal-header">
        <h3>OLED Resim Yükle</h3>
        <button class="rx-img-modal-close" type="button">✕</button>
      </header>
      <div class="rx-img-modal-body">
        <div class="rx-img-upload-area" id="rx-img-drop">
          <input type="file" accept="image/*" id="rx-img-file" style="display:none" />
          <div class="rx-img-upload-prompt">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
              <polyline points="3 18 9 12 13 16 17 12 21 16" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            <strong>Resim seç</strong>
            <span>PNG, JPG · 128×64'e küçültülecek</span>
          </div>
        </div>
        <div class="rx-img-preview-section" style="display:none">
          <div class="rx-img-preview-wrap">
            <div class="rx-img-preview-label">Önizleme (OLED'de görünecek hali)</div>
            <canvas id="rx-img-preview" width="128" height="64"></canvas>
          </div>
          <div class="rx-img-controls">
            <label class="rx-img-slider-label">
              Eşik (Threshold): <span id="rx-img-threshold-val">${threshold}</span>
              <input type="range" id="rx-img-threshold" min="0" max="255" value="${threshold}" />
              <span class="rx-img-hint">Düşük → daha çok beyaz · Yüksek → daha çok siyah</span>
            </label>
            <label class="rx-img-checkbox">
              <input type="checkbox" id="rx-img-invert" />
              Renkleri ters çevir
            </label>
            <button type="button" class="rx-img-change" id="rx-img-change">Farklı resim seç</button>
          </div>
        </div>
      </div>
      <footer class="rx-img-modal-footer">
        <button type="button" class="rx-img-cancel">İptal</button>
        <button type="button" class="rx-img-save" disabled>Kaydet</button>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);

  const fileInput = backdrop.querySelector('#rx-img-file') as HTMLInputElement;
  const dropArea = backdrop.querySelector('#rx-img-drop') as HTMLElement;
  const previewSection = backdrop.querySelector('.rx-img-preview-section') as HTMLElement;
  const previewCanvas = backdrop.querySelector('#rx-img-preview') as HTMLCanvasElement;
  const thresholdInput = backdrop.querySelector('#rx-img-threshold') as HTMLInputElement;
  const thresholdVal = backdrop.querySelector('#rx-img-threshold-val') as HTMLElement;
  const invertInput = backdrop.querySelector('#rx-img-invert') as HTMLInputElement;
  const changeBtn = backdrop.querySelector('#rx-img-change') as HTMLButtonElement;
  const saveBtn = backdrop.querySelector('.rx-img-save') as HTMLButtonElement;

  const close = () => backdrop.remove();
  backdrop.querySelector('.rx-img-modal-close')!.addEventListener('click', close);
  backdrop.querySelector('.rx-img-cancel')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Eski değer varsa direkt önizlemeye git
  if (currentValue.data && currentValue.thumbnail) {
    fetch(currentValue.thumbnail)
      .then((r) => r.blob())
      .then(createImageBitmap)
      .then((bm) => {
        originalBitmap = bm;
        showPreview();
      })
      .catch(() => {});
  }

  dropArea.addEventListener('click', () => fileInput.click());
  changeBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      originalBitmap = await createImageBitmap(f);
      showPreview();
    } catch (e) {
      alert('Resim okunamadı: ' + (e as Error).message);
    }
  });

  thresholdInput.addEventListener('input', () => {
    threshold = parseInt(thresholdInput.value, 10);
    thresholdVal.textContent = String(threshold);
    showPreview();
  });
  invertInput.addEventListener('change', () => {
    invert = invertInput.checked;
    showPreview();
  });

  function showPreview() {
    if (!originalBitmap) return;
    dropArea.style.display = 'none';
    previewSection.style.display = 'flex';
    saveBtn.disabled = false;

    const ctx = previewCanvas.getContext('2d')!;
    // 128x64 hedef, kaynak orana göre içine sığdır (letterbox)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 64);

    const srcW = originalBitmap.width;
    const srcH = originalBitmap.height;
    const scale = Math.min(128 / srcW, 64 / srcH);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const dx = Math.floor((128 - drawW) / 2);
    const dy = Math.floor((64 - drawH) / 2);
    ctx.drawImage(originalBitmap, 0, 0, srcW, srcH, dx, dy, drawW, drawH);

    // Threshold uygula
    const img = ctx.getImageData(0, 0, 128, 64);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // Luminance
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let on = lum > threshold;
      if (invert) on = !on;
      const v = on ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  saveBtn.addEventListener('click', () => {
    if (!originalBitmap) return;

    // Sonuç bitmap'i framebuf.MONO_VLSB formatına encode et
    // VLSB: her byte 8 dikey piksel (LSB üstte), pages = height/8
    const ctx = previewCanvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, 128, 64);
    const d = img.data;

    const W = 128, H = 64;
    const PAGES = H / 8;
    const buf = new Uint8Array(W * PAGES);

    for (let py = 0; py < PAGES; py++) {
      for (let x = 0; x < W; x++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const y = py * 8 + bit;
          const i = (y * W + x) * 4;
          // R kanalı yeterli (zaten siyah/beyaz)
          if (d[i] > 127) byteVal |= 1 << bit;
        }
        buf[py * W + x] = byteVal;
      }
    }

    // Base64 encode
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const base64 = btoa(binary);

    // Thumbnail PNG
    const thumbnail = previewCanvas.toDataURL('image/png');

    onSave({
      data: base64,
      width: 128,
      height: 64,
      threshold,
      thumbnail,
    });
    close();
  });
}

/** Generator için yardımcı: ImageData → Python bytes literal */
export function imageDataToBytesLiteral(value: ImageData): string {
  if (!value || !value.data) return 'b""';
  const binary = atob(value.data);
  let py = 'b"';
  for (let i = 0; i < binary.length; i++) {
    const c = binary.charCodeAt(i);
    // Python bytes literal: \xNN
    py += '\\x' + c.toString(16).padStart(2, '0');
  }
  py += '"';
  return py;
}
