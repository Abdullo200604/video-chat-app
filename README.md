<div align="center">

# 🎙️ PDP Chat

**Zamonaviy, real-vaqt video-konferensiya va o'yinlar platformasi**

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black?style=flat-square&logo=socket.io)](https://socket.io)
[![PeerJS](https://img.shields.io/badge/PeerJS-WebRTC-0078D7?style=flat-square)](https://peerjs.com)
[![SQLite](https://img.shields.io/badge/Database-SQLite3-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[🌐 Live Demo](https://chat.pdpedu.uz) · [🐛 Bug Report](https://github.com/Abdullo200604/video-chat-app/issues) · [✨ Feature Request](https://github.com/Abdullo200604/video-chat-app/issues)

</div>

---

## ✨ Imkoniyatlar

### 🎥 Video Majlis
- **HD Video & Audio** — WebRTC orqali foydalanuvchilar o'rtasida to'g'ridan-to'g'ri aloqa
- **Ekran ulashish** — ixtiyoriy dastur yoki butun ekranni ulashish
- **Video effektlar** — blur, sepia, grayscale va boshqalar
- **Maxfiy suhbat** — end-to-end darajasidagi xavfsizlik va blur effektlar
- **Yozib olish** — majlisni WebM formatida yuklab olish

### 🎲 O'yinlar Markazi (Multiplayer Games) _(Yangi!)_
- **6 xil multipleyer o'yin**:
  - **Tic-Tac-Toe** (X/O)
  - **Tosh, Qaychi, Qog'oz** (RPS)
  - **Multiplayer Iloncha** (Snake)
  - **Sodda Shaxmat** (Simple Chess)
  - **Ludo** (Pochchi)
  - **Dengiz jangi** (Battleship)
- **Leaderboard (Peshqadamlar)** — har bir o'yin bo'yicha eng kuchli 10 talik reyting
- **Spectator Mode (Tomoshabin)** — o'yinlarni tashqaridan kuzatish imkoniyati

### 💾 Server-side Persistence (SQLite)
- **Ma'lumotlar xavfsizligi** — xonalar va rejalashtirilgan majlislar SQLite bazasida saqlanadi
- **Avtomatik yuklash** — server o'chib yonganda barcha xonalar va ma'lumotlar qayta tiklanadi
- **Foydalanuvchi ballari** — o'yin natijalari va foydalanuvchi profillari bazada doimiy saqlanadi

### 🛡️ Moderatsiya va Boshqaruv
- **Mezbonlik** — kirish turi (ochiq / so'rovli / ishonchli) va qurilmalar boshqaruvi
- **Teatr rejimi** — bitta videoga fokus qaratish
- **Admin Panel** — statistika, foydalanuvchilar va majlislarni to'liq boshqarish

---

## 🏗️ Texnologiyalar

| Qatlam | Texnologiya |
|--------|-------------|
| **Server** | Node.js 22, Express |
| **Real-vaqt** | Socket.IO 4 |
| **Ma'lumotlar Bazasi** | SQLite3 |
| **WebRTC** | PeerJS |
| **Autentifikatsiya** | Passport.js + Google OAuth 2.0 |
| **Shablon** | EJS |

---

## 📁 Fayl Tuzilishi

```
pdp-chat/
├── server.js                 ← Asosiy kirish nuqtasi
├── server/
│   ├── db/
│   │   └── database.js       ← SQLite integratsiyasi
│   ├── middleware/
│   │   └── adminAuth.js      ← Admin himoyasi
│   ├── routes/
│   │   └── adminRoutes.js    ← Admin API
│   └── sockets/              ← Socket logic
├── views/                    ← EJS shablonlari
└── public/
    ├── games.html            ← O'yinlar markazi (Leaderboard bilan)
    ├── script.js             ← Majlis xonasi JS
    └── style.css             ← Asosiy dizayn
```

---

## 🔗 Asosiy URL Marshrutlari

| Marshrut | Tavsif |
|----------|--------|
| `/` | Asosiy sahifa |
| `/games` | O'yinlar Markazi va Leaderboard |
| `/random` | Random Rooms (Tasodifiy suhbat) |
| `/admin` | Admin boshqaruv paneli |
| `/api/leaderboard/:game` | O'yin reytingini olish |

---

## 🚀 Ishga Tushirish

1. `npm install`
2. `.env` faylini sozlang
3. `npm start`

---

## 📄 Litsenziya

MIT © 2025 [Abdullo Mamatqulov](https://github.com/Abdullo200604)

<div align="center">
  <sub>PDP Education tomonidan ❤️ bilan qurildi</sub>
</div>
