import * as Y from 'yjs';
import type { BlocklyWorkspaceHandle } from '../components/BlocklyWorkspace';

/**
 * Blockly workspace state'i ile Yjs doc arasındaki köprü — iki yönlü.
 *
 * Faz 2:
 *   - HOST/OBSERVER YOK. Herkes hem push hem pull yapar.
 *   - Echo prevention: applyRemoteState içinde Blockly.Events.disable()
 *     ile remote yükleme sırasındaki event'ler tamamen bastırılır; ayrıca
 *     BlocklyWorkspace applyingRemoteRef ile notifyLocalChange'i susturur.
 *   - lastStateJson: aynı JSON tekrar push edilmez (dedup).
 *   - Yjs transaction origin: kendi push'umuzu kendi observer'ımız algılarsa
 *     skip eder (ekstra emniyet).
 *
 * Çakışma çözümü (Faz 2):
 *   Last-Write-Wins (LWW). İki kişi aynı anda 250ms içinde edit ederse,
 *   sonraki push öncekini override eder. Pratikte sıralı düzenleme için OK.
 *   Faz 3: block-level Y.Map ile gerçek CRDT merge.
 */

const LOCAL_ORIGIN = Symbol('local');

interface BridgeOptions {
  ydoc: Y.Doc;
  blocklyHandle: BlocklyWorkspaceHandle;
}

export interface BlocklyYjsBridge {
  /** Blockly tarafında değişiklik oldu — push'u throttled tetikle */
  notifyLocalChange: () => void;
  /** Hemen push (initial sync sonrası ilk kez gönderim için) */
  pushNow: () => void;
  /** Yjs'ten state'i hemen oku ve Blockly'ye uygula (initial sync sonrası) */
  pullNow: () => void;
  dispose: () => void;
}

export function createBlocklyYjsBridge(opts: BridgeOptions): BlocklyYjsBridge {
  const { ydoc, blocklyHandle } = opts;
  const wsMap = ydoc.getMap<string>('workspace');


  let pushTimer: number | null = null;
  let lastStateJson: string | null = null;
  /** Drag sırasında remote update gelirse beklet — drag bitince uygula */
  let pendingPull: string | null = null;
  let dragWatcher: number | null = null;

  const pushNow = () => {
    // Drag sırasında push yapma — yarım blok hareketi karşıya gitmesin
    if (blocklyHandle.isDragging && blocklyHandle.isDragging()) {
      return;
    }
    const state = blocklyHandle.saveState();
    if (!state) {
      return;
    }
    const json = JSON.stringify(state);
    if (json === lastStateJson) {
      return;
    }
    lastStateJson = json;
    ydoc.transact(() => {
      wsMap.set('blocks', json);
    }, LOCAL_ORIGIN);
  };

  const notifyLocalChange = () => {
    if (pushTimer !== null) window.clearTimeout(pushTimer);
    // 400ms debounce — hızlı ardışık edit'leri tek push'ta birleştir,
    // çok kullanıcıda çakışma penceresini daralt.
    pushTimer = window.setTimeout(pushNow, 400);
  };

  const applyRemoteState = (json: string) => {
    if (json === lastStateJson) return;
    lastStateJson = json;
    try {
      // applyRemoteState event'leri bastırır → echo loop olmaz.
      blocklyHandle.applyRemoteState(JSON.parse(json));
    } catch (e) {
      console.error('[BlocklySync] applyRemoteState HATA:', e);
    }
  };

  const pullNow = () => {
    const json = wsMap.get('blocks');
    if (!json) {
      return;
    }
    // Drag sırasında uygulama — drag bitince retry et
    if (blocklyHandle.isDragging && blocklyHandle.isDragging()) {
      pendingPull = json;
      // Drag bitti mi kontrol için poll başlat (zaten varsa atla)
      if (dragWatcher === null) {
        dragWatcher = window.setInterval(() => {
          if (!blocklyHandle.isDragging || !blocklyHandle.isDragging()) {
            if (dragWatcher !== null) {
              window.clearInterval(dragWatcher);
              dragWatcher = null;
            }
            if (pendingPull !== null) {
              const p = pendingPull;
              pendingPull = null;
              applyRemoteState(p);
            }
          }
        }, 100);
      }
      return;
    }
    if (json === lastStateJson) {
      return;
    }
    applyRemoteState(json);
  };

  const observer = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;
    if (!event.changes.keys.has('blocks')) return;
    pullNow();
  };

  wsMap.observe(observer);

  return {
    notifyLocalChange,
    pushNow,
    pullNow,
    dispose: () => {
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      if (dragWatcher !== null) window.clearInterval(dragWatcher);
      wsMap.unobserve(observer);
    },
  };
}
