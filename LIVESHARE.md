# Canlı Paylaşım — Faz 1

VS Code Live Share tarzı, **gerçek zamanlı workspace izleme**.

## Mimari

- **Sunucu:** `y-websocket` — küçük bir Node WebSocket sunucusu, ücretsiz npm paketi
- **Sync:** Yjs CRDT — Blockly workspace state'i tek anahtar olarak push/pull
- **Roller:** İlk giren **host**, sonrakiler **observer**. Host yazar, observer izler.
- **Bağlantı:** URL'de `?room=abc123` parametresi. Paylaş → katıl.

## Faz 1 ne içeriyor

✅ Host'un Blockly workspace değişiklikleri observer'a anında yansır  
✅ "Canlı Paylaşım" butonu → otomatik oda + paylaşılabilir URL  
✅ Üst bant → bağlantı durumu, kim host, kaç kişi  
✅ Observer'da toolbox gizlenir (yeni blok ekleyemez, izleyici modu)  
✅ Aynı odaya birden fazla observer aynı anda katılabilir  

❌ Cursor/seçim sync (Faz 2)  
❌ Take over — observer kontrolü alabilsin (Faz 3)  
❌ Sınıf paneli (Faz 2)  
❌ Pico W komut iletme (Faz 3)  
❌ Sohbet, ses (sonra)

## Kurulum & Çalıştırma

```bash
# 1. Bağımlılıkları yükle (yjs, y-websocket eklendi)
npm install

# 2. Yeni terminal aç — collab sunucusunu başlat
npm run collab
# → "Listening on port 1234" görmeli

# 3. Başka bir terminalde uygulamayı çalıştır
npm run dev
# → http://localhost:5173 açılır
```

İki terminal birden çalışmalı: biri `npm run collab` (port 1234), diğeri `npm run dev` (port 5173).

## Kullanım

### Host olarak (öğretmen / sunan):

1. `http://localhost:5173` aç
2. Sağ üstte **Canlı Paylaşım** butonuna tıkla
3. URL otomatik değişir: `http://localhost:5173/?room=xyz789`
4. Üst bantta **Bağlantıyı kopyala** butonuna tıkla
5. Bu linki öğrencilere gönder (yerel ağdaysa direkt yapıştır, aynı ağda olmasa bile localhost test için tek bilgisayarda 2 sekme aç)
6. Bloklarla oyna → öğrencilerde anında görünür

### Observer olarak (öğrenci / izleyen):

1. Paylaşılan URL'i aç (örn: `http://localhost:5173/?room=xyz789`)
2. Otomatik bağlanır, **İZLEME MODU** çubuğu görünür
3. Host'un workspace'i ekrana yansır
4. Toolbox gizli — yeni blok ekleyemezsin, sadece izlersin
5. Çıkış: üst banttaki **Çık** butonu

## Test senaryosu (tek bilgisayarda)

1. `npm run collab` çalışıyor
2. `npm run dev` çalışıyor
3. Chrome'da **iki ayrı sekme** aç:
   - Sekme A: `http://localhost:5173` → host olur, bir blok sürükle
   - Sekme B: URL'i sekme A'dan kopyala (`?room=...` dahil), yapıştır
4. Sekme A'daki bloklar Sekme B'de anında görünmeli
5. Sekme A'da yeni blok ekle, Sekme B'de anlık güncellenmeli

## Notlar / Bilinen sınırlar

- **localhost:1234 sabit.** Production'da değiştirmek için: `window.__ROBOEXX_COLLAB_URL__ = 'wss://your-server.com'` (uygulama başlamadan önce, örneğin `index.html`'de).
- **Host ayrılırsa**: Geri kalan observer'lar arasında en eski katılan host olur. Tamamen boşalan oda silinmez (Yjs bellek tutar), aynı `?room=` ile geri dönülebilir.
- **Çok büyük workspace** (>500 blok): Her değişiklikte tüm state JSON push edildiği için yavaşlayabilir. Faz 2'de block-level CRDT ile çözülecek.
- **Web Serial bağlantıları yerel kalır.** Host'un Pico'su sadece host'ta çalışır. Observer aynı kodu kendi Pico'sunda görür ama "Çalıştır"/"Yükle" sadece host tarafında işler. (Faz 3'te öğretmen komutu öğrencide tetikletebilir.)
- **Aynı ağdaki başka bilgisayarlardan bağlanmak için**: `npm run collab` yerine `WS_HOST=0.0.0.0 npm run collab` ve `npm run dev` yerine `npm run dev -- --host` (Vite). Sonra ana bilgisayarın LAN IP'sini (192.168.x.x) URL'de kullan.

## Sıkıntı çıkarsa

- **"Bağlanılıyor…" takılı kalıyor**: `npm run collab` çalışıyor mu? Port 1234 başka şey tarafından kullanılıyor mu?
- **Observer bloğu göremiyor**: Sekme A önce açıldı, blokları ekledi, sonra Sekme B açıldı senaryosunda state baştan sync olmuyorsa: Console'da hata var mı bak.
- **Konsola** F12 → Console — Yjs/WebSocket hataları orada görünür.
