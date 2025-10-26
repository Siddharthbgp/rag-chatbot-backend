require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { queryRAGStream } = require('./rag/ragQuery');
const redis = require('redis');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Redis client setup for Upstash with TLS and proper error handling
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  tls: { rejectUnauthorized: false } // Upstash requires TLS, disable strict cert check for simplicity
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
  }
})();

app.use(express.json());

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('sendMessage', async ({ sessionId, query }) => {
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      socket.emit('newSession', { sessionId: currentSessionId });
      console.log('New session created:', currentSessionId);
    }

    let fullResponse = '';
    try {
      const stream = await queryRAGStream(query);
      for await (const chunk of stream) {
        const textChunk = chunk.text() || '';
        fullResponse += textChunk;
        socket.emit('responseChunk', { sessionId: currentSessionId, chunk: textChunk });
        console.log('Sent response chunk:', textChunk);
      }
      // Update Redis history with error handling
      try {
        await redisClient.set(`session:${currentSessionId}`, fullResponse);
        console.log('Updated Redis history for session:', currentSessionId);
      } catch (redisErr) {
        console.error('Redis update failed:', redisErr.message);
      }
    } catch (error) {
      console.error('RAG query error:', error.message);
      socket.emit('responseChunk', { sessionId: currentSessionId, chunk: 'Error processing your query' });
    }
  });

  socket.on('resetSession', () => {
    const newSessionId = crypto.randomUUID();
    socket.emit('newSession', { sessionId: newSessionId });
    console.log('Reset session to:', newSessionId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});