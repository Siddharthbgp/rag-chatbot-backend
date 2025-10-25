# RAG Chatbot Backend

## Tech Stack
- Embeddings: Jina (free tier, efficient for text embeddings, supports API calls without local models).
- Vector DB: Qdrant (open-source, lightweight, easy Node.js integration, good for similarity search).
- LLM API: Google Gemini (free trial, supports streaming for real-time responses).
- Backend: Node.js (Express) (as required, handles REST; integrated Socket.io for real-time chat).
- Cache & Sessions: Redis (in-memory, fast for session history with TTL support).
- Database (optional): Skipped for simplicity, as it's optional.

## Justification
Chose this stack for free/low-cost tools, ease of setup, and alignment with requirements. Jina over others for API simplicity; Qdrant for local Docker ease; Socket.io enhances chat with streaming.

## Setup
1. Install deps: npm install
2. Set .env vars (keys from Jina, Gemini; run Qdrant/Redis via Docker).
3. Ingest data: npm run ingest (runs once to fetch/store ~50 articles).
4. Start server: npm start

## Caching & Performance
- Sessions cached in Redis with TTL: e.g., client.expire(key, 3600) for 1-hour auto-expiration of inactive sessions, preventing memory leaks.
- Cache warming: Could be configured by pre-loading recent/popular sessions on server startup (e.g., query Redis for active keys and warm RAG cache), but not implemented here for simplicity. In production, add a startup script to fetch and embed trending news.

## Design Decisions
- Socket.io for chat to enable streaming (Gemini chunks emitted in real-time).
- REST for history/clear to keep simple fetches.
- Session ID: UUID generated if missing, stored per connection.
- Potential improvements: Add error handling for API limits, scale Qdrant/Redis clustering, implement optional Postgres for long-term transcripts (e.g., on session clear, insert JSON to DB).