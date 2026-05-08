import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const app = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Lazy-load allanime API (CommonJS)
let _api = null;
function getApi() {
  if (!_api) _api = require(join(__dirname, '../src/api/allanime.js'));
  return _api;
}

// GET /api/trending?limit=20&genre=Shounen
app.get('/api/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const genre = req.query.genre || null;
    const api = getApi();
    const results = await api.searchAnime('', { sortBy: 'Trending', limit });
    const mapped = results.map(r => ({
      id: r.id,
      title: r.name,
      coverImage: r.thumbnail || '',
      banner: r.banner || r.thumbnail || '',
      tags: r.genres || [],
      synopsis: r.description || '',
      score: r.score || 0,
      type: r.type || 'TV',
      episodes: r.episodes || 0,
    }));
    const filtered = genre
      ? mapped.filter(a => a.tags.some(t => t.toLowerCase().includes(genre.toLowerCase())))
      : mapped;
    res.json(filtered);
  } catch (err) {
    console.error('/api/trending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search?q=naruto
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q.trim()) return res.json([]);
    const api = getApi();
    const results = await api.searchAnime(q);
    res.json(results.map(r => ({
      id: r.id,
      title: r.name,
      coverImage: r.thumbnail || '',
      tags: r.genres || [],
      episodes: r.episodes || 0,
      score: r.score || 0,
    })));
  } catch (err) {
    console.error('/api/search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/episodes/:showId
app.get('/api/episodes/:showId', async (req, res) => {
  try {
    const api = getApi();
    const episodes = await api.getEpisodesList(req.params.showId);
    res.json(episodes);
  } catch (err) {
    console.error('/api/episodes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sources/:showId/:episode
app.get('/api/sources/:showId/:episode', async (req, res) => {
  try {
    const api = getApi();
    const { showId, episode } = req.params;
    console.log(`[STREAM] Fetching sources for ${showId} ep ${episode}`);
    const { sources, fallback } = await api.getEpisodeEmbedUrls(showId, episode);
    console.log(`[STREAM] Raw Embed Sources:`, Object.keys(sources));
    
    const links = await api.generateLinks(sources);
    console.log(`[STREAM] Extracted Links:`, links.length);
    
    const best = api.selectQuality(links, 'best');
    if (!best) {
      console.log(`[STREAM] ❌ No sources found, using fallback: ${fallback}`);
      return res.json({ url: fallback, quality: 'browser' });
    }
    
    console.log(`[STREAM] ✅ Found: ${best.url.substring(0, 50)}...`);
    res.json({ url: best.url, quality: best.quality });
  } catch (err) {
    console.error('/api/sources error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint to bypass CORS and Referer restrictions
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL required');

  try {
    const api = getApi();
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    const parsedUrl = new URL(targetUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': api.userAgent,
        'Referer': api.referer,
      }
    };

    protocol.get(targetUrl, options, (proxyRes) => {
      // Copy headers
      if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
      if (proxyRes.headers['content-encoding']) res.setHeader('Content-Encoding', proxyRes.headers['content-encoding']);
      if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
      
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      console.error('Proxy request error:', err.message);
      res.status(500).send(err.message);
    });
  } catch (err) {
    console.error('Proxy setup error:', err.message);
    res.status(500).send(err.message);
  }
});

// Redirect to best stream (used for direct browser opening)
app.get('/api/watch/:showId/:episode', async (req, res) => {
  try {
    const api = getApi();
    const { showId, episode } = req.params;
    console.log(`[WATCH] Redirect request for ${showId} ep ${episode}`);
    
    const { sources, fallback } = await api.getEpisodeEmbedUrls(showId, episode);
    const links = await api.generateLinks(sources);
    const best = api.selectQuality(links, 'best');
    
    const targetUrl = best ? best.url : fallback;
    console.log(`[WATCH] Redirecting to: ${targetUrl.substring(0, 50)}...`);
    res.redirect(targetUrl);
  } catch (err) {
    res.status(500).send('Error launching stream. Check terminal.');
  }
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✓\x1b[0m Anikage API server running at http://localhost:${PORT}`);
});
