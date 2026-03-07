const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { ExpressPeerServer } = require('peer');
const { v4: uuidV4 } = require('uuid');

const peerServer = ExpressPeerServer(server, { debug: true });
app.use('/peerjs', peerServer);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

// ── Room state ──────────────────────────────
const rooms = {};
// rooms[id] = { host, accessType, permissions, participants, theaterMode }

// ── Routes ──────────────────────────────────

// Landing page
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// Generate a new meeting link (for "Majlis yaratish")
app.post('/api/create-room', (req, res) => {
  const roomId = uuidV4();
  const accessType = req.body.accessType || 'open'; // open | trusted | request
  rooms[roomId] = {
    host: null,
    accessType,
    theaterMode: false,
    chatEnabled: true,
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
      permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
      waitingRoom: [], participants: {}
    };
  }
  res.render('room', { roomId });
});

// Legacy direct room route
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

  socket.on('join-room', (roomId, userId, displayName) => {
    currentRoomId = roomId;
    currentUserId = userId;
    currentName = displayName || 'Mehmon';

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: null, accessType: 'open', theaterMode: false,
        chatEnabled: true,
        permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
        waitingRoom: [], participants: {}
      };
    }

    const room = rooms[roomId];
    socket.join(roomId);

    // First person = host
    const isHost = room.host === null;
    if (isHost) room.host = userId;
    room.participants[userId] = { name: currentName, muted: false, videoOff: false };

    if (isHost) socket.emit('you-are-host');

    // Sync state to new joiner
    socket.emit('room-state', {
      theaterMode: room.theaterMode,
      chatEnabled: room.chatEnabled,
      permissions: room.permissions,
      participants: room.participants,
      isHost
    });

    socket.to(roomId).emit('user-connected', userId, currentName);
    io.to(roomId).emit('participants-update', room.participants);

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

    // Host commands
    socket.on('host-mute-user', (targetId) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      io.to(roomId).emit('force-mute', targetId);
    });
    socket.on('host-disable-camera', (targetId) => {
      if (!rooms[roomId] || rooms[roomId].host !== userId) return;
      io.to(roomId).emit('force-camera-off', targetId);
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

    // Participant status update
    socket.on('status-update', (status) => {
      if (rooms[roomId] && rooms[roomId].participants[userId]) {
        Object.assign(rooms[roomId].participants[userId], status);
        io.to(roomId).emit('participants-update', rooms[roomId].participants);
      }
    });

    socket.on('disconnect', () => {
      if (!rooms[roomId]) return;
      delete rooms[roomId].participants[userId];

      if (Object.keys(rooms[roomId].participants).length === 0) {
        delete rooms[roomId];
      } else if (rooms[roomId].host === userId) {
        const next = Object.keys(rooms[roomId].participants)[0];
        rooms[roomId].host = next;
        io.to(roomId).emit('new-host', next);
      }
      io.to(roomId).emit('user-disconnected', userId);
      if (rooms[roomId]) io.to(roomId).emit('participants-update', rooms[roomId].participants);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`PDP Chat running on port ${PORT}`));
