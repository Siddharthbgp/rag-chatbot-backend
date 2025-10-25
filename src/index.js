require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const { queryRAGStream } = require('./rag/ragQuery'); // Updated to stream

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('sendMessage', async ({ sessionId, query }) => {
    console.log('Received message:', { sessionId, query });
    if (!sessionId) {
      sessionId = uuidv4();
      socket.emit('newSession', { sessionId });
      console.log('New session created:', sessionId);
    }

    // Append user message to history
    const historyKey = `chat:${sessionId}`;
    await redisClient.rPush(historyKey, JSON.stringify({ role: 'user', content: query }));
    await redisClient.expire(historyKey, 3600); // TTL 1 hour

    // Start bot response (empty initially)
    let fullResponse = '';
    await redisClient.rPush(historyKey, JSON.stringify({ role: 'bot', content: '' }));

    try {
      // Get stream from RAG
      const stream = await queryRAGStream(query);
      for await (const chunk of stream) {
        const textChunk = chunk.text() || ''; // Use text() from Gemini chunk
        fullResponse += textChunk;
        socket.emit('responseChunk', { sessionId, chunk: textChunk });
        console.log('Sent response chunk:', textChunk);
      }

      // Update final bot message in Redis
      const history = await redisClient.lRange(historyKey, 0, -1);
      const updatedHistory = history.map(JSON.parse);
      updatedHistory[updatedHistory.length - 1].content = fullResponse;
      await redisClient.del(historyKey);
      for (const msg of updatedHistory) {
        await redisClient.rPush(historyKey, JSON.stringify(msg));
      }
      await redisClient.expire(historyKey, 3600);
      console.log('Updated Redis history for session:', sessionId);
    } catch (error) {
      console.error('Error processing query:', error.message);
      socket.emit('responseChunk', { sessionId, chunk: 'Error processing your query' });
    }
  });

  // Add reset session handler
  socket.on('resetSession', async () => {
    const currentSessionId = socket.handshake.query.sessionId || null;
    if (currentSessionId) {
      const historyKey = `chat:${currentSessionId}`;
      await redisClient.del(historyKey); // Clear Redis history for the current session
      console.log('Cleared Redis history for session:', currentSessionId);
    }
    const newSessionId = uuidv4();
    socket.emit('newSession', { sessionId: newSessionId });
    console.log('Reset session, new session created:', newSessionId);
  });
});

app.get('/api/history/:sessionId', async (req, res) => {
  const historyKey = `chat:${req.params.sessionId}`;
  const history = await redisClient.lRange(historyKey, 0, -1);
  res.json(history.map(JSON.parse));
});

app.delete('/api/clear/:sessionId', async (req, res) => {
  const historyKey = `chat:${req.params.sessionId}`;
  await redisClient.del(historyKey);
  res.json({ message: 'Session cleared' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));