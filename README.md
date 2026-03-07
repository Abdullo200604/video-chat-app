# 🎥 Video Chat App – Google Meet Clone

Oddiy va zamonaviy onlayn video suhbat ilovasi. **WebRTC**, **Socket.io** va **PeerJS** texnologiyalari asosida qurilgan.

🌐 **Demo:** [chat.pdpedu.uz](https://chat.pdpedu.uz)

---

## ✨ Xususiyatlari

- 🎥 Real-vaqt video suhbat (bir nechta ishtirokchi)
- 🎙️ Audio suhbat
- 💬 Matnli chat (jonli)
- 🔇 Mikrofon va kamerani yoqish/o'chirish
- 📱 Mobil qurilmalarga moslashtirilgan (Responsive)
- 🔒 HTTPS orqali xavfsiz ulanish

---

## 🛠️ Texnologiyalar

| Texnologiya | Maqsad |
|---|---|
| **Node.js + Express** | Server |
| **Socket.io** | Xona boshqaruvi (Signaling) |
| **PeerJS (WebRTC)** | Video/Audio ulanish |
| **EJS** | HTML shablonlar |
| **Vanilla CSS** | Dizayn |

---

## 🚀 Mahalliy ishga tushirish

```bash
# 1. Klonlash
git clone https://github.com/Abdullo200604/video-chat-app.git
cd video-chat-app

# 2. Kutubxonalarni o'rnatish
npm install

# 3. Serverni ishga tushirish
npm start
```

Brauzerda **http://localhost:3000** manzilini oching.  
Yangi oyna ochib xuddi shu manzilga kirsangiz – ikkita ishtirokchini ko'rasiz.

---

## 📁 Loyiha tuzilmasi

```
video-chat-app/
├── server.js          # Express + Socket.io server
├── package.json
├── public/
│   ├── script.js      # WebRTC va chat logikasi
│   └── style.css      # Dizayn (dark mode + mobil)
└── views/
    └── room.ejs       # Xona HTML shabloni
```

---

## ☁️ Render.com ga joylash

1. [render.com](https://render.com) da ro'yxatdan o'ting
2. **New → Web Service → GitHub reponi ulang**
3. Sozlamalar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Create Web Service** tugmasini bosing

---

## 👤 Muallif

**Abdullo** – [GitHub](https://github.com/Abdullo200604)
