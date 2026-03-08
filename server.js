const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const adminAuth = require('./server/middleware/adminAuth');
const adminRoutes = require('./server/routes/adminRoutes');

const app = express();
app.set('trust proxy', 1); // For Render.com HTTPS
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');
const { v4: uuidV4 } = require('uuid');
const crypto = require('crypto');

function generateShortId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 3 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${part()}-${part()}-${part()}`;
}

const peerServer = ExpressPeerServer(server, { debug: true });
app.use('/peerjs', peerServer);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const fs = require('fs');
if (!fs.existsSync('./sessions')) {
  fs.mkdirSync('./sessions');
}

// Sessiya sozlamalari
app.use(session({
  store: new FileStore({ path: './sessions' }),
  secret: process.env.SESSION_SECRET || 'pdp_chat_secret',
  resave: false,
  saveUninitialized: false, // Changed to false for better session handling
  proxy: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Google strategiyasi (faqat o'zgaruvchilar mavjud bo'lsa)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      avatar: profile.photos[0]?.value
    };
    done(null, user);
  }));
} else {
  console.log("⚠️ Google OAuth o'zgaruvchilari topilmadi. Login funksiyasi ishlamaydi.");
}

// ── Room state ──────────────────────────────
const rooms = {};
// rooms[id] = { host, accessType, permissions, participants, theaterMode }

// ── Routes ──────────────────────────────────

// Google auth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Chiqish
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// API: Get current user
app.get('/api/user', (req, res) => {
  res.json(req.user || null);
});

// Landing page
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// Generate a new meeting link (for "Majlis yaratish")
app.post('/api/create-room', (req, res) => {
  const roomId = generateShortId();
  const accessType = req.body.accessType || 'open'; // open | trusted | request
  rooms[roomId] = {
    host: null,
    accessType,
    theaterMode: false,
    chatEnabled: true,
    startTime: Date.now(),
    permissions: {
      screenShare: true,
      reactions: true,
      participantMic: true,
      participantCamera: true,
    },
    waitingRoom: [],
    participants: {}
  };
  res.json({ roomId, link: `/lobby/${roomId}` });
});

// Lobby (pre-join) page
app.get('/lobby/:room', (req, res) => {
  const roomId = req.params.room;
  if (!rooms[roomId]) {
    // Auto-create room if someone with a direct link joins
    rooms[roomId] = {
      host: null, accessType: 'open', theaterMode: false,
      chatEnabled: true,
      startTime: Date.now(),
      permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
      waitingRoom: [], participants: {}
    };
  }
  res.render('lobby', { roomId });
});

// Meeting room page
app.get('/meeting/:room', (req, res) => {
  const roomId = req.params.room;
  if (!rooms[roomId]) {
    rooms[roomId] = {
      host: null, accessType: 'open', theaterMode: false,
      chatEnabled: true,
      startTime: Date.now(),
      permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
      waitingRoom: [], participants: {}
    };
  }
  res.render('room', { roomId });
});

// ── Meeting Scheduler ────────────────────────────
const scheduledMeetings = []; // { id, title, date, createdBy, link }
function generateShortId() { return uuidV4().split('-')[0].toUpperCase(); }

app.post('/api/schedule', (req, res) => {
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });
  const roomId = generateShortId() + '-' + generateShortId();
  const meeting = { id: roomId, title, date, createdBy: req.user?.name || 'Anonymous', link: `/lobby/${roomId}`, createdAt: Date.now() };
  scheduledMeetings.push(meeting);
  rooms[roomId] = {
    host: null, accessType: 'open', theaterMode: false, chatEnabled: true,
    startTime: new Date(date).getTime(),
    permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
    waitingRoom: [], participants: {}
  };
  res.json(meeting);
});

app.get('/api/schedule', (req, res) => {
  const upcoming = scheduledMeetings
    .filter(m => new Date(m.date) > new Date() || Date.now() - new Date(m.date) < 60 * 60 * 1000)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(upcoming);
});

app.delete('/api/schedule/:id', (req, res) => {
  const idx = scheduledMeetings.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  scheduledMeetings.splice(idx, 1);
  res.json({ ok: true });
});

// ── Admin Route Integration ────────────────────────
const bannedUsers = [];
const adminRouter = adminRoutes(rooms, scheduledMeetings, bannedUsers, io);
app.use('/api/admin', adminAuth, adminRouter);

app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(__dirname + '/public/admin/dashboard.html');
});

// Helper for mistakenly typed URLs like /admin/token=... or /admin/secret
app.get('/admin/:token', (req, res) => {
  const tokenParams = req.params.token.replace('token=', '');
  res.redirect('/admin?token=' + tokenParams);
});

// Legacy direct room route (Catch all)
app.get('/:room', (req, res) => {
  const roomId = req.params.room;
  // skip static files
  if (roomId.includes('.')) return res.status(404).send('Not found');
  res.redirect(`/lobby/${roomId}`);
});

// ── Socket.io ───────────────────────────────
io.on('connection', socket => {
  let currentRoomId = null;
  let currentUserId = null;
  let currentName = 'Mehmon';

  socket.on('join-room', (roomId, userId, name, initialStatus = {}) => {
    if (bannedUsers.includes(userId)) {
      socket.emit('force-kick', 'You are banned from this server.');
      return;
    }

    currentRoomId = roomId;
    currentUserId = userId;
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: userId, accessType: 'open', theaterMode: false,
        chatEnabled: true,
        startTime: Date.now(),
        permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
        waitingRoom: [], participants: {}
      };
    }
    const room = rooms[roomId];
    const isHost = room.host === userId || !room.host;
    if (isHost) room.host = userId;

    currentName = name || 'Mehmon'; // Use the passed 'name' or default

    room.participants[userId] = {
      name: currentName,
      isHost,
      muted: initialStatus.muted ?? false,
      videoOff: initialStatus.videoOff ?? false,
      effect: initialStatus.effect ?? 'none'
    };

    socket.join(roomId); // Moved socket.join here

    if (isHost) socket.emit('you-are-host');

    // Sync state to new joiner
    socket.emit('room-state', {
      theaterMode: room.theaterMode,
      chatEnabled: room.chatEnabled,
      permissions: room.permissions,
      participants: room.participants,
      startTime: room.startTime,
      isHost
    });

    socket.to(roomId).emit('user-connected', userId, currentName);
    io.to(roomId).emit('participants-update', room.participants);
    if (adminRouter && adminRouter.addLog) adminRouter.addLog(`User ${currentName} (${userId}) joined room ${roomId}`);

    // ── In-room events ──────────────────

    socket.on('message', (msg) => {
      if (!rooms[roomId]) return;
      if (!rooms[roomId].chatEnabled && rooms[roomId].host !== userId) return;
      io.to(roomId).emit('createMessage', { text: msg, name: currentName, uid: userId });
    });

    socket.on('toggle-theater-mode', (enabled) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      rooms[roomId].theaterMode = enabled;
      io.to(roomId).emit('theater-mode-changed', enabled);
    });

    // ── Host Controls ───────────────────

    socket.on('kick-participant', (targetId) => {
      // faqat host kick qila oladi
      if (!rooms[roomId]) return;
      if (rooms[roomId].host === userId && rooms[roomId].participants[targetId]) {
        io.to(roomId).emit('force-kick', targetId);
      }
    });

    socket.on('toggle-participant-mic', (targetId, state) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].host === userId) {
        io.to(roomId).emit('host-toggled-mic', targetId, state);
      }
    });

    // ── User statuses ───────────────────
    socket.on('status-update', (updates) => {
      const room = rooms[roomId];
      if (!room || !room.participants[userId]) return;

      const p = room.participants[userId];
      if (updates.muted !== undefined) p.muted = updates.muted;
      if (updates.videoOff !== undefined) p.videoOff = updates.videoOff;
      if (updates.effect !== undefined) p.effect = updates.effect;

      // Broadcast back to all
      io.to(roomId).emit('participants-update', room.participants);
    });

    // (O'chirildi)

    // Host commands
    socket.on('host-set-mic', ({ targetId, on }) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      io.to(roomId).emit('set-mic-state', { uid: targetId, on });
    });
    socket.on('host-set-cam', ({ targetId, on }) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      io.to(roomId).emit('set-cam-state', { uid: targetId, on });
    });
    socket.on('host-kick-user', (targetId) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      io.to(roomId).emit('force-kick', targetId);
    });
    socket.on('update-permissions', (perms) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      Object.assign(rooms[roomId].permissions, perms);
      io.to(roomId).emit('permissions-updated', rooms[roomId].permissions);
    });
    socket.on('toggle-chat', (enabled) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      rooms[roomId].chatEnabled = enabled;
      io.to(roomId).emit('chat-toggled', enabled);
    });
    // Raise hand
    socket.on('raise-hand', () => {
      socket.to(roomId).emit('user-raised-hand', userId, currentName);
    });

    // Emoji reaction
    socket.on('send-reaction', (emoji) => {
      io.to(roomId).emit('show-reaction', { uid: userId, name: currentName, emoji });
    });

    socket.on('disconnect', () => {
      if (adminRouter && adminRouter.addLog) adminRouter.addLog(`User ${currentName} (${userId}) left room ${roomId}`);
      if (!rooms[roomId]) return;
      delete rooms[roomId].participants[userId];

      if (Object.keys(rooms[roomId].participants).length === 0) {
        delete rooms[roomId]; // Room is empty, delete it
      } else {
        // Only assign a new host and update others if the room still exists
        if (rooms[roomId].host === userId) {
          const next = Object.keys(rooms[roomId].participants)[0];
          rooms[roomId].host = next;
          io.to(roomId).emit('new-host', next);
        }
        io.to(roomId).emit('participants-update', rooms[roomId].participants);
      }

      io.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`PDP Chat running on port ${PORT}`));
