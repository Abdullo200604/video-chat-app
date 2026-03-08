<div align="center">

# 🎙️ PDP Chat

**Zamonaviy, real-vaqt video-konferensiya platformasi**

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black?style=flat-square&logo=socket.io)](https://socket.io)
[![PeerJS](https://img.shields.io/badge/PeerJS-WebRTC-0078D7?style=flat-square)](https://peerjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Deploy on Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat-square&logo=render)](https://render.com)

[🌐 Live Demo](https://chat.pdpedu.uz) · [🐛 Bug Report](https://github.com/Abdullo200604/video-chat-app/issues) · [✨ Feature Request](https://github.com/Abdullo200604/video-chat-app/issues)

</div>

---

## ✨ Imkoniyatlar

### 🎥 Video Majlis
- **HD Video & Audio** — WebRTC orqali foydalanuvchilar o'rtasida to'g'ridan-to'g'ri aloqa
- **Ekran ulashish** — ixtiyoriy dastur yoki butun ekranni ulashish
- **Video effektlar** — blur, sepia, grayscale va boshqalar
- **Fon blur** — virtual fon effekti
- **Yozib olish** — majlisni WebM formatida yuklab olish

### 🎲 Random Rooms _(Yangi!)_
- **1-on-1 Random Chat** — Omegle uslubida tasodifiy hamkor topish
- **Qiziqishlar bo'yicha tasniflash** — umumiy mavzular asosida mos juftlash
- **Jamoat Xonalari** — ommaviy xonalar yaratish, ko'rish va ulashish
- **"Keyingisi" tugmasi** — yangi shaxs bilan darhol uchrashuv
- **Shikoyat tizimi** — noo'rin foydalanuvchilarni xabar qilish

### 💬 Hamkorlik
- **Matn chati** — xona ichida real-vaqt xabar almashish
- **Reaksiyalar** — emoji reaksiyalari (🎉 ❤️ 👍)
- **Qo'l ko'tarish** — so'z so'rash belgisi
- **Ishtirokchilar paneli** — barcha a'zolarni ko'rish

### 🛡️ Moderatsiya (Mezbonlar)
- **Mezbonlik** — qarorlar: kirish turi (ochiq / so'rovli / ishonchli)
- **Mikrofon/Kamera boshqaruvi** — ishtirokchilar qurilmasini o'chirish/yoqish
- **Chiqarish** — keraksiz foydalanuvchilarni xonadan olib tashlash
- **Chat to'xtatish** — barcha foydalanuvchilar uchun chatni yopish/ochish
- **Teatr rejimi** — bitta videodan ko'rgazma qilish

### ⚙️ Foydalanuvchi Sozlamalari
- **Kamera tanlash** — bir necha kamera bo'lsa, istalganini tanlash
- **Mikrofon tanlash** — bir necha mikrofon bo'lsa, istalganini tanlash
- **Majlis davomida almashtirish** — jonli efir paytida qurilma o'zgartirish

### 📊 Admin Panel
- **Statistika** — jami foydalanuvchilar, faol majlislar, onlayn soni
- **Foydalanuvchilar boshqaruvi** — ban/unban, ma'lumotlarni ko'rish
- **Majlislar boshqaruvi** — xonalarni yakunlash, ishtirokchilarni ko'rish
- **Tizim jurnali** — barcha foydalanuvchi harakatlarini kuzatish

### 🔐 Autentifikatsiya
- **Google OAuth 2.0** — bitta bosish bilan kirish
- **Mehmon rejimi** — ro'yxatdan o'tmasdan ism bilan kirish
- **Seans saqlash** — `session-file-store` orqali doimiy seans

---

## 🏗️ Texnologiyalar

| Qatlam | Texnologiya |
|--------|-------------|
| **Server** | Node.js 22, Express 4 |
| **Real-vaqt** | Socket.IO 4 |
| **WebRTC** | PeerJS (vanilla WebRTC ustida) |
| **STUN/TURN** | Google STUN (5 server), Cloudflare STUN, OpenRelay TURN |
| **Autentifikatsiya** | Passport.js + Google OAuth 2.0 |
| **Sessiya** | express-session + session-file-store |
| **Shablon** | EJS |
| **Deployment** | Render.com |

---

## 🚀 O'rnatish va Ishga Tushirish

### Talablar
- Node.js ≥ 18
- npm ≥ 9

### Lokal ishga tushirish

```bash
# 1. Klonlash
git clone https://github.com/Abdullo200604/video-chat-app.git
cd video-chat-app

# 2. Paketlarni o'rnatish
npm install

# 3. .env faylini sozlash
cp .env.example .env
# .env faylini tahrirlang (quyida ko'ring)

# 4. Ishga tushirish
npm start
```

### 🔧 Muhit O'zgaruvchilari (`.env`)

```env
# Server
PORT=3000
NODE_ENV=development

# Sessiya
SESSION_SECRET=your-secret-key

# Google OAuth (ixtiyoriy)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Admin Panel
ADMIN_SECRET=your_admin_password
```

---

## 📁 Fayl Tuzilishi

```
pdp-chat/
├── server.js                 ← Asosiy kirish nuqtasi
├── server/
│   ├── middleware/
│   │   └── adminAuth.js      ← Admin himoyasi
│   ├── routes/
│   │   └── adminRoutes.js    ← Admin API
│   ├── matchmaking/
│   │   ├── queue.js          ← 1-on-1 navbat tizimi
│   │   └── publicRooms.js    ← Jamoat xonalari
│   └── sockets/
│       └── randomSocket.js   ← Random Rooms socket handleri
├── views/
│   ├── room.ejs              ← Majlis xonasi
│   └── lobby.ejs             ← Majlisga kirish
└── public/
    ├── index.html            ← Asosiy sahifa
    ├── random.html           ← Random Rooms
    ├── script.js             ← Majlis xonasi JS (WebRTC)
    ├── style.css             ← Majlis stili
    ├── lobby.css             ← Lobby stili
    ├── index.css             ← Asosiy sahifa stili
    ├── css/random.css        ← Random sahifasi stili
    ├── js/random.js          ← Random sahifasi JS
    └── admin/
        └── dashboard.html    ← Admin panel
```

---

## 🔗 URL Marshrutlari

| Marshrut | Tavsif |
|----------|--------|
| `/` | Asosiy sahifa — majlis yaratish / link orqali kirish |
| `/random` | Random Rooms — tasodifiy suhbat va jamoat xonalari |
| `/lobby/:roomId` | Majlisga kirish oldidan ko'rib chiqish |
| `/meeting/:roomId` | Asosiy video majlis xonasi |
| `/admin?token=...` | Admin boshqaruv paneli |
| `/auth/google` | Google orqali kirish |
| `/logout` | Chiqish |
| `/api/create-room` | `POST` — yangi majlis yaratish |
| `/api/admin/*` | Admin API (himoyalangan) |
| `/api/user` | Joriy foydalanuvchi ma'lumotlari |

---

## 🎲 Random Rooms Qanday Ishlaydi?

```
Foydalanuvchi A                 Server                 Foydalanuvchi B
     │                             │                          │
     │── random:join_queue ───────►│                          │
     │                             │◄── random:join_queue ────│
     │                             │                          │
     │                        Match topildi!                  │
     │◄── random:match_found ──────│──── random:match_found ──►│
     │         (roomId)            │         (roomId)          │
     │                             │                          │
     └───────── /lobby/roomId ─────┴────────── /lobby/roomId ─┘
                  WebRTC ulanish boshlandi
```

---

## 🤝 Hissa Qo'shish

1. Fork qiling
2. Yangi branch yarating (`git checkout -b feature/yangi-funksiya`)
3. O'zgarishlaringizni commit qiling (`git commit -am 'Add: yangi funksiya'`)
4. Push qiling (`git push origin feature/yangi-funksiya`)
5. Pull Request yarating

---

## 📄 Litsenziya

MIT © 2025 [Abdullo Mamatqulov](https://github.com/Abdullo200604)

---

<div align="center">
  <sub>PDP Education tomonidan ❤️ bilan qurildi</sub>
</div>
