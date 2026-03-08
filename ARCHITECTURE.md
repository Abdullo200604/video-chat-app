# 🏗️ PDP Chat — Loyiha Arxitekturasi

## Umumiy Ko'rinish

```
pdp-chat/
├── server.js                        ← Asosiy server kirish nuqtasi
├── server/
│   ├── middleware/
│   │   └── adminAuth.js             ← Admin token tekshiruvi
│   ├── routes/
│   │   └── adminRoutes.js           ← /api/admin/* marshrutlari
│   ├── matchmaking/
│   │   ├── queue.js                 ← 1-on-1 navbat menejeri
│   │   └── publicRooms.js           ← Jamoat xonalari don'abiri
│   └── sockets/
│       └── randomSocket.js          ← Random xona Socket.io handleri
├── views/
│   ├── room.ejs                     ← Majlis xonasi sahifasi
│   └── lobby.ejs                    ← Kirish oldidan kutish sahifasi
└── public/
    ├── index.html                   ← Asosiy sahifa
    ├── random.html                  ← Random Rooms sahifasi
    ├── script.js                    ← Majlis xonasi JavaScript (WebRTC)
    ├── style.css                    ← Majlis xonasi stili
    ├── lobby.css                    ← Lobby stili
    ├── index.css                    ← Asosiy sahifa stili
    ├── css/
    │   └── random.css               ← Random sahifasi stili
    ├── js/
    │   └── random.js                ← Random sahifasi JavaScript
    └── admin/
        └── dashboard.html           ← Admin panel
```

---

## 🔄 Tizim Arxitekturasi

```
                        ┌─────────────────────────────────────────┐
                        │              BRAUZER (Client)           │
                        │                                         │
                        │  index.html  ←→  /api/create-room       │
                        │  lobby.ejs   ←→  getUserMedia()         │
                        │  room.ejs    ←→  Socket.IO + PeerJS     │
                        │  random.html ←→  Socket.IO              │
                        │  admin panel ←→  /api/admin/*           │
                        └────────────────┬────────────────────────┘
                                         │  HTTP / WebSocket
                                         ▼
                        ┌─────────────────────────────────────────┐
                        │         Node.js / Express Server        │
                        │                server.js                │
                        │                                         │
                        │  ┌─────────────────────────────────┐    │
                        │  │          Express Routes          │    │
                        │  │  GET  /                          │    │
                        │  │  GET  /random                    │    │
                        │  │  GET  /lobby/:room               │    │
                        │  │  GET  /meeting/:room             │    │
                        │  │  POST /api/create-room           │    │
                        │  │  GET  /api/admin/dashboard       │    │
                        │  │  *    /api/admin/*               │    │
                        │  └─────────────────────────────────┘    │
                        │                                         │
                        │  ┌─────────────────────────────────┐    │
                        │  │       In-Memory State           │    │
                        │  │  rooms{}     → faol xonalar     │    │
                        │  │  bannedUsers[]                  │    │
                        │  │  scheduledMeetings[]            │    │
                        │  └─────────────────────────────────┘    │
                        └──────────┬──────────────┬───────────────┘
                                   │              │
               ┌───────────────────▼──┐  ┌────────▼──────────────────┐
               │    Socket.IO Engine  │  │      PeerJS Server        │
               │                      │  │      /peerjs (path)        │
               │  join-room           │  │                           │
               │  user-connected      │  │  Peer-to-Peer Signaling   │
               │  disconnect          │  │  (WebRTC SDP exchange)     │
               │  message             │  └───────────────────────────┘
               │  host-controls       │
               │                      │
               │  random:join_queue   │
               │  random:match_found  │
               │  random:create_room  │
               │  random:list_rooms   │
               └──────────────────────┘
```

---

## 🎥 WebRTC Ulanish Oqimi

```
 Foydalanuvchi A              Server               Foydalanuvchi B
      │                         │                        │
      │── join-room ───────────►│                        │
      │                         │── user-connected ─────►│
      │                         │                        │
      │◄──────── PeerJS ID ─────┤                        │
      │                         │◄────── PeerJS ID ──────│
      │                         │                        │
      │◄═══════ WebRTC P2P mediaStream (SDP/ICE) ═══════►│
      │                    (STUN Servers:)                │
      │                 stun.l.google.com                 │
      │                 stun.cloudflare.com               │
      │                 openrelay TURN (fallback)         │
```

---

## 🎲 Random Matchmaking Oqimi

```
 User A       randomSocket.js       queue.js       User B
   │                 │                 │              │
   │─ join_queue ───►│                 │              │
   │                 │─ findMatch() ──►│              │
   │                 │◄─ null (empty)──│              │
   │                 │─ addToQueue() ─►│              │
   │◄─ waiting ──────│                 │              │
   │                 │                 │◄─ join_queue─│
   │                 │─ findMatch() ──►│              │
   │                 │◄─ UserA data ───│              │
   │                 │─ removeFromQ() ►│              │
   │                 │                 │              │
   │◄─match_found ───│─────────────────────────────►│
   │  (roomId+link)  │   create room in rooms{}      │
   │                 │                               │
   │──────── redirect /lobby/roomId ────────────────►│
```

---

## 🏠 Jamoat Xonalari Oqimi

```
 Creator          Server           publicRooms.js     Viewer
    │                │                   │               │
    │─create_room───►│─createPublicRoom─►│               │
    │                │─broadcastRoomList►│──────────────►│
    │◄─room_created──│                   │               │
    │                │                   │               │
    │                │◄─list_rooms───────────────────────│
    │                │─room_list_update─────────────────►│
    │                │                   │               │
    │                │◄─join_public_room──────────────────│
    │                │─verifyPublicRoom─►│               │
    │                │◄─{ok:true,room}───│               │
    │                │─join_approved────────────────────►│
```

---

## 🛡️ Xavfsizlik Qatlamlari

| Qatlam | Mexanizm |
|--------|---------|
| Admin API | `adminAuth` middleware — token tekshiruvi |
| Navbat | Takroriy kirishga qarshi `Set` asosida |
| Rate Limit | "Next" tugmasi — 1 daq 5 ta bosish |
| Xona sig'imi | `maxParticipants` cheki |
| Parollar | Xona darajasida `hasPassword` + `password` maydoni |
| Ban | `bannedUsers[]` ro'yxati + ban tekshiruvi `join-room`da |

---

## 📡 Socket.IO Eventlari Ro'yxati

### Asosiy Majlis
| Event | Yo'nalish | Tavsif |
|-------|-----------|--------|
| `join-room` | Client→Server | Xonaga qo'shilish |
| `user-connected` | Server→Room | Yangi a'zo xabari |
| `message` | Client→Server | Chat xabari |
| `status-update` | Client→Server | Mic/cam holati |
| `raise-hand` | Client→Server | Qo'l ko'tarish |
| `send-reaction` | Client→Server | Emoji reaksiya |
| `disconnect` | — | Chiqish, tozalash |

### Random Rooms
| Event | Yo'nalish | Tavsif |
|-------|-----------|--------|
| `random:join_queue` | Client→Server | Navbatga qo'shilish |
| `random:leave_queue` | Client→Server | Navbatdan chiqish |
| `random:next_partner` | Client→Server | Yangi hamkor so'rash |
| `random:match_found` | Server→Client | Match muvaffaqiyatli |
| `random:waiting` | Server→Client | Navbat holati |
| `random:rate_limited` | Server→Client | Cheklov xabari |
| `random:create_room` | Client→Server | Jamoat xonasi yaratish |
| `random:list_rooms` | Client→Server | Xonalar ro'yxati so'rash |
| `random:join_public_room`| Client→Server | Jamoat xonasiga kirish |
| `random:room_list_update`| Server→All | Yangilangan ro'yxat |
| `random:report_user` | Client→Server | Foydalanuvchi shikoyati |

---

## 🚀 Deployment (Render.com)

```
GitHub Push → Render Auto-Deploy
                    │
           npm install
                    │
           npm start  (node server.js)
                    │
           PORT = process.env.PORT || 3000
           SESSION_SECRET, GOOGLE_*, ADMIN_SECRET
```

---

*Hujjat avtomatik yaratildi — PDP Chat Random Rooms qo'shilishidan keyin yangilandi.*
