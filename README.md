# OCST BİLGİ SİSTEMLERİ — KURULUM REHBERİ

## DOSYA YAPISI

```
ocst-desktop/
├── server.js              ← Ana sunucu
├── package.json
├── data/                  ← Veriler (otomatik oluşur)
│   ├── topics.json
│   └── comments.json
├── public/                ← Masaüstü arayüzü
│   ├── index.html
│   ├── desktop.css
│   └── desktop.js
└── arsiv-public/          ← Arşiv uygulaması (iframe)
    ├── index.html
    ├── style.css
    └── app.js
```

## KURULUM

```
npm install
npm start
```

Tarayıcıda: http://localhost:3000

## GİRİŞ BİLGİLERİ

- Kullanıcı Adı: istediğin herhangi bir ad
- Şifre: OCSTARŞİV2020
- Silme Şifresi: 080808

## GitHub'a Yükleme

```
git add .
git commit -m "masaustu guncelleme"
git push
```

Railway otomatik deploy eder.
