require('dotenv').config(); // Load environment variables
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });



// ✅ Check if `DATABASE_URL` Exists
if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is not defined in the .env file.");
    process.exit(1); // Stop the server if DB URL is missing
}

// ✅ PostgreSQL Connection (Fix SSL Issue)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.startsWith("postgresql://localhost") ? false : { rejectUnauthorized: false }
});

// ✅ Ensure Database Connection
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL (External DB)'))
  .catch(err => {
      console.error('❌ Database Connection Error:', err);
      process.exit(1); // Exit if connection fails
  });

  
// ✅ Validate User & Room Access
const checkRoomAccess = async (room, username) => {
    const result = await pool.query(`SELECT users FROM rooms WHERE room_name = $1`, [room]);
    if (result.rows.length === 0) return false; 
    return result.rows[0].users.includes(username.toLowerCase());
};

// ✅ WebSocket Events
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ✅ Handle Joining Room
    socket.on('join room', async ({ room, username }) => {
        room = room.toLowerCase();
        username = username.toLowerCase();

        if (!(await checkRoomAccess(room, username))) {
            socket.emit('error', 'Access Denied');
            return;
        }

        socket.join(room);
        console.log(`${username} joined ${room}`);

        // ✅ Load Chat History from Database
        try {
            const messages = await pool.query(`SELECT username, message, timestamp FROM ${room}_chats ORDER BY timestamp ASC`);
            socket.emit('chat history', messages.rows);
        } catch (error) {
            console.error("❌ Error fetching chat history:", error);
        }
    });

    // ✅ Handle Sending Messages
    socket.on('chat message', async ({ room, username, message }) => {
        room = room.toLowerCase();
        username = username.toLowerCase();

        if (!(await checkRoomAccess(room, username))) {
            socket.emit('error', 'Access Denied');
            return;
        }

        try {
            await pool.query(`INSERT INTO ${room}_chats (username, message) VALUES ($1, $2)`, [username, message]);
            io.to(room).emit('chat message', { username, message });
        } catch (error) {
            console.error("❌ Error saving message:", error);
        }
    });

    // ✅ Handle User Disconnect
    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected.`);
    });
});

// ✅ Start Server (For Local & Render Deployment)
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
