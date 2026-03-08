const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function (rooms, scheduledMeetings, bannedUsers, io) {
    const router = express.Router();

    // 1. Dashboard Stats
    router.get('/dashboard', (req, res) => {
        const activeRooms = Object.values(rooms).length;
        let totalOnlineUsers = 0;
        Object.values(rooms).forEach(r => {
            totalOnlineUsers += Object.keys(r.participants).length;
        });

        let registeredUsers = 0;
        try {
            if (fs.existsSync('./sessions')) {
                registeredUsers = fs.readdirSync('./sessions').filter(f => f.endsWith('.json')).length;
            }
        } catch (e) { }

        const data = {
            totalUsers: registeredUsers > 0 ? registeredUsers : (totalOnlineUsers + bannedUsers.length),
            activeMeetings: activeRooms,
            onlineUsers: totalOnlineUsers,
            totalScheduled: scheduledMeetings.length
        };
        console.log('[Admin Dashboard Requested] Stats:', data);
        res.json(data);
    });

    // 2. Users Management
    router.get('/users', (req, res) => {
        const users = [];
        const activeUids = new Set();

        // 1. Ochiq xonadagi odamlar
        Object.entries(rooms).forEach(([roomId, room]) => {
            Object.entries(room.participants).forEach(([uid, u]) => {
                users.push({ id: uid, name: u.name, roomId, status: 'Active' });
                activeUids.add(uid);
            });
        });

        // 2. Banned qilinganlar
        bannedUsers.forEach(uid => {
            if (!activeUids.has(uid)) {
                users.push({ id: uid, name: 'Banned User (' + uid + ')', roomId: '-', status: 'Banned' });
                activeUids.add(uid);
            }
        });

        // 3. Tizimdan ulanib turgan (lekin xonada emas) foydalanuvchilar (Sessions directorydan o'qish)
        try {
            if (fs.existsSync('./sessions')) {
                const files = fs.readdirSync('./sessions').filter(f => f.endsWith('.json'));
                files.forEach(f => {
                    try {
                        const content = JSON.parse(fs.readFileSync(path.join('./sessions', f)));
                        if (content.passport && content.passport.user) {
                            const u = content.passport.user;
                            if (!activeUids.has(u.id)) {
                                users.push({ id: u.id, name: u.name || 'Foydalanuvchi', roomId: 'Tizimda (Kutish)', status: 'Idle' });
                                activeUids.add(u.id);
                            }
                        }
                    } catch (err) { }
                });
            }
        } catch (exc) { }

        res.json(users);
    });

    router.post('/ban-user', (req, res) => {
        const { userId } = req.body;
        if (userId && !bannedUsers.includes(userId)) {
            bannedUsers.push(userId);
            // Kick them out from any active room
            Object.entries(rooms).forEach(([roomId, room]) => {
                if (room.participants[userId]) {
                    io.to(roomId).emit('force-kick', userId);
                }
            });
            res.json({ ok: true, message: 'User banned' });
        } else {
            res.status(400).json({ error: 'User ID missing or already banned' });
        }
    });

    router.post('/unban-user', (req, res) => {
        const { userId } = req.body;
        const idx = bannedUsers.indexOf(userId);
        if (idx > -1) {
            bannedUsers.splice(idx, 1);
            res.json({ ok: true, message: 'User unbanned' });
        } else {
            res.status(404).json({ error: 'User not found in ban list' });
        }
    });

    // 3. Meetings Management
    router.get('/meetings', (req, res) => {
        const active = Object.entries(rooms).map(([id, r]) => ({
            id,
            hostName: r.participants[r.host]?.name || r.host,
            usersCount: Object.keys(r.participants).length,
            duration: Math.floor((Date.now() - r.startTime) / 60000) + ' min',
            status: 'Active'
        }));
        res.json(active);
    });

    router.post('/end-meeting', (req, res) => {
        const { roomId } = req.body;
        if (rooms[roomId]) {
            io.to(roomId).emit('meeting-ended'); // tells clients the meeting was terminated by admin
            delete rooms[roomId];
            res.json({ ok: true, message: 'Meeting ended' });
        } else {
            res.status(404).json({ error: 'Room not found' });
        }
    });

    router.get('/meeting-participants/:roomId', (req, res) => {
        const room = rooms[req.params.roomId];
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const parts = Object.entries(room.participants).map(([uid, u]) => ({
            id: uid, name: u.name, isHost: u.isHost, muted: u.muted, videoOff: u.videoOff
        }));
        res.json({ host: room.host, participants: parts });
    });

    router.post('/kick-participant', (req, res) => {
        const { roomId, userId } = req.body;
        if (rooms[roomId] && rooms[roomId].participants[userId]) {
            io.to(roomId).emit('force-kick', userId);
            res.json({ ok: true, message: 'Participant kicked' });
        } else {
            res.status(404).json({ error: 'Room or Participant not found' });
        }
    });

    // 4. System Logs (simplified mock for MVP)
    const logs = [{ time: new Date().toLocaleTimeString(), msg: 'Admin System Initialized' }];
    router.get('/logs', (req, res) => res.json(logs));

    // Expose a method to add logs from server.js safely without overriding emit
    router.addLog = (msg) => {
        logs.unshift({ time: new Date().toLocaleTimeString(), msg });
        if (logs.length > 50) logs.pop();
    };

    return router;
};
