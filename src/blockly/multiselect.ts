import * as Blockly from 'blockly';

/**
 * RoboExx — Çoklu seçim (multiselect) implementasyonu.
 *
 * TASARIM KARARI:
 * Blockly'nin DOM event'lerini intercept etmek yerine onun KENDİ olay sistemini
 * (Blockly.Events.SELECTED) dinliyoruz. Bu Blockly v11'in pointer event'lerini
 * yutması sorununu by-pass eder. Shift tuşu durumunu klavye event'leri ile
 * ayrıca takip ediyoruz.
 *
 * Akış:
 *   1. Kullanıcı Shift'e basılı tutar → shiftHeld = true
 *   2. Bir bloğa tıklar → Blockly normal şekilde o bloğu seçer + SELECTED event ateşler
 *   3. Bizim listener: shiftHeld true ise bloğu kendi multi-selection set'imize ekle/çıkar
 *      (Blockly'nin kendi seçimini değiştirmiyoruz — üzerine kendi highlight'ımızı koyuyoruz)
 *   4. Shift olmadan tıklama → multi-selection temizlenir
 *
 * Klavye:
 *   Shift + tıkla     → seçime ekle/çıkar
 *   Esc               → seçimi temizle
 *   Delete/Backspace  → seçili tümünü sil
 *   Ctrl/Cmd + C/X/V  → kopyala/kes/yapıştır
 *
 * KRITIK: Klavye kısayolları CAPTURE phase'de + stopImmediatePropagation ile
 * yakalanır — yoksa Blockly'nin kendi Ctrl+V handler'ı paralel çalışıp
 * fazladan blok yapıştırır.
 */
export class SimpleMultiselect {
  private workspace: Blockly.WorkspaceSvg;
  private selected = new Set<string>();
  private highlighted = new Map<string, SVGElement>();
  private clipboard: ClipboardItem[] = [];
  private detachers: Array<() => void> = [];
  private shiftHeld = false;

  constructor(workspace: Blockly.WorkspaceSvg) {
    this.workspace = workspace;
    this.attach();
  }

  destroy() {
    this.clearSelection();
    this.detachers.forEach((fn) => fn());
    this.detachers = [];
  }

  // ====== Setup ======

  private attach() {
    // 1) Shift state takibi
    const onShiftKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        this.shiftHeld = (e.type === 'keydown');
      }
    };
    const onBlur = () => { this.shiftHeld = false; };
    document.addEventListener('keydown', onShiftKey);
    document.addEventListener('keyup', onShiftKey);
    window.addEventListener('blur', onBlur);
    this.detachers.push(() => {
      document.removeEventListener('keydown', onShiftKey);
      document.removeEventListener('keyup', onShiftKey);
      window.removeEventListener('blur', onBlur);
    });

    // 2) Blockly'nin SELECTED event'ini dinle
    const onChange = (event: Blockly.Events.Abstract) => {
      if (event.type !== Blockly.Events.SELECTED) return;
      // Blockly v11: SELECTED event'inde newElementId / oldElementId var
      const ev = event as unknown as { newElementId?: string | null; oldElementId?: string | null };
      const newId = ev.newElementId ?? null;

      if (this.shiftHeld && newId) {
        // Sadece blok ID'si ise (comment vb. atla)
        const block = this.workspace.getBlockById(newId);
        if (block) {
          this.toggleBlock(newId);
        }
      } else if (!this.shiftHeld) {
        // Shift basılı değilken normal tıklama → multi-selection'ı temizle
        // İstisna: zaten seçili olan bir bloğa tıkladıysa bekle (kullanıcı sürüklemek istiyor olabilir)
        if (newId && this.selected.has(newId)) return;
        this.clearSelection();
      }
    };
    this.workspace.addChangeListener(onChange);
    this.detachers.push(() => this.workspace.removeChangeListener(onChange));

    // 3) Klavye kısayolları (delete, copy, paste vb.)
    //    CAPTURE PHASE + stopImmediatePropagation: Blockly'nin shortcut handler'ı
    //    paralel çalışmasın diye. Aksi halde "1 fazla yapıştırma" bug'ı oluyor.
    const onKeyDown = (e: KeyboardEvent) => {
      // Input/textarea'da yazılırken karışma
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      // Esc her zaman temizler (selection olmasa bile)
      if (e.key === 'Escape') {
        if (this.selected.size > 0) this.clearSelection();
        return;
      }

      if (this.selected.size === 0) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      // Yardımcı: Blockly'nin shortcut'larını engelle, sonra eylemi çalıştır
      const block = (action: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        action();
      };

      if (e.key === 'Delete' || e.key === 'Backspace') {
        block(() => this.deleteSelected());
      } else if (ctrl && k === 'c') {
        block(() => this.copySelected());
      } else if (ctrl && k === 'x') {
        block(() => this.cutSelected());
      } else if (ctrl && k === 'v') {
        block(() => this.pasteClipboard());
      }
    };
    document.addEventListener('keydown', onKeyDown, true); // CAPTURE
    this.detachers.push(() => document.removeEventListener('keydown', onKeyDown, true));
  }

  // ====== Selection state ======

  private toggleBlock(blockId: string) {
    if (this.selected.has(blockId)) {
      this.selected.delete(blockId);
      this.unhighlight(blockId);
    } else {
      this.selected.add(blockId);
      this.highlight(blockId);
    }
  }

  private highlight(blockId: string) {
    const block = this.workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
    if (!block) return;
    const root = block.getSvgRoot();
    if (root) {
      root.classList.add('rx-multi-selected');
      this.highlighted.set(blockId, root);
    }
  }

  private unhighlight(blockId: string) {
    const root = this.highlighted.get(blockId);
    if (root) {
      root.classList.remove('rx-multi-selected');
      this.highlighted.delete(blockId);
    }
  }

  clearSelection() {
    for (const id of this.selected) this.unhighlight(id);
    this.selected.clear();
  }

  // ====== Operations ======

  private deleteSelected() {
    const ids = Array.from(this.selected);
    this.clearSelection();
    Blockly.Events.setGroup(true);
    try {
      for (const id of ids) {
        const block = this.workspace.getBlockById(id);
        if (block && block.isDeletable()) {
          block.dispose(true);
        }
      }
    } finally {
      Blockly.Events.setGroup(false);
    }
  }

  /**
   * "Tepe" blokları döndür: parent'ı seçimde olmayan bloklar.
   * A→B zincirinde ikisi de seçiliyse, sadece A kopyalanır (B otomatik dahil).
   */
  private getTopSelectedBlocks(): Blockly.BlockSvg[] {
    const result: Blockly.BlockSvg[] = [];
    for (const id of this.selected) {
      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      if (!block) continue;
      const parent = block.getParent();
      if (parent && this.selected.has(parent.id)) continue;
      result.push(block);
    }
    return result;
  }

  private copySelected() {
    const items: ClipboardItem[] = [];
    for (const block of this.getTopSelectedBlocks()) {
      try {
        const state = Blockly.serialization.blocks.save(block, {
          addCoordinates: false,
          addInputBlocks: true,
          addNextBlocks: true,
        }) as object;
        const xy = block.getRelativeToSurfaceXY();
        items.push({ state, origX: xy.x, origY: xy.y });
      } catch (e) {
        console.warn('Copy failed for block:', block.id, e);
      }
    }
    if (items.length > 0) this.clipboard = items;
  }

  private cutSelected() {
    this.copySelected();
    this.deleteSelected();
  }

  private pasteClipboard() {
    if (this.clipboard.length === 0) return;
    this.clearSelection();

    let minX = Infinity, minY = Infinity;
    for (const it of this.clipboard) {
      if (it.origX < minX) minX = it.origX;
      if (it.origY < minY) minY = it.origY;
    }
    const offset = 30;

    const newIds: string[] = [];
    Blockly.Events.setGroup(true);
    try {
      for (const it of this.clipboard) {
        const newBlock = Blockly.serialization.blocks.append(
          it.state as Blockly.serialization.blocks.State,
          this.workspace
        ) as Blockly.BlockSvg;
        const tx = (it.origX - minX) + offset;
        const ty = (it.origY - minY) + offset;
        const cur = newBlock.getRelativeToSurfaceXY();
        newBlock.moveBy(tx - cur.x, ty - cur.y);
        newIds.push(newBlock.id);
      }
    } finally {
      Blockly.Events.setGroup(false);
    }

    // Yeni blokları seç ki bir sonraki Ctrl+V daha aşağı yapışsın
    for (const id of newIds) {
      this.selected.add(id);
      this.highlight(id);
    }
    // Clipboard'u yeni pozisyonlarla güncelle
    this.copySelected();
  }
}

interface ClipboardItem {
  state: object;
  origX: number;
  origY: number;
}
