# OCST BİLGİ SİSTEMLERİ v4.1 — Kurulum

## Dosya Yapısı

```
ocst/
├── server.js              ← Ana sunucu
├── package.json
├── data/                  ← Otomatik oluşur (topics, comments, calls)
├── public/                ← Masaüstü arayüzü (ana sayfa)
│   ├── index.html
│   ├── desktop.js
│   ├── desktop.css
│   ├── app.js             ← Arşiv JS (hem /arsiv hem public'ten erişilir)
│   └── style.css          ← Arşiv CSS
└── arsiv-public/          ← Arşiv uygulaması (iframe içinde açılır)
    └── index.html
```

## Kurulum

```bash
npm install
npm start
```

Sunucu http://localhost:3000 adresinde başlar.

## Değişiklikler v4.1

### Düzeltmeler
- ✅ CAD durum butonları (Bekliyor/Yanıtlandı/Kapatıldı) artık çalışıyor
- ✅ Çağrı silme butonu çalışıyor (şifre ile doğrulama)
- ✅ Panik tray uyarısı, çağrı okunduktan/seçildikten sonra güncelleniyor
- ✅ Arşiv iframe reload döngüsü düzeltildi (5-6 saniyede bir yenilenme gitti)
- ✅ Arşiv logout artık location.reload() değil, sayfa içi geçiş yapıyor

### Yeni Özellikler
- ✅ Aktif Personel sistemi (giriş yapanlar otomatik eklenir, çıkışta silinir)
- ✅ "Personel" masaüstü uygulaması (aktif kullanıcılar, son aktivite, durum)
- ✅ CAD sağ panel artık gerçek kullanıcıları gösteriyor (MÜSAİT/MEŞGUL)
- ✅ Çağrıya personel atama (ATAMA YAP butonu, açılır liste)
- ✅ Atama kaldırma özelliği
- ✅ Çağrı detayında Leaflet haritası (OpenStreetMap, API key gerektirmez)
- ✅ Kırmızı blip marker ile konum gösterimi
- ✅ Normal çağrılar için farklı ses tonu
- ✅ Çağrı not/log sistemi (durum değişikliklerini kaydeder)
- ✅ Heartbeat sistemi (personel aktifliği sunucuya bildirilir)
