const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
    // Rooms Table
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        host TEXT,
        isPrivate INTEGER DEFAULT 0,
        startTime INTEGER,
        chatEnabled INTEGER DEFAULT 1,
        theaterMode INTEGER DEFAULT 0,
        gameType TEXT
    )`);

    // Scheduled Meetings Table
    db.run(`CREATE TABLE IF NOT EXISTS scheduled_meetings (
        id TEXT PRIMARY KEY,
        title TEXT,
        time TEXT,
        hostName TEXT
    )`);

    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        createdAt INTEGER
    )`);

    // Scores Table
    db.run(`CREATE TABLE IF NOT EXISTS scores (
        userId TEXT,
        gameType TEXT,
        score INTEGER,
        timestamp INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    console.log('[DB] Database initialized successfully.');
});

module.exports = {
    // Rooms
    saveRoom: (room) => {
        const stmt = db.prepare('REPLACE INTO rooms (id, host, isPrivate, startTime, chatEnabled, theaterMode, gameType) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run(room.id, room.host, room.isPrivate ? 1 : 0, room.startTime, room.chatEnabled ? 1 : 0, room.theaterMode ? 1 : 0, room.gameType || null);
        stmt.finalize();
    },
    deleteRoom: (id) => {
        db.run('DELETE FROM rooms WHERE id = ?', id);
    },
    getRooms: (callback) => {
        db.all('SELECT * FROM rooms', (err, rows) => callback(err, rows));
    },

    // Scheduled Meetings
    saveMeeting: (m) => {
        const stmt = db.prepare('REPLACE INTO scheduled_meetings (id, title, time, hostName) VALUES (?, ?, ?, ?)');
        stmt.run(m.id, m.title, m.time, m.hostName);
        stmt.finalize();
    },
    deleteMeeting: (id) => {
        db.run('DELETE FROM scheduled_meetings WHERE id = ?', id);
    },
    getMeetings: (callback) => {
        db.all('SELECT * FROM scheduled_meetings', (err, rows) => callback(err, rows));
    },

    // Users & Scores
    upsertUser: (id, name) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO users (id, name, createdAt) VALUES (?, ?, ?)');
        stmt.run(id, name, Date.now());
        stmt.finalize();
    },
    addScore: (userId, gameType, score) => {
        const stmt = db.prepare('INSERT INTO scores (userId, gameType, score, timestamp) VALUES (?, ?, ?, ?)');
        stmt.run(userId, gameType, score, Date.now());
        stmt.finalize();
    },
    getLeaderboard: (gameType, callback) => {
        const query = `
            SELECT u.name, SUM(s.score) as totalScore 
            FROM scores s 
            JOIN users u ON s.userId = u.id 
            WHERE s.gameType = ? 
            GROUP BY u.id 
            ORDER BY totalScore DESC 
            LIMIT 10`;
        db.all(query, [gameType], (err, rows) => callback(err, rows));
    }
};
