const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Robust Qdrant URL handling
let qdrantUrl = process.env.QDRANT_URL;
if (!qdrantUrl || qdrantUrl.includes('<your-qdrant-instance>')) {
  qdrantUrl = `http://${process.env.QDRANT_HOST || 'localhost'}:${process.env.QDRANT_PORT || 6333}`;
  console.warn('QDRANT_URL invalid, falling back to:', qdrantUrl);
} else {
  console.log('Using QDRANT_URL:', qdrantUrl);
}
const client = new QdrantClient({ url: qdrantUrl });

async function* queryRAGStream(query) {
  try {
    console.log('Starting RAG query for:', query);

    // Generate query embedding with Jina
    const embeddingResponse = await axios.post('https://api.jina.ai/v1/embeddings', {
      input: query,
      model: 'jina-embeddings-v2-base-en',
    }, {
      headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}` },
    });
    const queryEmbedding = embeddingResponse.data.data[0].embedding;
    console.log('Query embedding generated, length:', queryEmbedding.length);

    // Search Qdrant for relevant passages
    const searchResults = await client.search(process.env.QDRANT_COLLECTION || 'news', {
      vector: queryEmbedding,
      limit: 5,
    });
    console.log('Qdrant search results count:', searchResults.length);
    const context = searchResults.map(result => result.payload.content).join('\n\n');

    // Stream with Gemini 2.0 Flash
    const prompt = `Based on this news context: ${context}\n\nAnswer the query: ${query}`;
    const result = await model.generateContentStream(prompt);
    let fullResponse = '';
    for await (const chunk of result.stream) {
      const textChunk = chunk.text();
      fullResponse += textChunk;
      console.log('Gemini chunk received:', textChunk);
      yield { text: () => textChunk }; // Yield chunk for real-time emission
    }
    console.log('Full Gemini response length:', fullResponse.length);
  } catch (error) {
    console.error('RAG query error:', error.message);
    yield { text: () => 'Error processing your query' };
  }
}

module.exports = { queryRAGStream };