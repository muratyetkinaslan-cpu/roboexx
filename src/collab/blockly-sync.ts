import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { BlocklyWorkspaceHandle } from '../components/BlocklyWorkspace';

/**
 * Blockly workspace state'i ile Yjs doc arasındaki köprü — iki yönlü.
 *
 * Faz 4 — VERİ KAYBI KORUMALI:
 *   Eski sürümde öğretmen bir öğrencinin odasına bağlanırken workspace önce
 *   boşaltılıyor (resetToEmpty), bunun tetiklediği Blockly event'leri 400ms
 *   sonra BOŞ workspace'i Yjs'e push ediyordu. Sunucu senkronizasyonu bu
 *   400ms'den uzun sürerse (okul Wi-Fi'ı!) boş push öğrencinin kodunu
 *   SİLİYORDU. Artık:
 *
 *   1. READY KAPISI: İlk sunucu senkronizasyonu tamamlanıp odadaki mevcut
 *      state Blockly'ye uygulanana kadar HİÇBİR push kabul edilmez.
 *      Bağlanma anındaki tüm yerel Blockly event'leri (resetToEmpty dahil)
 *      sessizce yutulur.
 *   2. SAHİP TOHUMLAMASI: Oda dokümanı boşsa yalnızca odanın SAHİBİ
 *      (kendi odasındaki öğrenci) yerel state'ini tohum olarak push eder.
 *      Öğretmen (misafir) boş bir odaya asla otomatik push yapmaz.
 *   3. Senkron olayı bridge'in İÇİNDE dinlenir — bridge, provider sync'ten
 *      önce de sonra da kurulmuş olsa akış aynı çalışır (eski App effect'i
 *      bridge geç kurulunca hiç tetiklenmiyordu → kayıp/yarış).
 *
 *   Echo prevention: applyRemoteState içinde Blockly.Events.disable()
 *   ile remote yükleme sırasındaki event'ler tamamen bastırılır; ayrıca
 *   BlocklyWorkspace applyingRemoteRef ile notifyLocalChange'i susturur.
 *   lastStateJson: aynı JSON tekrar push edilmez (dedup).
 *
 * Çakışma çözümü: Last-Write-Wins (LWW). İki kişi aynı anda edit ederse
 * sonraki push öncekini override eder — sıralı sınıf kullanımı için OK.
 */

const LOCAL_ORIGIN = Symbol('local');

interface BridgeOptions {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  blocklyHandle: BlocklyWorkspaceHandle;
  /**
   * Bu workspace odası bana mı ait? (öğrenci kendi odasında → true,
   * öğretmen bir öğrencinin odasında → false)
   */
  isOwner: boolean;
}

export interface BlocklyYjsBridge {
  /** Blockly tarafında değişiklik oldu — push'u throttled tetikle */
  notifyLocalChange: () => void;
  /** Hemen push (ready değilse sessizce yoksayılır) */
  pushNow: () => void;
  /** Yjs'ten state'i hemen oku ve Blockly'ye uygula */
  pullNow: () => void;
  /** İlk senkron + state uygulaması tamamlandı mı? */
  isReady: () => boolean;
  dispose: () => void;
}

export function createBlocklyYjsBridge(opts: BridgeOptions): BlocklyYjsBridge {
  const { ydoc, provider, blocklyHandle, isOwner } = opts;
  const wsMap = ydoc.getMap<string>('workspace');

  let pushTimer: number | null = null;
  let lastStateJson: string | null = null;
  /** Drag sırasında remote update gelirse beklet — drag bitince uygula */
  let pendingPull: string | null = null;
  let dragWatcher: number | null = null;
  /**
   * İlk senkron tamamlanıp odadaki state uygulanana kadar false.
   * false iken push YASAK — bağlanma anındaki boş/yarım local state
   * asla odadaki gerçek kodu ezemez.
   */
  let ready = false;
  let disposed = false;

  const pushNow = () => {
    if (disposed) return;
    // READY KAPISI: ilk senkron bitmeden push yok — veri kaybı koruması.
    if (!ready) {
      return;
    }
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
    if (disposed || !ready) return; // senkron öncesi event'ler yutulur
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
    if (disposed) return;
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

  /**
   * İlk senkron tamamlandı — odadaki state'i uygula, gerekiyorsa tohumla,
   * sonra push kapısını aç.
   */
  const handleInitialSync = () => {
    if (disposed || ready) return;
    const json = wsMap.get('blocks');
    if (json) {
      // Odada zaten kod var (öğrencinin çalışması) → Blockly'ye yükle.
      // lastStateJson'ı da set eder → hemen ardından gelen dedup'lı
      // push'lar odadaki kodu ezmez.
      applyRemoteState(json);
    } else if (isOwner) {
      // Oda boş ve oda BENİM → yerel state'imi tohum olarak yaz.
      // (Öğretmen misafir olduğu odayı asla tohumlamaz.)
      const state = blocklyHandle.saveState();
      if (state) {
        const seed = JSON.stringify(state);
        lastStateJson = seed;
        ydoc.transact(() => {
          wsMap.set('blocks', seed);
        }, LOCAL_ORIGIN);
      }
    }
    ready = true;
    console.log('[BlocklySync] ilk senkron tamam — ready, sahip:', isOwner,
      'odada kod var mı:', !!json);
  };

  const onSync = (synced: boolean) => {
    if (synced) handleInitialSync();
  };

  const observer = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;
    if (!event.changes.keys.has('blocks')) return;
    // İlk senkron sırasında gelen update'ler handleInitialSync'te işlenir;
    // ready olduktan sonra normal canlı pull.
    if (!ready) return;
    pullNow();
  };

  wsMap.observe(observer);
  provider.on('sync', onSync);
  // Bridge, provider senkron OLDUKTAN sonra kurulmuş olabilir (Blockly'nin
  // hazır olmasını bekleyen retry döngüsü yüzünden). Bu durumda 'sync'
  // event'i bir daha gelmez — mevcut durumu hemen işle.
  if (provider.synced) {
    handleInitialSync();
  }

  return {
    notifyLocalChange,
    pushNow,
    pullNow,
    isReady: () => ready,
    dispose: () => {
      disposed = true;
      ready = false;
      if (pushTimer !== null) window.clearTimeout(pushTimer);
      if (dragWatcher !== null) window.clearInterval(dragWatcher);
      try { provider.off('sync', onSync); } catch {}
      try { wsMap.unobserve(observer); } catch {}
    },
  };
}
