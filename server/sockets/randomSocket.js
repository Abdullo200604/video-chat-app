/**
 * ─────────────────────────────────────────────────────────────
 *  PDP Chat – Random Room Socket Handler
 *  File: server/sockets/randomSocket.js
 * ─────────────────────────────────────────────────────────────
 *  Attaches to the main socket.io instance and handles all
 *  random-chat matchmaking events:
 *
 *    random:join_queue        → user wants a 1-on-1 match
 *    random:leave_queue       → user cancelled search
 *    random:next_partner      → move to next person (Omegle-style)
 *    random:match_found       → server → client  (emitted here)
 *    random:partner_left      → server → client
 *    random:queue_position    → server → client  (queue count update)
 *    random:rate_limited      → server → client
 *    random:report_user       → client reports another user
 *
 *  Public Room events:
 *    random:create_room       → create a named public room
 *    random:list_rooms        → get current public room list
 *    random:join_public_room  → join a named room (with optional pw)
 *    random:room_list_update  → server broadcast when list changes
 * ─────────────────────────────────────────────────────────────
 */

const queue = require('../matchmaking/queue');
const publicRooms = require('../matchmaking/publicRooms');
const crypto = require('crypto');

// Reports store: Map<reportedSocketId, [{by, reason, ts}]>
const reports = new Map();

// Track which public room a socket is in (for disconnect cleanup)
const socketPublicRoom = new Map();

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const part = () => Array.from({ length: 3 }, () => chars[crypto.randomInt(chars.length)]).join('');
    return `${part()}-${part()}-${part()}`;
}

/**
 * Broadcast the current public rooms list to all clients.
 */
function broadcastRoomList(io) {
    io.emit('random:room_list_update', publicRooms.getPublicRoomList());
}

/**
 * Main registration function — call this from server.js.
 */
function registerRandomSocket(io, rooms) {
    io.on('connection', socket => {

        // ── 1-on-1 MATCHMAKING ────────────────────────────────────────

        /**
         * User wants to join the matchmaking queue.
         * Payload: { name, interests: string[] }
         */
        socket.on('random:join_queue', ({ name = 'Mehmon', interests = [] } = {}) => {
            // Prevent duplicates
            if (queue.isInQueue(socket.id)) {
                socket.emit('random:already_in_queue');
                return;
            }

            // Try to find an existing waiting partner
            const partner = queue.findMatch(socket.id, interests);

            if (partner) {
                // ── Match found! Create a private random room ──
                const roomId = generateRoomId();

                rooms[roomId] = {
                    host: null,
                    accessType: 'open',
                    type: 'private_random',
                    theaterMode: false,
                    chatEnabled: true,
                    startTime: Date.now(),
                    maxParticipants: 2,
                    permissions: {
                        screenShare: true,
                        reactions: true,
                        participantMic: true,
                        participantCamera: true,
                    },
                    waitingRoom: [],
                    participants: {}
                };

                // Notify both users
                socket.emit('random:match_found', {
                    roomId,
                    partnerName: partner.name,
                    link: `/lobby/${roomId}`
                });

                io.to(partner.socketId).emit('random:match_found', {
                    roomId,
                    partnerName: name,
                    link: `/lobby/${roomId}`
                });

                console.log(`[RandomMatch] ${name} ↔ ${partner.name} → room ${roomId}`);

            } else {
                // No partner yet — add self to queue
                queue.addToQueue(socket.id, name, interests);
                socket.emit('random:waiting', { queueSize: queue.queueSize() });
            }
        });

        /**
         * User manually cancelled the search.
         */
        socket.on('random:leave_queue', () => {
            queue.removeFromQueue(socket.id);
            socket.emit('random:queue_left');
        });

        /**
         * "Next Partner" — leave current room and re-queue.
         * Payload: { name, interests }
         */
        socket.on('random:next_partner', ({ name = 'Mehmon', interests = [] } = {}) => {
            // Rate limit check
            if (!queue.checkRateLimit(socket.id)) {
                socket.emit('random:rate_limited', {
                    message: 'Biroz kuting. 1 daqiqada 5 ta "Keyingisi" bosish mumkin.',
                    waitSeconds: 30
                });
                return;
            }

            // Remove from any existing queue slot
            queue.removeFromQueue(socket.id);

            // Re-queue immediately
            const partner = queue.findMatch(socket.id, interests);

            if (partner) {
                const roomId = generateRoomId();
                rooms[roomId] = {
                    host: null, accessType: 'open', type: 'private_random',
                    theaterMode: false, chatEnabled: true, startTime: Date.now(),
                    maxParticipants: 2,
                    permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
                    waitingRoom: [], participants: {}
                };

                socket.emit('random:match_found', { roomId, partnerName: partner.name, link: `/lobby/${roomId}` });
                io.to(partner.socketId).emit('random:match_found', { roomId, partnerName: name, link: `/lobby/${roomId}` });
            } else {
                queue.addToQueue(socket.id, name, interests);
                socket.emit('random:waiting', { queueSize: queue.queueSize() });
            }
        });

        /**
         * User reports another user.
         * Payload: { reportedId, reason }
         */
        socket.on('random:report_user', ({ reportedId, reason = 'other' } = {}) => {
            if (!reportedId || reportedId === socket.id) return;

            const list = reports.get(reportedId) || [];
            list.push({ by: socket.id, reason, ts: Date.now() });
            reports.set(reportedId, list);

            console.log(`[Report] ${socket.id} reported ${reportedId} — reason: ${reason} (total: ${list.length})`);

            socket.emit('random:report_received', { ok: true });
        });

        // ── PUBLIC ROOMS ──────────────────────────────────────────────

        /**
         * Create a new public room.
         * Payload: { name, maxParticipants, password }
         */
        socket.on('random:create_room', ({ name = 'Umumiy Xona', maxParticipants = 10, password = '', createdBy = 'Mehmon' } = {}) => {
            const roomId = generateRoomId();

            // Create in core rooms store (for WebRTC)
            rooms[roomId] = {
                host: null, accessType: 'open', type: 'public_room',
                theaterMode: false, chatEnabled: true, startTime: Date.now(),
                maxParticipants: Math.min(Math.max(parseInt(maxParticipants) || 10, 2), 30),
                permissions: { screenShare: true, reactions: true, participantMic: true, participantCamera: true },
                waitingRoom: [], participants: {}
            };

            // Create in public rooms registry (for listing)
            publicRooms.createPublicRoom({ roomId, name, maxParticipants, password: password || null, createdBy });

            socket.emit('random:room_created', { roomId, link: `/lobby/${roomId}` });
            broadcastRoomList(io);
        });

        /**
         * Client requests current list of public rooms.
         */
        socket.on('random:list_rooms', () => {
            socket.emit('random:room_list_update', publicRooms.getPublicRoomList());
        });

        /**
         * Join a public room (password check + capacity check).
         * Payload: { roomId, password }
         */
        socket.on('random:join_public_room', ({ roomId, password = '' } = {}) => {
            const result = publicRooms.verifyPublicRoom(roomId, password);

            if (!result.ok) {
                const msg = result.reason === 'wrong_password' ? 'Parol noto\'g\'ri!'
                    : result.reason === 'full' ? 'Xona to\'liq!'
                        : 'Xona topilmadi!';
                socket.emit('random:join_error', { reason: result.reason, message: msg });
                return;
            }

            socket.emit('random:join_approved', { roomId, link: `/lobby/${roomId}` });
        });

        // ── DISCONNECT CLEANUP ────────────────────────────────────────

        socket.on('disconnect', () => {
            queue.removeFromQueue(socket.id);
            queue.clearRateLimit(socket.id);

            // If they were in a public room, decrement count
            const pubRoom = socketPublicRoom.get(socket.id);
            if (pubRoom) {
                publicRooms.updateParticipantCount(pubRoom, -1);
                socketPublicRoom.delete(socket.id);
                broadcastRoomList(io);
            }
        });
    });
}

module.exports = { registerRandomSocket, broadcastRoomList };
