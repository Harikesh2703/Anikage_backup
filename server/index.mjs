import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import { db_helper } from './db.mjs';
import { 
  downloadEvents, 
  processQueue, 
  pauseDownload, 
  cancelDownload, 
  getFFmpegPath 
} from './downloader.mjs';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id.startsWith('../utils/') && this.filename && (this.filename.includes('patches') || this.filename.includes('allanime.js'))) {
    const bundleSrcPath = process.env.NODE_PATH ? join(process.env.NODE_PATH, '../src') : join(__dirname, '../src');
    const resolvedPath = join(bundleSrcPath, 'utils', id.replace(/^\.\.\/utils\//, ''));
    return originalRequire.call(this, resolvedPath);
  }
  return originalRequire.apply(this, arguments);
};

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

// Lazy-load allanime API
let _api = null;
export function getApi() {
  if (!_api) {
    const userDataPath = process.env.USER_DATA_PATH || join(os.homedir(), '.config', 'Anikage');
    const patchPath = join(userDataPath, 'patches', 'allanime.js');
    const bundledPath = join(__dirname, '../src/api/allanime.js');
    
    const fs = require('fs');
    let apiPath = bundledPath;

    // SHADOW LOADING: Check for a hot-patch first
    if (fs.existsSync(patchPath)) {
      console.log('\x1b[35m[Hot-Patch]\x1b[0m Loading patched scraper from:', patchPath);
      apiPath = patchPath;
    }

    const apiModule = require(apiPath);
    _api = apiModule.default || apiModule;
  }
  return _api;
}

/**
 * Probe video metadata for resolution
 */
async function probeMetadata(url) {
  url = url.startsWith('//') ? 'https:' + url : url;
  // Check cache first
  try {
    const cached = await db_helper.getMetadata(url);
    if (cached) return cached;
  } catch (e) {
    console.error('Cache read error:', e.message);
  }

  return new Promise((resolve) => {
    const headersStr = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0\r\nReferer: https://allmanga.to\r\n";
    const cmd = `ffprobe -headers "${headersStr}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${url}"`;
    const timeout = setTimeout(() => {
      resolve('unknown');
    }, 2000);

    exec(cmd, (error, stdout) => {
      clearTimeout(timeout);
      if (error || !stdout.trim()) {
        resolve('unknown');
      } else {
        const [width, height] = stdout.trim().split(',').map(n => parseInt(n));
        let res = 'unknown';
        if (height >= 1080) res = '1080p';
        else if (height >= 720) res = '720p';
        else if (height >= 480) res = '480p';
        else if (height >= 360) res = '360p';
        else if (height > 0) res = height + 'p';

        // Save to cache
        db_helper.saveMetadata(url, res).catch(e => console.error('Cache write error:', e.message));
        resolve(res);
      }
    });
  });
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

// GET /api/history
app.get('/api/history', async (req, res) => {
  try {
    const history = await db_helper.getRecentHistory(15);
    res.json(history);
  } catch (err) {
    console.error('/api/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/:animeId
app.get('/api/history/:animeId', async (req, res) => {
  try {
    const progress = await db_helper.getProgress(req.params.animeId);
    res.json(progress);
  } catch (err) {
    console.error('GET /api/history/:animeId error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/history
app.post('/api/history', async (req, res) => {
  try {
    const { id, title, coverImage, episode, tags, progressPercent, currentTime, duration } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'ID and Title required' });
    await db_helper.saveProgress(
      id,
      title,
      coverImage,
      episode,
      tags,
      parseInt(progressPercent) || 0,
      parseFloat(currentTime) || 0,
      parseFloat(duration) || 0
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sources/:showId/:episode
app.get('/api/sources/:showId/:episode', async (req, res) => {
  try {
    const { showId, episode } = req.params;
    const cacheKey = `${showId}:${episode}`;

    // Try reading from cache first
    try {
      const cached = await db_helper.getLinksFromCache(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] Serving sources for ${showId} ep ${episode} from SQLite cache`);
        return res.json(cached);
      }
    } catch (cacheErr) {
      console.error('[CACHE ERROR] Read failed:', cacheErr.message);
    }

    const api = getApi();
    console.log(`[STREAM] Fetching sources for ${showId} ep ${episode}`);
    const { sources, fallback } = await api.getEpisodeEmbedUrls(showId, episode);
    console.log(`[STREAM] Raw Embed Sources:`, Object.keys(sources));
    
    const links = await api.generateLinks(sources);
    console.log(`[STREAM] Extracted Links:`, links.length);
    
    // Filter out duplicates and probe for real resolution if needed
    const uniqueLinks = [];
    const seenUrls = new Set();
    const linksToProbe = [];

    for (const link of links) {
      if (seenUrls.has(link.url)) continue;
      seenUrls.add(link.url);
      uniqueLinks.push(link);
      
      if (link.quality === 'unknown' || link.quality === 'hls' || !link.quality) {
        linksToProbe.push(link);
      }
    }

    // Probe all in parallel (max 2s wait total)
    await Promise.all(linksToProbe.map(async (link) => {
      const detected = await probeMetadata(link.url);
      if (detected !== 'unknown') {
        link.quality = detected;
      }
    }));

    // Sort links by quality (descending)
    const sortedLinks = uniqueLinks.sort((a, b) => {
      const qA = parseInt(a.quality) || 0;
      const qB = parseInt(b.quality) || 0;
      return qB - qA;
    });

    const responsePayload = sortedLinks.length === 0
      ? { 
          sources: [{ url: fallback, quality: 'browser', provider: 'Fallback' }],
          fallback 
        }
      : { 
          sources: sortedLinks,
          fallback
        };

    // Save to cache in the background
    db_helper.saveLinksToCache(cacheKey, responsePayload)
      .then(() => console.log(`[CACHE] Saved links for ${showId} ep ${episode}`))
      .catch(cacheErr => console.error('[CACHE ERROR] Write failed:', cacheErr.message));

    res.json(responsePayload);
  } catch (err) {
    console.error('/api/sources error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint to bypass CORS and Referer restrictions
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL required');

  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  const proxyRequest = (url, depth = 0) => {
    if (depth > 5) {
      if (!res.headersSent) res.status(502).send('Too many redirects');
      return;
    }

    try {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const api = getApi();

      const options = {
        headers: {
          'User-Agent': api.userAgent,
          'Referer': api.referer,
          'Origin': 'https://allmanga.to',
          'Accept': '*/*',
          'Range': req.headers.range || 'bytes=0-',
        },
        rejectUnauthorized: false // Handle self-signed or invalid certs from video hosts
      };

      protocol.get(url, options, (proxyRes) => {
        // Handle Redirects
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          let nextUrl = proxyRes.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, url).href;
          }
          return proxyRequest(nextUrl, depth + 1);
        }

        // Setup response headers
        res.status(proxyRes.statusCode || 200);
        
        // Essential CORS for Range requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

        if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
        if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
        if (proxyRes.headers['content-range']) res.setHeader('Content-Range', proxyRes.headers['content-range']);
        if (proxyRes.headers['accept-ranges']) res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);

        // Pipe directly (The Fix for 'Memory Overhead')
        proxyRes.pipe(res);

        proxyRes.on('error', (err) => {
          console.error('Proxy stream error:', err.message);
          res.end();
        });
      }).on('error', (err) => {
        console.error('Proxy request error:', err.message);
        if (!res.headersSent) res.status(500).send(err.message);
      });
    } catch (err) {
      console.error('Proxy setup error:', err.message);
      if (!res.headersSent) res.status(500).send(err.message);
    }
  };

  proxyRequest(targetUrl);
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

// --- DOWNLOADS ROUTES ---

// GET /api/downloads - List all downloads
app.get('/api/downloads', async (req, res) => {
  try {
    const downloads = await db_helper.getAllDownloads();
    res.json(downloads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/downloads/enqueue - Add task to download queue
app.post('/api/downloads/enqueue', async (req, res) => {
  try {
    const { animeId, animeTitle, coverImage, episodeNumber, quality, streamUrl } = req.body;
    if (!animeId || !animeTitle || !episodeNumber || !quality) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    const id = `${animeId}-${episodeNumber}-${quality}`;
    const task = {
      id,
      animeId,
      animeTitle,
      coverImage,
      episodeNumber,
      quality,
      streamUrl: streamUrl || null,
      status: 'QUEUED',
      progress: 0,
      downloadedSegments: 0,
      totalSegments: 0
    };
    await db_helper.saveDownloadTask(task);
    res.json({ success: true, task });
    
    // Process queue in background
    processQueue();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/downloads/pause - Pause download task
app.post('/api/downloads/pause', async (req, res) => {
  try {
    const { id } = req.body;
    await pauseDownload(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/downloads/resume - Resume download task
app.post('/api/downloads/resume', async (req, res) => {
  try {
    const { id } = req.body;
    const task = await db_helper.getDownloadTask(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    task.status = 'QUEUED';
    await db_helper.saveDownloadTask(task);
    res.json({ success: true });
    
    processQueue();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/downloads/cancel - Cancel download task
app.post('/api/downloads/cancel', async (req, res) => {
  try {
    const { id } = req.body;
    await cancelDownload(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/downloads/:id - Delete download task metadata
app.delete('/api/downloads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db_helper.deleteDownloadTask(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/download-path - Get custom download directory
app.get('/api/settings/download-path', async (req, res) => {
  try {
    const customPath = await db_helper.getSetting('download_path');
    res.json({ path: customPath || join(os.homedir(), 'Downloads') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/download-path - Set custom download directory
app.post('/api/settings/download-path', async (req, res) => {
  try {
    const { path: newPath } = req.body;
    await db_helper.saveSetting('download_path', newPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/ffmpeg-path - Get custom FFmpeg path
app.get('/api/settings/ffmpeg-path', async (req, res) => {
  try {
    const customPath = await db_helper.getSetting('ffmpeg_path');
    const actualPath = await getFFmpegPath();
    res.json({ customPath: customPath || '', actualPath: actualPath || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/ffmpeg-path - Set custom FFmpeg path
app.post('/api/settings/ffmpeg-path', async (req, res) => {
  try {
    const { path: newPath } = req.body;
    await db_helper.saveSetting('ffmpeg_path', newPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE Event Stream for download progress and state updates
const sseClients = new Set();

app.get('/api/downloads/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  sseClients.add(res);
  
  // Keep connection alive with simple comments
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Listen to downloader events and broadcast to all connected web clients
downloadEvents.on('progress', (data) => {
  const payload = JSON.stringify({ type: 'progress', data });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
});

downloadEvents.on('state-change', (data) => {
  const payload = JSON.stringify({ type: 'state-change', data });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
});

downloadEvents.on('batch-notification', (data) => {
  const payload = JSON.stringify({ type: 'batch-notification', data });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✓\x1b[0m Anikage API server running at http://localhost:${PORT}`);
});
