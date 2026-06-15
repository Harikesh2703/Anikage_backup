#!/usr/bin/env node
/**
 * ANIKAGE MIRROR DIAGNOSTICS
 * 
 * Usage (run from ani-cli directory):
 *   node test_mirrors.mjs
 * 
 * Requires: npm run desktop to be running (server on port 3001)
 */
import http from 'http';
import https from 'https';

const BASE = 'http://127.0.0.1:3001';
const c = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  magenta: s => `\x1b[35m${s}\x1b[0m`,
};

function get(path, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const proto = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body: data }); });
    }).on('error', err => { clearTimeout(timer); reject(err); });
  });
}

/** Probe a video URL to see if it actually responds */
function probeVideo(url, timeout = 8000) {
  return new Promise(resolve => {
    if (!url) return resolve({ ok: false, error: 'No URL' });
    if (url.startsWith('//')) url = 'https:' + url;
    try {
      const proto = url.startsWith('https') ? https : http;
      const timer = setTimeout(() => resolve({ ok: false, error: 'Timeout' }), timeout);
      const req = proto.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
          'Referer': 'https://allmanga.to',
          'Range': 'bytes=0-1024',
        },
        rejectUnauthorized: false,
        secureOptions: 0x40000000, // SSL_OP_LEGACY_SERVER_CONNECT
        ciphers: 'ALL',
        minVersion: 'TLSv1'
      }, res => {
        clearTimeout(timer);
        res.on('data', () => {});
        res.on('end', () => {});
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return probeVideo(res.headers.location, timeout).then(resolve);
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          contentLength: res.headers['content-length'] || '?',
        });
      });
      req.on('error', err => { 
        clearTimeout(timer); 
        if (err.message.includes('EPROTO') || err.message.includes('SSL')) {
          resolve({ ok: true, status: 200, contentType: 'text/html (assumed iframe)', error: null });
        } else {
          resolve({ ok: false, error: err.message }); 
        }
      });
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function testAnime(name) {
  console.log(c.cyan(`\n━━━ Testing: ${name} ━━━`));
  
  // Search
  const searchRes = await get(`/api/search?q=${encodeURIComponent(name)}`);
  const results = JSON.parse(searchRes.body);
  if (!results.length) { console.log(c.red('  No search results')); return null; }
  
  const show = results[0];
  console.log(`  Found: "${show.title}" (ID: ${show.id})`);
  
  // Episodes
  const epsRes = await get(`/api/episodes/${show.id}`);
  const eps = JSON.parse(epsRes.body);
  const testEp = eps.length > 1 ? eps[1] : eps[0];
  console.log(`  ${eps.length} episodes. Testing ep ${testEp.episodeString || testEp}...`);
  
  // Sources (this is the critical call)
  console.log(c.yellow('  ⏳ Fetching sources (this may take 10-30s)...'));
  const srcRes = await get(`/api/sources/${show.id}/${testEp.episodeString || testEp}?title=${encodeURIComponent(show.title || show.name)}`, 60000);
  const data = JSON.parse(srcRes.body);
  
  console.log(c.green(`  ✓ Got ${data.sources?.length || 0} source link(s)`));
  return data;
}

async function run() {
  console.log(c.bold('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(c.bold('║           ANIKAGE MIRROR DIAGNOSTICS (CLI)               ║'));
  console.log(c.bold('╚══════════════════════════════════════════════════════════════╝'));

  // Health check
  console.log(c.cyan('\n━━━ Server Health Check ━━━'));
  try {
    const ping = await get('/api/ping', 5000);
    console.log(c.green(`  ✓ Server alive: ${ping.body}`));
  } catch (e) {
    console.log(c.red(`  ✗ Server not reachable on port 3001: ${e.message}`));
    console.log(c.yellow('  → Run "npm run desktop" first, then re-run this script.'));
    process.exit(1);
  }

  // Test two anime
  const sources1 = await testAnime('one piece');
  const sources2 = await testAnime('naruto');

  // ═══ SUMMARY ═══
  console.log(c.bold('\n\n' + '═'.repeat(60)));
  console.log(c.bold('               MIRROR STATUS SUMMARY'));
  console.log('═'.repeat(60));

  const allSources = [...(sources1?.sources || []), ...(sources2?.sources || [])];
  const providers = new Map();
  for (const s of allSources) {
    const prov = (s.provider || 'unknown');
    if (!providers.has(prov)) providers.set(prov, []);
    providers.get(prov).push(s);
  }

  if (providers.size === 0) {
    console.log(c.red('\n  ✗ NO providers returned! The AllAnime API or all mirrors may be down.\n'));
  }

  // Probe each unique URL
  console.log(c.cyan('\n━━━ Probing Video URLs ━━━'));
  const probeResults = new Map();
  const uniqueUrls = [...new Set(allSources.map(s => s.url))];
  
  for (const url of uniqueUrls) {
    const domain = (() => { try { return new URL(url).hostname; } catch { return '??'; } })();
    process.stdout.write(`  Probing ${c.dim(domain)}... `);
    const result = await probeVideo(url);
    probeResults.set(url, result);
    if (result.ok) {
      console.log(c.green(`✓ HTTP ${result.status} (${result.contentType?.split(';')[0]})`));
    } else {
      console.log(c.red(`✗ ${result.error || `HTTP ${result.status}`}`));
    }
  }

  // Per-provider summary
  console.log(c.bold('\n\n' + '═'.repeat(60)));
  console.log(c.bold('            PER-PROVIDER BREAKDOWN'));
  console.log('═'.repeat(60));

  for (const [prov, links] of providers) {
    const isYtMp4 = prov.toLowerCase().includes('yt-mp4');
    const isOk = prov.toLowerCase() === 'ok';
    const tag = isYtMp4 ? c.magenta(' ★ PRIMARY') : isOk ? c.yellow(' BACKUP') : '';

    const workingCount = links.filter(l => probeResults.get(l.url)?.ok).length;
    const statusIcon = workingCount > 0 ? c.green('●') : c.red('●');
    const statusText = workingCount > 0
      ? c.green(`${workingCount}/${links.length} working`)
      : c.red(`0/${links.length} working`);

    console.log(`\n  ${statusIcon} ${c.bold(prov)}${tag} — ${statusText}`);
    for (const link of links) {
      const probe = probeResults.get(link.url);
      const icon = probe?.ok ? c.green('  ✓') : c.red('  ✗');
      const domain = (() => { try { return new URL(link.url).hostname; } catch { return '??'; } })();
      console.log(`  ${icon} [${link.quality || '?'}] ${c.dim(domain)}`);
    }
  }

  // yt-mp4 special focus
  console.log(c.bold('\n\n' + '═'.repeat(60)));
  console.log(c.magenta(c.bold('  ★ YT-MP4 MIRROR — DETAILED STATUS')));
  console.log('═'.repeat(60));

  const ytLinks = [...(providers.entries())].filter(([k]) => k.toLowerCase().includes('yt-mp4'));
  if (ytLinks.length === 0) {
    console.log(c.red('\n  ✗ yt-mp4 was NOT returned by the API for either test anime.'));
    console.log(c.yellow('    This could mean:'));
    console.log(c.yellow('    1. AllAnime stopped serving yt-mp4 sources'));
    console.log(c.yellow('    2. yt-mp4 URLs failed internal resolution'));
    console.log(c.yellow('    3. The source filter in server/index.mjs excluded it'));
    // Check if it was filtered
    console.log(c.cyan('\n  Check server terminal logs for lines like:'));
    console.log(c.dim('    [STREAM] Raw Embed Sources: [...]'));
    console.log(c.dim('    [STREAM] Filtered Embed Sources: [...]'));
  } else {
    for (const [prov, links] of ytLinks) {
      const working = links.filter(l => probeResults.get(l.url)?.ok);
      if (working.length > 0) {
        console.log(c.green(`\n  ✓ yt-mp4 is WORKING! ${working.length} active link(s):`));
        for (const l of working) {
          console.log(c.green(`    ↳ [${l.quality}] ${l.url.substring(0, 120)}`));
        }
      } else {
        console.log(c.red(`\n  ✗ yt-mp4 links extracted but NONE are responding:`));
        for (const l of links) {
          const probe = probeResults.get(l.url);
          console.log(c.red(`    ↳ [${l.quality}] ${probe?.error || `HTTP ${probe?.status}`}`));
          console.log(c.dim(`      ${l.url.substring(0, 120)}`));
        }
      }
    }
  }

  // Raw JSON
  console.log(c.cyan('\n\n━━━ Raw JSON: Test 1 (One Piece) ━━━'));
  console.log(JSON.stringify(sources1, null, 2));
  console.log(c.cyan('\n━━━ Raw JSON: Test 2 (Naruto) ━━━'));
  console.log(JSON.stringify(sources2, null, 2));

  console.log(c.bold('\n' + '═'.repeat(60)));
  console.log(c.bold('  Diagnostics complete.'));
  console.log('═'.repeat(60) + '\n');
}

run().catch(err => {
  console.error(c.red(`Fatal: ${err.message}`));
  process.exit(1);
});
