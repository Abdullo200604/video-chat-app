/**
 * ─────────────────────────────────────────────────
 *  PDP Chat – Public Room Store
 *  File: server/matchmaking/publicRooms.js
 * ─────────────────────────────────────────────────
 *  Stores the list of user-created public rooms
 *  so the /random page can list and join them.
 */

// Map<roomId, PublicRoomInfo>
const publicRooms = new Map();

/**
 * Create a new public room entry.
 */
function createPublicRoom({ roomId, name, maxParticipants, password, createdBy }) {
    publicRooms.set(roomId, {
        roomId,
        name: name || 'Umumiy Xona',
        maxParticipants: Math.min(Math.max(parseInt(maxParticipants) || 10, 2), 30),
        hasPassword: !!password,
        password: password || null,
        createdBy,
        createdAt: Date.now(),
        participantCount: 0
    });
}

/**
 * Remove a public room (when it empties).
 */
function removePublicRoom(roomId) {
    publicRooms.delete(roomId);
}

/**
 * Get a sanitized list of public rooms (no passwords).
 */
function getPublicRoomList() {
    return Array.from(publicRooms.values()).map(r => ({
        roomId: r.roomId,
        name: r.name,
        maxParticipants: r.maxParticipants,
        participantCount: r.participantCount,
        hasPassword: r.hasPassword,
        createdBy: r.createdBy,
        createdAt: r.createdAt
    }));
}

/**
 * Check if a room exists and if the password matches.
 */
function verifyPublicRoom(roomId, password = '') {
    const room = publicRooms.get(roomId);
    if (!room) return { ok: false, reason: 'not_found' };
    if (room.hasPassword && room.password !== password)
        return { ok: false, reason: 'wrong_password' };
    if (room.participantCount >= room.maxParticipants)
        return { ok: false, reason: 'full' };
    return { ok: true, room };
}

/**
 * Update participant count (called by randomSocket).
 */
function updateParticipantCount(roomId, delta) {
    const room = publicRooms.get(roomId);
    if (!room) return;
    room.participantCount = Math.max(0, room.participantCount + delta);
    if (room.participantCount === 0) removePublicRoom(roomId);
}

/**
 * Get a single room's info.
 */
function getRoom(roomId) {
    return publicRooms.get(roomId) || null;
}

module.exports = {
    createPublicRoom,
    removePublicRoom,
    getPublicRoomList,
    verifyPublicRoom,
    updateParticipantCount,
    getRoom,
};
