import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { SimpleMultiselect } from '../blockly/multiselect';
import { toolboxXml } from '../blockly/toolbox';
import '../blockly/blocks';
import { generateForTarget, type CodeTarget } from '../blockly/codegen';
import type { RoboExxTheme } from '../themes/types';
import { buildBlocklyTheme } from '../themes/registry';
import { ICONS } from '../blockly/icons';

// Başlangıç bloğunun normal (kahraman-olmayan) tema ikonu — şimşek
const BOLT_ICON_URI = ICONS.bolt;

// Blockly snap config — blok yerleştirmesini kolaylaştırır
Blockly.config.snapRadius = 48;
Blockly.config.connectingSnapRadius = 80;

export interface PeerCursorRender {
  clientId: number;
  name: string;
  x: number;
  y: number;
}

interface Props {
  onCodeChange: (code: string) => void;
  onUserEdit?: () => void;
  theme: RoboExxTheme;
  /** Üretilecek kod hedefi — MicroPython (Pico) veya Arduino (C++) */
  target: CodeTarget;
  /** Live Share aktifken — lokal cursor pozisyonunu yukarı bildir */
  onCursorMove?: (x: number, y: number) => void;
  /** Live Share aktifken — diğer peer'lerin cursor'larını render et */
  peerCursors?: PeerCursorRender[];
}

export interface BlocklyWorkspaceHandle {
  saveState: () => object | null;
  loadState: (state: object) => void;
  /**
   * Live Share için remote state uygulama. loadState gibi ama change
   * event'lerini "kullanıcı düzenlemesi" saymaz (echo loop önlenir) ve
   * mevcut seçim/viewport'u korumaya çalışır.
   */
  applyRemoteState: (state: object) => void;
  resetToEmpty: () => void;
  resize: () => void;
  setToolboxEnabled: (enabled: boolean) => void;
  /** Şu an bir blok sürükleniyor mu? Live Share için remote update'i ertelemek için. */
  isDragging: () => boolean;
  /** Verilen blok tiplerini çalışma alanına ekler (donanım galerisi için). */
  addBlocks: (blockTypes: string[]) => void;
  /** Başlangıç bloğu hariç tüm blokları siler (toplu silme). */
  clearAllExceptStart: () => void;
  /** Mevcut bloklardan kodu yeniden üretir (kod hedefi değişince çağrılır). */
  regenerate: () => void;
}

export const BlocklyWorkspace = forwardRef<BlocklyWorkspaceHandle, Props>(
  ({ onCodeChange, onUserEdit, theme, target, onCursorMove, peerCursors }, ref) => {
    const divRef = useRef<HTMLDivElement>(null);
    const cursorLayerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const multiselectRef = useRef<SimpleMultiselect | null>(null);
    // loadState'e verilen son workspace state'i. Blockly StrictMode'da
    // 2x mount olur; ilk workspace dispose edilince ikinci boş kalmasın
    // diye init sırasında bu state varsa yeniden yüklenir.
    const pendingStateRef = useRef<object | null>(null);
    const userEditCb = useRef(onUserEdit);
    userEditCb.current = onUserEdit;
    // Kod hedefini ref'te tut — onChange closure'ı her zaman güncel hedefi görsün
    const targetRef = useRef<CodeTarget>(target);
    targetRef.current = target;
    const cursorMoveCb = useRef(onCursorMove);
    cursorMoveCb.current = onCursorMove;
    /** Şu an bir blok sürükleniyor mu — Live Share için pull'u durdurmak gerek */
    const isDraggingRef = useRef(false);
    /**
     * Remote state uygulanırken (Live Share) true. Bu sırada Blockly'nin
     * fırlattığı change event'leri "kullanıcı düzenlemesi" sayılmaz —
     * notifyLocalChange çağrılmaz. Echo loop'u (remote→load→change→push→remote)
     * kökten keser. Zaman bazlı değil, sayaç bazlı: loadState set eder,
     * event kuyruğu boşalınca temizlenir.
     */
    const applyingRemoteRef = useRef(false);

    useEffect(() => {
      if (!divRef.current) return;

      const parser = new DOMParser();
      const toolboxDoc = parser.parseFromString(toolboxXml, 'text/xml');
      const toolbox = toolboxDoc.documentElement;

      const ws = Blockly.inject(divRef.current, {
        toolbox,
        theme: buildBlocklyTheme(theme),
        media: 'blockly-media/',
        renderer: 'zelos',
        grid: { spacing: 28, length: 2, colour: theme.blockly.grid, snap: true },
        zoom: {
          controls: true,
          // wheel: false — touchpad/fare tekerleği YUKARI/AŞAĞI hareketi artık
          // zoom değil kaydırma yapsın. Zoom için sağ alttaki +/- butonları
          // veya Ctrl/Cmd basılıyken tekerlek kullanılır (Blockly bunu otomatik
          // halleder — move.wheel true iken Ctrl+wheel hâlâ zoom yapar).
          wheel: false,
          startScale: 0.9,
          maxScale: 2,
          minScale: 0.4,
          scaleSpeed: 1.2,
          pinch: true,
        },
        trashcan: true,
        // wheel: true — touchpad ile her yöne (yukarı/aşağı/sağ/sol) kaydırma.
        move: { scrollbars: true, drag: true, wheel: true },
        sounds: false,
      });

      wsRef.current = ws;
      multiselectRef.current = new SimpleMultiselect(ws);

      // Daha önce loadState ile bir proje yüklenmişse (StrictMode 2x
      // mount, ya da loadState init'ten önce çağrıldıysa) onu geri yükle.
      // Yoksa boş workspace + başlangıç bloğu.
      if (pendingStateRef.current) {
        try {
          Blockly.serialization.workspaces.load(pendingStateRef.current, ws);
          if (!hasStartBlock(ws)) addStartBlock(ws);
          console.log('[Blockly] init — bekleyen state yüklendi, blok sayısı:',
            ws.getAllBlocks(false).length);
        } catch (e) {
          console.error('[Blockly] init — bekleyen state yükleme hatası:', e);
          addStartBlock(ws);
        }
      } else {
        addStartBlock(ws);
      }

      const onChange = (event: Blockly.Events.Abstract) => {
        try {
          const code = generateForTarget(targetRef.current, ws);
          onCodeChange(code);
        } catch (e) {
          console.error('Kod üretim hatası:', e);
        }
        // Remote state uygulanıyorsa bu event kullanıcıdan değil — push tetikleme.
        if (event && !event.isUiEvent && !applyingRemoteRef.current && userEditCb.current) {
          userEditCb.current();
        }

        // Emniyet: birden fazla başlangıç bloğu olmamalı. Bir şekilde ikinci
        // bir rx_on_start belirirse (kopyala-yapıştır, eski proje yükleme),
        // fazlasını sil — sadece ilki kalır.
        if (event && event.type === Blockly.Events.BLOCK_CREATE) {
          const starts = ws.getAllBlocks(false).filter((b) => b.type === 'rx_on_start');
          if (starts.length > 1) {
            // İlkini koru, sonrakileri sil
            for (let i = 1; i < starts.length; i++) {
              try { starts[i].dispose(false); } catch {}
            }
          }
        }

        // Drag bittikten sonra "replaceable" / "connectionTarget" görsel artıklarını temizle.
        // Blockly bazen drop sonrası bu class'ları temizlemiyor, blok bıraktığında
        // hala turuncu border kalıyor. Multi-timeout: Blockly internal işlemleri
        // bittikten sonra son temizlik garantisi.
        if (event && (
          event.type === Blockly.Events.BLOCK_DRAG ||
          event.type === Blockly.Events.BLOCK_MOVE
        )) {
          const isDragEnd = event.type === Blockly.Events.BLOCK_DRAG
            ? !(event as Blockly.Events.BlockDrag).isStart
            : true; // BLOCK_MOVE her zaman drop sonrası tetiklenir
          // isDraggingRef güncelle — Live Share için kritik
          if (event.type === Blockly.Events.BLOCK_DRAG) {
            isDraggingRef.current = !!(event as Blockly.Events.BlockDrag).isStart;
          }
          if (isDragEnd) {
            isDraggingRef.current = false;
            scheduleDragEndCleanup();
          }
        }
      };
      ws.addChangeListener(onChange);
      onChange(new Blockly.Events.Click(null) as Blockly.Events.Abstract);

      // ResizeObserver
      const ro = new ResizeObserver(() => {
        if (wsRef.current) Blockly.svgResize(wsRef.current);
      });
      ro.observe(divRef.current);

      // Mouse tracking — Live Share için
      const hostDiv = divRef.current;
      const onMouseMove = (e: MouseEvent) => {
        if (!cursorMoveCb.current) return;
        const rect = hostDiv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        cursorMoveCb.current(x, y);
      };
      const onMouseLeave = () => {
        if (cursorMoveCb.current) {
          // Cursor div dışına çıktı — peer'lerden gizle (negatif koordinat = hidden)
          cursorMoveCb.current(-9999, -9999);
        }
      };
      hostDiv.addEventListener('mousemove', onMouseMove);
      hostDiv.addEventListener('mouseleave', onMouseLeave);

      /**
       * Trackpad iki parmak pinch-zoom.
       *
       * Mac trackpad'de iki parmakla büyütme/küçültme, tarayıcıya
       * `wheel` event'i olarak `ctrlKey: true` ile gelir. Blockly'nin
       * yerleşik `zoom.wheel` özelliği bunu kapalı (normal kaydırma
       * için), bu yüzden pinch'i biz yakalayıp manuel zoom uyguluyoruz.
       * Normal kaydırma (ctrlKey yok) Blockly'ye dokunmadan geçer.
       */
      const onWheelZoom = (e: WheelEvent) => {
        if (!e.ctrlKey) return; // pinch değil — normal kaydırma, dokunma
        e.preventDefault();
        const wsv = wsRef.current;
        if (!wsv) return;
        // deltaY negatif → büyüt, pozitif → küçült.
        // 0.03 katsayı — pinch hareketine hızlı, akıcı tepki.
        const amount = -e.deltaY * 0.03;
        // Zoom'u imlecin olduğu noktaya göre yap
        const rect = hostDiv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        wsv.zoom(x, y, amount);
      };
      // passive: false — preventDefault çalışsın (tarayıcı sayfa zoom'unu engelle)
      hostDiv.addEventListener('wheel', onWheelZoom, { passive: false });

      /**
       * Drop sonrası kalan turuncu border'ları temizler.
       *
       * Strateji: Multi-timeout. Blockly internal'inde drop tamamlanması birkaç
       * frame sürer. Tek setTimeout(0) bazen Blockly class eklemesinden ÖNCE
       * çalışıyor → bizim cleanup boşa gidiyor → Blockly sonradan class ekliyor →
       * görsel artık kalıyor. Birden fazla zamanda tarayarak garanti ediyoruz.
       */
      const performCleanup = () => {
        const host = divRef.current;
        if (!host) return;

        // DOM seviyesinde kalan vurgu class'larını temizle (drag artıkları)
        const classes = [
          'blocklyReplaceable',
          'blocklyConnectionTarget',
          'blocklyHighlightedConnectionPath',
          'blocklyDropDownDiv',
        ];
        host.querySelectorAll(
          '.blocklyReplaceable, .blocklyConnectionTarget, .blocklyHighlightedConnectionPath'
        ).forEach((el) => {
          classes.forEach((c) => el.classList.remove(c));
        });
      };

      /**
       * Drag bittikten sonra ÖZEL cleanup — selection da temizlenir.
       * Çünkü Blockly drag sonrası bloğu seçili bırakıyor; theme'imizdeki
       * selected_glow_color (turuncu) yüzünden seçili kalan blok turuncu
       * border + yazı vurgusu gösterir. Selection temizleyince kaybolur.
       *
       * Normal click'lerde selection'a dokunmuyoruz — sadece drag/drop sonrası.
       */
      const performDragEndCleanup = () => {
        // 1. Selection temizle — turuncu border + yazı vurgusunu kaldırır
        try {
          Blockly.common.setSelected(null);
        } catch {}

        // 2. Multi-select selection'ını temizle (varsa)
        try {
          multiselectRef.current?.clearSelection();
        } catch {}

        // 3. DOM seviyesinde selected class'ı manuel kaldır (emniyet)
        const host = divRef.current;
        if (host) {
          host.querySelectorAll('.blocklySelected').forEach((el) => {
            el.classList.remove('blocklySelected');
          });
        }

        // 4. Genel cleanup'ı da çalıştır
        performCleanup();
      };

      const scheduleArtifactCleanup = () => {
        setTimeout(performCleanup, 0);
        setTimeout(performCleanup, 50);
        setTimeout(performCleanup, 200);
        setTimeout(performCleanup, 500);
      };

      /** Drag bitince — selection clear DAHİL emniyet zinciri */
      const scheduleDragEndCleanup = () => {
        setTimeout(performDragEndCleanup, 0);
        setTimeout(performDragEndCleanup, 50);
        setTimeout(performDragEndCleanup, 200);
        setTimeout(performDragEndCleanup, 500);
      };

      // Global mouseup safety net — ESC iptal, dışarı bırakma vs için
      // (Selection'a DOKUNMAZ — sadece DOM class artıkları temizler)
      const onGlobalMouseUp = () => {
        scheduleArtifactCleanup();
      };
      document.addEventListener('mouseup', onGlobalMouseUp);

      return () => {
        document.removeEventListener('mouseup', onGlobalMouseUp);
        hostDiv.removeEventListener('mousemove', onMouseMove);
        hostDiv.removeEventListener('mouseleave', onMouseLeave);
        hostDiv.removeEventListener('wheel', onWheelZoom);
        ro.disconnect();
        multiselectRef.current?.destroy();
        multiselectRef.current = null;
        ws.dispose();
        wsRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const ws = wsRef.current;
      if (!ws) return;
      ws.setTheme(buildBlocklyTheme(theme));
      Blockly.svgResize(ws);

      // Başlangıç bloğunun ikonunu temaya göre güncelle:
      // kahraman temasında temanın PNG'si, normal temada şimşek.
      try {
        const startBlock = ws.getAllBlocks(false).find((b) => b.type === 'rx_on_start');
        if (startBlock) {
          const iconField = startBlock.getField('START_ICON') as Blockly.FieldImage | null;
          if (iconField) {
            if (theme.image) {
              // Temanın kendi PNG'si — public/themes/<id>.png
              iconField.setValue(`${import.meta.env.BASE_URL}${theme.image}`);
            } else {
              // PNG'siz tema (Galaxy Orange) — şimşek ikonu
              iconField.setValue(BOLT_ICON_URI);
            }
          }
        }
      } catch (e) {
        console.warn('Başlangıç ikonu güncellenemedi:', e);
      }
    }, [theme]);

    useImperativeHandle(ref, () => ({
      saveState: () => {
        const ws = wsRef.current;
        if (!ws) return null;
        return Blockly.serialization.workspaces.save(ws);
      },
      loadState: (state: object) => {
        const ws = wsRef.current;
        if (!state) {
          console.warn('[Blockly] loadState — state boş, atlanıyor');
          return;
        }
        // State'i hatırla — Blockly yeniden mount olursa (StrictMode)
        // init effect'i bu state'i otomatik geri yükler.
        pendingStateRef.current = state;
        if (!ws) {
          return;
        }
        try {
          multiselectRef.current?.clearSelection();
          ws.clear();
          Blockly.serialization.workspaces.load(state, ws);
          if (!hasStartBlock(ws)) addStartBlock(ws);
          console.log('[Blockly] loadState tamam — blok sayısı:',
            ws.getAllBlocks(false).length);
        } catch (e) {
          console.error('Workspace yükleme hatası:', e);
        }
      },
      applyRemoteState: (state: object) => {
        const ws = wsRef.current;
        if (!state || !ws) return;
        pendingStateRef.current = state;
        // Echo loop'u kes: bu blokta gelecek tüm change event'leri
        // "kullanıcı düzenlemesi" SAYILMAZ. Flag'i event kuyruğu
        // tamamen boşalana kadar açık tut (rAF + timeout güvenli pencere).
        applyingRemoteRef.current = true;
        try {
          // Remote uygularken viewport'u koru — scroll sıçramasın
          const scrollX = ws.scrollX;
          const scrollY = ws.scrollY;
          Blockly.Events.disable();   // event'leri tamamen bastır (en güçlü)
          try {
            ws.clear();
            Blockly.serialization.workspaces.load(state, ws);
            if (!hasStartBlock(ws)) addStartBlock(ws);
          } finally {
            Blockly.Events.enable();
          }
          // Viewport'u geri koy
          try { ws.scroll(scrollX, scrollY); } catch {}
          // Kod önizlemesini güncelle (event bastırıldığı için manuel)
          try { onCodeChange(generateForTarget(targetRef.current, ws)); } catch {}
        } catch (e) {
          console.error('[Blockly] applyRemoteState HATA:', e);
        } finally {
          // Event kuyruğu boşalınca flag'i kapat — birden çok aşama:
          // rAF (render) + kısa timeout (Blockly internal async).
          requestAnimationFrame(() => {
            window.setTimeout(() => { applyingRemoteRef.current = false; }, 50);
          });
        }
      },
      resetToEmpty: () => {
        const ws = wsRef.current;
        // Yeni boş proje — bekleyen state'i temizle
        pendingStateRef.current = null;
        if (!ws) return;
        multiselectRef.current?.clearSelection();
        ws.clear();
        addStartBlock(ws);
      },
      resize: () => {
        const ws = wsRef.current;
        if (ws) Blockly.svgResize(ws);
      },
      isDragging: () => isDraggingRef.current,
      regenerate: () => {
        const ws = wsRef.current;
        if (!ws) return;
        try { onCodeChange(generateForTarget(targetRef.current, ws)); } catch {}
      },
      addBlocks: (blockTypes: string[]) => {
        const ws = wsRef.current;
        if (!ws || blockTypes.length === 0) return;
        try {
          // Toolbox XML'inden her blok tipinin TAM tanımını bul (shadow dahil)
          const parser = new DOMParser();
          const tbDoc = parser.parseFromString(toolboxXml, 'text/xml');
          const allBlockEls = Array.from(tbDoc.querySelectorAll('block'));

          // YERLEŞTİRME: görünür alanın sol-üstünden sabit bir noktadan başla.
          // "En alttaki bloğu bul" yöntemi Y kaymasına yol açıyordu (ekle-sil-ekle
          // yapınca blok gittikçe aşağı iniyordu). Bunun yerine: ekranın sol-üst
          // köşesine yakın, mevcut bloklarla çakışmayan ilk boş satıra koy.
          const metrics = ws.getMetricsManager().getViewMetrics();
          const scale = ws.scale || 1;
          // Görünür alanın workspace-koordinat sol-üstü
          const viewLeft = metrics.left / scale;
          const viewTop = metrics.top / scale;
          let baseX = viewLeft + 40;
          let y = viewTop + 40;

          // Mevcut blokların kapladığı dikey aralıkları topla — çakışma olmasın
          const occupied: Array<[number, number]> = [];
          ws.getTopBlocks(false).forEach((b) => {
            const xy = b.getRelativeToSurfaceXY();
            const h = b.getHeightWidth().height;
            occupied.push([xy.y, xy.y + h]);
          });
          // y'yi boş bir noktaya it — herhangi bir blokla üst üste binmesin
          const overlaps = (top: number, bottom: number) =>
            occupied.some(([t, b]) => top < b && bottom > t);
          let guard = 0;
          while (overlaps(y, y + 60) && guard < 200) {
            y += 70;
            guard++;
          }

          blockTypes.forEach((type) => {
            const tbBlock = allBlockEls.find((el) => el.getAttribute('type') === type);
            let block: Blockly.BlockSvg | null = null;
            try {
              if (tbBlock) {
                block = Blockly.Xml.domToBlock(tbBlock as Element, ws) as Blockly.BlockSvg;
              } else {
                block = ws.newBlock(type) as Blockly.BlockSvg;
                block.initSvg();
                block.render();
              }
              if (block) {
                const xy = block.getRelativeToSurfaceXY();
                block.moveBy(baseX - xy.x, y - xy.y);
                const h = block.getHeightWidth().height;
                occupied.push([y, y + h]);
                y += h + 18;
              }
            } catch (e) {
              console.warn('Blok eklenemedi:', type, e);
            }
          });
          ws.render();
        } catch (e) {
          console.error('addBlocks hatası:', e);
        }
      },
      clearAllExceptStart: () => {
        const ws = wsRef.current;
        if (!ws) return;
        try {
          multiselectRef.current?.clearSelection();
          // Başlangıç bloğu HARİÇ tüm üst-seviye blokları sil
          const topBlocks = ws.getTopBlocks(false);
          topBlocks.forEach((b) => {
            if (b.type !== 'rx_on_start') {
              b.dispose(false);
            }
          });
          // Başlangıç bloğu yoksa ekle (emniyet)
          if (!hasStartBlock(ws)) addStartBlock(ws);
          ws.render();
        } catch (e) {
          console.error('clearAllExceptStart hatası:', e);
        }
      },
      setToolboxEnabled: (enabled: boolean) => {
        const ws = wsRef.current;
        if (!ws) return;
        try {
          if (enabled) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(toolboxXml, 'text/xml');
            ws.updateToolbox(doc.documentElement);
          } else {
            ws.updateToolbox('<xml id="empty"></xml>');
          }
        } catch (e) {
          console.warn('Toolbox toggle failed:', e);
        }
      },
    }));

    return (
      <div className="blockly-wrapper">
        <div ref={divRef} className="blockly-host" />
        <div ref={cursorLayerRef} className="peer-cursor-layer" aria-hidden="true">
          {peerCursors?.map((p) =>
            p.x < 0 || p.y < 0 ? null : (
              <div
                key={p.clientId}
                className="peer-cursor"
                style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
              >
                <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                  <path
                    d="M2 2 L2 17 L6 13 L9 19 L12 18 L9 12 L15 12 Z"
                    fill="currentColor"
                    stroke="#fff"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="peer-cursor-name">{p.name}</span>
              </div>
            )
          )}
        </div>
      </div>
    );
  }
);

function addStartBlock(ws: Blockly.WorkspaceSvg) {
  const startBlock = ws.newBlock('rx_on_start');
  startBlock.initSvg();
  startBlock.render();
  startBlock.moveBy(50, 50);
}

function hasStartBlock(ws: Blockly.WorkspaceSvg): boolean {
  return ws.getAllBlocks(false).some((b) => b.type === 'rx_on_start');
}
