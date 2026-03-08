/**
 * ─────────────────────────────────────────
 *  PDP Chat – Random Matchmaking Queue
 *  File: server/matchmaking/queue.js
 * ─────────────────────────────────────────
 *  Manages the waiting pool for 1-on-1 random chats.
 *  Uses an in-memory Set for fast O(1) lookups.
 */

const crypto = require('crypto');

// Waiting users: Map<socketId, { socketId, name, interests, joinedAt }>
const waitingQueue = new Map();

// Rate limiter: Map<socketId, { count, windowStart }>
const nextClickTracker = new Map();

const RATE_LIMIT_MAX = 5;   // max "Next" clicks
const RATE_LIMIT_WINDOW = 60 * 1000; // per 60 seconds

/**
 * Add a user to the matchmaking queue.
 * Returns false if already in queue.
 */
function addToQueue(socketId, name, interests = []) {
    if (waitingQueue.has(socketId)) return false;
    waitingQueue.set(socketId, { socketId, name, interests, joinedAt: Date.now() });
    return true;
}

/**
 * Remove a user from the queue (on disconnect / cancel / match).
 */
function removeFromQueue(socketId) {
    return waitingQueue.delete(socketId);
}

/**
 * Find the best match for a given user.
 * Prefers users with common interests; falls back to first available.
 * Returns the matched user's data object, or null.
 */
function findMatch(socketId, interests = []) {
    if (waitingQueue.size === 0) return null;

    let bestMatch = null;
    let bestScore = -1;

    for (const [sid, user] of waitingQueue) {
        if (sid === socketId) continue; // skip self

        const common = interests.filter(i => user.interests.includes(i)).length;
        if (common > bestScore) {
            bestScore = common;
            bestMatch = user;
        }
    }

    if (bestMatch) removeFromQueue(bestMatch.socketId);
    return bestMatch;
}

/**
 * Check if a socket is currently in queue.
 */
function isInQueue(socketId) {
    return waitingQueue.has(socketId);
}

/**
 * Returns current queue length (excluding the searching user).
 */
function queueSize() {
    return waitingQueue.size;
}

/**
 * Rate-limit the "Next Partner" clicks.
 * Returns true = allowed, false = rate-limited.
 */
function checkRateLimit(socketId) {
    const now = Date.now();
    const entry = nextClickTracker.get(socketId) || { count: 0, windowStart: now };

    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
        // Reset window
        entry.count = 1;
        entry.windowStart = now;
    } else {
        entry.count++;
    }

    nextClickTracker.set(socketId, entry);
    return entry.count <= RATE_LIMIT_MAX;
}

/**
 * Clear rate limit info for a socket (on disconnect).
 */
function clearRateLimit(socketId) {
    nextClickTracker.delete(socketId);
}

module.exports = {
    addToQueue,
    removeFromQueue,
    findMatch,
    isInQueue,
    queueSize,
    checkRateLimit,
    clearRateLimit,
};
