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

// Track room admins and state
const rooms = {};

app.get('/', (req, res) => res.redirect(`/${uuidV4()}`));
app.get('/:room', (req, res) => res.render('room', { roomId: req.params.room }));

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { admin: userId, theaterMode: false, users: new Set() };
    }
    rooms[roomId].users.add(userId);

    // Tell this user if they are admin
    if (rooms[roomId].admin === userId) {
      socket.emit('you-are-admin');
    }

    // Sync current theater mode state to the joining user
    if (rooms[roomId].theaterMode) {
      socket.emit('theater-mode-changed', true);
    }

    socket.to(roomId).emit('user-connected', userId);

    // Chat message
    socket.on('message', (message) => {
      io.to(roomId).emit('createMessage', message);
    });

    // Theater mode toggle — only admin can do this
    socket.on('toggle-theater-mode', (enabled) => {
      if (rooms[roomId] && rooms[roomId].admin === userId) {
        rooms[roomId].theaterMode = enabled;
        io.to(roomId).emit('theater-mode-changed', enabled);
      }
    });

    socket.on('disconnect', () => {
      if (rooms[roomId]) {
        rooms[roomId].users.delete(userId);
        if (rooms[roomId].users.size === 0) {
          delete rooms[roomId];
        } else if (rooms[roomId].admin === userId) {
          // Pass admin to next connected user
          const nextAdmin = [...rooms[roomId].users][0];
          rooms[roomId].admin = nextAdmin;
          io.to(roomId).emit('new-admin', nextAdmin);
        }
      }
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
