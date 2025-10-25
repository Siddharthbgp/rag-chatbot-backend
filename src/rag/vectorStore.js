require('dotenv').config();
const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

console.log('JINA_API_KEY:', process.env.JINA_API_KEY);

const client = new QdrantClient({
  host: process.env.QDRANT_HOST,
  port: process.env.QDRANT_PORT,
  checkCompatibility: false,
});

async function storeEmbeddings() {
  // Read articles from JSON file
  const articlesData = JSON.parse(fs.readFileSync('data/articles.json', 'utf-8'));

  // Check if collection exists
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some(c => c.name === 'news');

  if (!collectionExists) {
    // Create collection if it doesn't exist
    await client.createCollection('news', {
      vectors: { size: 768, distance: 'Cosine' }, // Adjust size based on Jina embeddings
    });
    console.log('Created collection "news"');
  } else {
    console.log('Collection "news" already exists, skipping creation');
  }

  // Prepare data for upsert
  const points = [];
  for (const article of articlesData) {
    const response = await axios.post('https://api.jina.ai/v1/embeddings', {
      input: article.content,
      model: 'jina-embeddings-v2-base-en',
    }, {
      headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}` },
    });
    const embedding = response.data.data[0].embedding;
    points.push({
      id: uuidv4(),
      vector: embedding,
      payload: { url: article.url, title: article.title, content: article.content },
    });
  }

  // Upsert points into the collection
  if (points.length > 0) {
    await client.upsert('news', {
      wait: true,
      points,
    });
    console.log(`Upserted ${points.length} articles into "news" collection`);
  } else {
    console.log('No articles to upsert');
  }
}

// Execute the function
storeEmbeddings().catch(console.error);