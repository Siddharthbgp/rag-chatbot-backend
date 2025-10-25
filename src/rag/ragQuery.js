const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();

const client = new QdrantClient({
  host: process.env.QDRANT_HOST || 'localhost',
  port: process.env.QDRANT_PORT || 6333,
  checkCompatibility: false,
});

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
    const searchResults = await client.search('news', {
      vector: queryEmbedding,
      limit: 5,
    });
    console.log('Qdrant search results count:', searchResults.length);
    const context = searchResults.map(result => result.payload.content).join('\n\n');

    // Call Gemini API with supported model
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const geminiResponse = await axios.post(geminiUrl, {
      contents: [{
        role: 'user',
        parts: [{
          text: `Based on this news context: ${context}\n\nAnswer the query: ${query}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    const textResponse = geminiResponse.data.candidates[0].content.parts[0].text || 'No response from Gemini';
    console.log('Gemini API response received, length:', textResponse.length);

    yield { text: () => textResponse };
  } catch (error) {
    console.error('RAG query error:', error.message);
    if (error.response) {
      console.error('Gemini API response error:', error.response.data);
    }
    yield { text: () => 'Error processing your query' };
  }
}

module.exports = { queryRAGStream };