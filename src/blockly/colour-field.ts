import * as Blockly from 'blockly';

/**
 * Özel Blockly field: Renk Seçici.
 *
 * Blockly v11'de yerleşik FieldColour core'dan çıkarıldı. Kendi seçicimizi
 * yazdık. İki bölümlü:
 *   1. 12 hızlı renk — tek tıkla seçim
 *   2. "Tüm renkler" — tarayıcının yerleşik renk seçicisini açar
 *      (Google'daki gibi hue/saturation alanı + hex girişi)
 *
 * Seçilen renk '#rrggbb' string olarak saklanır.
 */

const PALETTE: string[] = [
  '#ff0000', '#ff7700', '#ffdd00', '#33dd00',
  '#00ddaa', '#00aaff', '#0044ff', '#7700ff',
  '#ff00cc', '#ffffff', '#888888', '#000000',
];

export class FieldColourPalette extends Blockly.Field<string> {
  static readonly EDITABLE = true;
  SERIALIZABLE = true;

  private swatch_: SVGRectElement | null = null;

  constructor(value: string = '#ff0000') {
    super(value);
    this.SERIALIZABLE = true;
  }

  static fromJson(options: { colour?: string }): FieldColourPalette {
    return new FieldColourPalette(options.colour ?? '#ff0000');
  }

  protected doClassValidation_(newValue?: string): string | null {
    if (typeof newValue !== 'string') return null;
    const v = newValue.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    if (/^#[0-9a-f]{3}$/.test(v)) {
      return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    }
    return null;
  }

  protected override initView(): void {
    // Sadece renkli swatch — arka plan borderRect'i YOK.
    this.swatch_ = Blockly.utils.dom.createSvgElement(
      'rect',
      {
        class: 'rx-colour-swatch',
        rx: 4, ry: 4, x: 0, y: 0,
        height: 18, width: 30,
        stroke: 'rgba(0,0,0,0.35)',
        'stroke-width': 1,
      },
      this.fieldGroup_!
    );
    this.applyColour_();
  }

  /** Swatch'ın rengini mevcut değere göre günceller. */
  private applyColour_(): void {
    if (this.swatch_) {
      const colour = this.getValue() || '#ff0000';
      // Hem fill özniteliği hem style — CSS'in ezme ihtimaline karşı style
      // daha yüksek öncelikli; iki yoldan da garanti.
      this.swatch_.setAttribute('fill', colour);
      this.swatch_.style.fill = colour;
    }
  }

  protected override updateSize_(): void {
    this.size_.width = 30;
    this.size_.height = 18;
  }

  protected override render_(): void {
    super.render_?.();
    this.applyColour_();
  }

  protected override doValueUpdate_(newValue: string): void {
    super.doValueUpdate_(newValue);
    this.applyColour_();
  }

  /**
   * setValue sonrası swatch'ın kesin güncellenmesi için forceRerender.
   * Blockly v11'de doValueUpdate_ bazen render zincirini tetiklemiyor.
   */
  override setValue(newValue: unknown): void {
    super.setValue(newValue);
    this.applyColour_();
    try {
      this.forceRerender();
    } catch {
      /* render edilmemiş field — sorun değil */
    }
  }

  protected override showEditor_(): void {
    const dropdownDiv = Blockly.DropDownDiv.getContentDiv();

    const wrap = document.createElement('div');
    wrap.style.padding = '10px';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.minWidth = '170px';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gap = '6px';

    PALETTE.forEach((colour) => {
      const cell = document.createElement('button');
      cell.style.width = '32px';
      cell.style.height = '32px';
      cell.style.borderRadius = '7px';
      cell.style.background = colour;
      cell.style.cursor = 'pointer';
      cell.style.padding = '0';
      const selected = colour.toLowerCase() === (this.getValue() || '').toLowerCase();
      cell.style.border = selected ? '3px solid #fff' : '2px solid rgba(0,0,0,0.3)';
      cell.style.boxShadow = selected ? '0 0 0 2px #ff7a00' : 'none';
      cell.title = colour;
      cell.addEventListener('click', () => {
        this.setValue(colour);
        Blockly.DropDownDiv.hideIfOwner(this);
      });
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);

    const sep = document.createElement('div');
    sep.style.height = '1px';
    sep.style.background = 'rgba(255,255,255,0.15)';
    sep.style.margin = '2px 0';
    wrap.appendChild(sep);

    const fullRow = document.createElement('label');
    fullRow.style.display = 'flex';
    fullRow.style.alignItems = 'center';
    fullRow.style.gap = '8px';
    fullRow.style.cursor = 'pointer';
    fullRow.style.fontSize = '12px';
    fullRow.style.fontWeight = '600';
    fullRow.style.color = 'var(--rx-text, #eee)';
    fullRow.style.padding = '4px 2px';

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.value = this.getValue() || '#ff0000';
    nativeInput.style.width = '34px';
    nativeInput.style.height = '34px';
    nativeInput.style.border = 'none';
    nativeInput.style.borderRadius = '7px';
    nativeInput.style.cursor = 'pointer';
    nativeInput.style.background = 'transparent';
    nativeInput.style.padding = '0';
    nativeInput.addEventListener('input', () => {
      this.setValue(nativeInput.value);
    });
    nativeInput.addEventListener('change', () => {
      this.setValue(nativeInput.value);
      Blockly.DropDownDiv.hideIfOwner(this);
    });

    const fullLabel = document.createElement('span');
    fullLabel.textContent = 'Tüm renkler · hex';

    fullRow.appendChild(nativeInput);
    fullRow.appendChild(fullLabel);
    wrap.appendChild(fullRow);

    dropdownDiv.appendChild(wrap);
    Blockly.DropDownDiv.setColour(
      'var(--rx-surface, #2a2a2a)',
      'var(--rx-border, #444)'
    );
    Blockly.DropDownDiv.showPositionedByField(this, () => {
      wrap.remove();
    });
  }
}

Blockly.fieldRegistry.register('field_colour_palette', FieldColourPalette);
