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

import { execFile } from 'child_process';
import { promisify } from 'util';
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

// SECURITY: Restrict CORS to localhost origins only (VULN-10)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (file://, Electron, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      /^file:\/\//
    ];
    if (allowed.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }
    callback(new Error('CORS: Origin not allowed'));
  }
}));
// SECURITY: Limit request body size to prevent DoS (VULN-12)
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

// Lazy-load allanime API
let _api = null;
export function getApi() {
  if (!_api) {
    const userDataPath = process.env.USER_DATA_PATH || join(os.homedir(), '.config', 'Anikage');
    const patchPath = join(userDataPath, 'patches', 'allanime.js');
    const bundledPath = join(__dirname, '../src/api/aggregator.js');
    
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

  // SECURITY: Validate URL format before passing to ffprobe (VULN-01)
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return 'unknown';
    }
  } catch (e) {
    return 'unknown';
  }

  return new Promise((resolve) => {
    const headersStr = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0\r\nReferer: https://youtu-chan.com\r\n";
    // SECURITY: Use execFile() with argument array to prevent shell injection (VULN-01)
    const args = [
      '-headers', headersStr,
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      url
    ];
    const timeout = setTimeout(() => {
      resolve('unknown');
    }, 2000);

    execFile('ffprobe', args, (error, stdout) => {
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

/**
 * Verify if a mirror URL is reachable (bypasses ISP DPI blocks)
 */
async function verifyMirrorReachability(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url.startsWith('//') ? 'https:' + url : url);
      const protocol = parsedUrl.protocol === 'https:' ? require('https') : require('http');
      
      const timer = setTimeout(() => {
        resolve(false);
      }, 5000); // 5 second max wait for connection

      const req = protocol.request({
        method: 'HEAD',
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
        },
        rejectUnauthorized: false,
        secureOptions: 0x40000000,
        ciphers: 'ALL',
        minVersion: 'TLSv1'
      }, res => {
        clearTimeout(timer);
        // Any HTTP status means we connected successfully
        resolve(true);
      });
      
      req.on('error', err => { 
        clearTimeout(timer); 
        // Strict check: if it fails TLS handshake due to ISP block, filter it out so UI doesn't break
        resolve(false); 
      });
      
      req.end();
    } catch (e) {
      resolve(false);
    }
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
    // SECURITY: Don't leak internal error details to clients (VULN-11)
    res.status(500).json({ error: 'Failed to fetch trending anime' });
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
    res.status(500).json({ error: 'Search failed' });
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
    res.status(500).json({ error: 'Failed to fetch episodes' });
  }
});

// GET /api/history
app.get('/api/history', async (req, res) => {
  try {
    const history = await db_helper.getRecentHistory(15);
    res.json(history);
  } catch (err) {
    console.error('/api/history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/history/:animeId
app.get('/api/history/:animeId', async (req, res) => {
  try {
    const progress = await db_helper.getProgress(req.params.animeId);
    res.json(progress);
  } catch (err) {
    console.error('GET /api/history/:animeId error:', err.message);
    res.status(500).json({ error: 'Failed to fetch anime progress' });
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
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// DELETE /api/history/:animeId
app.delete('/api/history/:animeId', async (req, res) => {
  try {
    await db_helper.removeHistory(req.params.animeId);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/history/:animeId error:', err.message);
    res.status(500).json({ error: 'Failed to remove watch history' });
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
    
    // Removed yt-mp4 filter to allow multi-scraper aggregator to pass its own sources
    console.log(`[STREAM] Embed Sources:`, Object.keys(sources));
    
    // Pass showId to generateLinks so aggregator knows which scraper to route to
    const links = await api.generateLinks(sources, showId);
    
    // Background fetch other scrapers and lump all the mirrors if title is provided
    if (req.query.title && typeof api.getExtraMirrors === 'function') {
      try {
        console.log(`[STREAM] Fetching extra mirrors across all scrapers for title: ${req.query.title}`);
        const extraLinks = await api.getExtraMirrors(req.query.title, episode, showId);
        if (extraLinks && extraLinks.length > 0) {
          links.push(...extraLinks);
        }
      } catch (err) {
        console.error('[STREAM] Failed to fetch extra mirrors:', err.message);
      }
    }
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

    // Probe metadata for resolution
    await Promise.all(linksToProbe.map(async (link) => {
      const detected = await probeMetadata(link.url);
      if (detected !== 'unknown') {
        link.quality = detected;
      }
    }));

    // Filter out ISP-blocked and completely dead mirrors before passing to UI
    console.log('[STREAM] Filtering out dead/ISP-blocked mirrors...');
    const reachableLinks = [];
    await Promise.all(uniqueLinks.map(async (link) => {
      const isReachable = await verifyMirrorReachability(link.url);
      if (isReachable) {
        reachableLinks.push(link);
      } else {
        console.log(`[STREAM] Dropped blocked mirror: ${link.provider} (${link.url.substring(0, 30)}...)`);
      }
    }));

    // Sort links by quality (descending)
    const sortedLinks = reachableLinks.sort((a, b) => {
      const qA = parseInt(a.quality) || 0;
      const qB = parseInt(b.quality) || 0;
      return qB - qA;
    });

    let responsePayload = sortedLinks.length === 0
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
    res.status(500).json({ error: 'Failed to fetch stream sources' });
  }
});

// Proxy endpoint to bypass CORS and Referer restrictions
// SECURITY: Allowlisted domains only to prevent SSRF (VULN-03)
const ALLOWED_PROXY_DOMAINS = [
  'allmanga.to', 'allanime.day', 'allanime.to',
  'blog.allanime.pro', 'youtu-chan.com',
  'wp.youtube-anime.com', 'cache.googlevideo.com',
  'workfields.xyz', 'sharepoint.com',
  'akamaized.net', 'biananset.net',
  'fast4speed.rsvp',
  'wixmp.com', 'repackager.wixmp.com',
  'gogoanime.', 'gogocdn.', 'gogo-cdn.',
  'vidstreamingcdn.', 'vidcdn.',
  'sbplay.', 'streamsb.', 'embedsb.',
  'mp4upload.com', 'mixdrop.', 'streamtape.',
  'kwik.cx', 'kwik.si',
  'v.vrv.co', 'pl.crunchyroll.com',
];

function isAllowedProxyDomain(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block private/internal IPs (SSRF protection)
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) return false;
    if (hostname === '169.254.169.254') return false; // Cloud metadata
    return ALLOWED_PROXY_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL required');

  // SECURITY: Validate target URL against allowlist (VULN-03)
  if (!isAllowedProxyDomain(targetUrl)) {
    console.warn(`[PROXY] Blocked disallowed domain: ${targetUrl}`);
    return res.status(403).send('Proxy: Domain not allowed');
  }

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
          'Origin': 'https://youtu-chan.com',
          'Accept': '*/*',
          'Range': req.headers.range || 'bytes=0-',
        },
        rejectUnauthorized: false, // Video CDNs often have cert issues; acceptable for local desktop app
        secureOptions: 0x40000000, // SSL_OP_LEGACY_SERVER_CONNECT
        ciphers: 'ALL',
        minVersion: 'TLSv1'
      };

      protocol.get(url, options, (proxyRes) => {
        // Handle Redirects
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          let nextUrl = proxyRes.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, url).href;
          }
          // SECURITY: Validate redirect targets too
          if (!isAllowedProxyDomain(nextUrl)) {
            console.warn(`[PROXY] Blocked redirect to disallowed domain: ${nextUrl}`);
            if (!res.headersSent) res.status(403).send('Proxy: Redirect domain not allowed');
            return;
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
        if (!res.headersSent) res.status(500).send('Proxy request failed');
      });
    } catch (err) {
      console.error('Proxy setup error:', err.message);
      if (!res.headersSent) res.status(500).send('Proxy setup failed');
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
    const links = await api.generateLinks(sources, showId);
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

// SECURITY: Bind to localhost only to prevent network exposure (VULN-13)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\x1b[32m✓\x1b[0m Anikage API server running at http://127.0.0.1:${PORT}`);
});
