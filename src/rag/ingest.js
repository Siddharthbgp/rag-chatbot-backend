const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const parseString = require('xml2js').parseStringPromise;

async function ingestNews() {
  const sitemapUrl = 'https://www.reuters.com/arc/outboundfeeds/sitemap-index/?outputType=xml';
  const response = await axios.get(sitemapUrl);
  const xml = await parseString(response.data);
  const articleSitemaps = xml['sitemapindex']['sitemap'].slice(0, 1); // Limit to first sitemap for ~50 articles

  let articles = [];
  for (const sm of articleSitemaps) {
    const smUrl = sm.loc[0];
    const smResponse = await axios.get(smUrl);
    const smXml = await parseString(smResponse.data);
    const urls = smXml['urlset']['url'].slice(0, 50); // Limit to 50

    for (const urlObj of urls) {
      const articleUrl = urlObj.loc[0];
      const articleRes = await axios.get(articleUrl);
      const $ = cheerio.load(articleRes.data);
      const title = $('h1').text();
      const content = $('div[data-testid="Body"] p').text();
      articles.push({ title, content, url: articleUrl });
    }
  }

  fs.writeFileSync('./data/articles.json', JSON.stringify(articles, null, 2));
  console.log('Ingested articles');
}

ingestNews().catch(console.error);