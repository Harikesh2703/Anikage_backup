const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('../utils/config');
const helpers = require('../utils/helpers');

class AllAnimeAPI {
  constructor() {
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";
    this.referer = "https://youtu-chan.com";
    this.apiUrl = config.allanimeApi ? `${config.allanimeApi}/api` : "https://api.allanime.day/api";
  }

  decryptTobeparsed(blob) {
    const crypto = require('crypto');
    const buffer = Buffer.from(blob, 'base64');
    const key = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest();
    const ivBuffer = buffer.subarray(1, 13);
    const counter = Buffer.from([0, 0, 0, 2]);
    const ctrBuffer = Buffer.concat([ivBuffer, counter]);
    const ctLen = buffer.length - 13 - 16;
    const ciphertext = buffer.subarray(13, 13 + ctLen);
    
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, ctrBuffer);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  // SECURITY: Use native https request instead of shell-based curl to prevent
  // command injection via crafted URLs or API responses (VULN-02)
  async executeGraphql(query, variables) {
    const payload = JSON.stringify({ query, variables });
    const parsedUrl = new URL(this.apiUrl);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Referer': this.referer,
          'Origin': 'https://youtu-chan.com',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse GraphQL response: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // SECURITY: Use native https GET instead of shell-based curl (VULN-02)
  async execGet(url) {
    if (url.startsWith('//')) url = 'https:' + url;
    const parsedUrl = new URL(url);
    
    return new Promise((resolve, reject) => {
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': this.referer,
          'Origin': 'https://youtu-chan.com',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      };
      
      protocol.get(url, options, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this.execGet(res.headers.location));
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  /**
   * Search for anime
   */
  async searchAnime(query, opts = {}) {
    const searchGql = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name thumbnail banner description score genres tags type availableEpisodes __typename } }}`;

    const variables = {
      search: {
        allowAdult: false,
        allowUnknown: false,
        query: query || '',
        ...(opts.sortBy ? { sortBy: opts.sortBy } : {})
      },
      limit: opts.limit || 40,
      page: 1,
      translationType: config.mode,
      countryOrigin: 'ALL'
    };

    try {
      const response = await this.executeGraphql(searchGql, variables);
      const shows = response.data?.shows?.edges || [];
      return shows.map(show => ({
        id: show._id,
        name: show.name,
        thumbnail: show.thumbnail || '',
        banner: show.banner || show.thumbnail || '',
        description: show.description || '',
        score: show.score || 0,
        genres: show.genres || [],
        tags: show.tags || [],
        type: show.type || 'TV',
        episodes: show.availableEpisodes?.[config.mode] || 0
      }));
    } catch (error) {
      helpers.die(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get episodes list for an anime
   */
  async getEpisodesList(showId) {
    const episodesListGql = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`;

    const variables = { showId };

    try {
      const response = await this.executeGraphql(episodesListGql, variables);
      const episodesDetail = response.data?.show?.availableEpisodesDetail || {};
      const episodes = episodesDetail[config.mode] || [];

      return episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
    } catch (error) {
      helpers.die(`Failed to get episodes: ${error.message}`);
    }
  }

  /**
   * Get episode embed URLs
   */
  async getEpisodeEmbedUrls(showId, episodeString) {
    const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;

    const variables = {
      showId,
      translationType: config.mode,
      episodeString
    };

    try {
      const query_hash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
      const query_ext = { persistedQuery: { version: 1, sha256Hash: query_hash } };

      const encoded_vars = encodeURIComponent(JSON.stringify(variables));
      const encoded_ext = encodeURIComponent(JSON.stringify(query_ext));

      const api_url = `${this.apiUrl}?variables=${encoded_vars}&extensions=${encoded_ext}`;
      
      // SECURITY: Use native https GET instead of shell-based curl (VULN-02)
      let stdout = await this.execGet(api_url);
      let response = JSON.parse(stdout);
      
      let sourceUrls = [];
      if (response.data && response.data.tobeparsed) {
         const decrypted = this.decryptTobeparsed(response.data.tobeparsed);
         sourceUrls = decrypted.episode?.sourceUrls || [];
      } else if (response.data && response.data.episode) {
         sourceUrls = response.data.episode.sourceUrls || [];
      } else {
         response = await this.executeGraphql(episodeEmbedGql, variables);
         console.log("\\nDEBUG: RAW EMBED RESPONSE ->", JSON.stringify(response, null, 2));
         sourceUrls = response.data?.episode?.sourceUrls || [];
      }

      // Parse source URLs
      const sources = {};
      sourceUrls.forEach(source => {
        const sourceUrl = source.sourceUrl?.replace(/^--/, '');
        const sourceName = source.sourceName;
        if (sourceUrl && sourceName) {
          sources[sourceName] = sourceUrl;
        }
      });

      return { 
        sources, 
        fallback: `https://allmanga.to/anime/${showId}/episodes/${config.mode}/${episodeString}` 
      };
    } catch (error) {
      return { 
        sources: {}, 
        fallback: `https://allmanga.to/anime/${showId}/episodes/${config.mode}/${episodeString}` 
      };
    }
  }

  /**
   * Get direct video links from provider
   * Ported from original ani-cli v4.14.1 get_links() function
   */
  async getVideoLinks(providerId, providerName) {
    try {
      if (!providerId || providerId.includes('i3!') || providerId.includes('+++') || providerId.length < 5) {
        console.log(`[SCRAPER] Ignoring invalid providerId: ${providerId}`);
        return [];
      }

      if (providerId.startsWith('//')) {
        providerId = 'https:' + providerId;
      }

      // === PROVIDER-SPECIFIC HANDLING (matching original ani-cli) ===

      // 1. Mp4Upload: scrape the embed page for the src URL
      if (providerId.includes('mp4upload')) {
        console.log(`[SCRAPER] Mp4Upload provider detected, scraping embed...`);
        try {
          const embedUrl = providerId.startsWith('http') ? providerId : `https://${providerId}`;
          const html = await this.execGet(embedUrl);
          const srcMatch = html.match(/src:\s*"([^"]*)"/);  // matches: src: "https://...mp4"
          if (srcMatch && srcMatch[1]) {
            let videoUrl = srcMatch[1];
            if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
            helpers.success(`${providerName} Links Fetched`);
            return [{ quality: 'mp4upload', url: videoUrl, provider: providerName }];
          }
        } catch (e) {
          console.error(`[SCRAPER] Mp4Upload scrape failed: ${e.message}`);
        }
        return [];
      }

      // 2. fast4speed.rsvp (Yt-mp4 replacement): direct mp4 link, use as-is
      if (providerId.includes('fast4speed.rsvp') || providerId.includes('tools.fast4speed')) {
        console.log(`[SCRAPER] fast4speed direct link detected`);
        const directUrl = providerId.startsWith('http') ? providerId : `https://${providerId}`;
        helpers.success(`${providerName} Links Fetched`);
        return [{ quality: 'direct', url: directUrl, provider: providerName }];
      }

      // 3. Non-API URLs (external embeds like ok.ru, etc.) — return as-is
      if (!providerId.includes('apivtwo')) {
        const isValidUrl = providerId.includes('.') || providerId.includes('/');
        if (!isValidUrl) {
          console.log(`[SCRAPER] Ignoring invalid providerId: ${providerId}`);
          return [];
        }
        return [{
          quality: 'unknown',
          url: providerId.startsWith('http') ? providerId : `https://${providerId}`,
          provider: providerName
        }];
      }

      // 4. AllAnime API endpoints (apivtwo) — parse JSON response for links
      const baseUrl = this.apiUrl.slice(0, -4);
      const url = providerId.startsWith('http') ? providerId : 
                 (providerId.startsWith('/') ? `${baseUrl}${providerId}` : `${baseUrl}/${providerId}`);
      console.log(`[SCRAPER] Fetching API provider URL -> ${url.substring(0, 100)}...`);
      const data = await this.execGet(url);
      const links = [];

      if (typeof data === 'string') {
        // Extract direct mp4 links with resolution info
        const linkMatches = data.matchAll(/"link":"([^"]*)".*?"resolutionStr":"([^"]*)"/g);
        for (const match of linkMatches) {
          let linkUrl = match[1];
          if (linkUrl.startsWith('//')) linkUrl = 'https:' + linkUrl;
          links.push({ quality: match[2], url: linkUrl, provider: providerName });
        }

        // Extract m3u8 HLS links (English hardsub)
        const m3u8Matches = data.matchAll(/"hls","url":"([^"]*)".*?"hardsub_lang":"en-US"/g);
        for (const match of m3u8Matches) {
          let m3u8Url = match[1];
          if (m3u8Url.startsWith('//')) m3u8Url = 'https:' + m3u8Url;
          links.push({ quality: 'hls', url: m3u8Url, provider: providerName });
        }

        // 5. Wixmp/Default provider: m3u8 master playlist → extract individual mp4 quality streams
        if (links.length > 0 && links.some(l => l.url.includes('repackager.wixmp.com'))) {
          console.log(`[SCRAPER] Wixmp m3u8 detected, extracting mp4 quality streams...`);
          const wixmpLinks = [];
          for (const link of links) {
            if (!link.url.includes('repackager.wixmp.com')) {
              wixmpLinks.push(link);
              continue;
            }
            try {
              // Fetch the m3u8 master playlist
              const m3u8Content = await this.execGet(link.url);
              if (m3u8Content.includes('EXTM3U')) {
                // Parse resolution lines: #EXT-X-STREAM-INF:...x720\n/path/to/stream.m3u8
                const relativeBase = link.url.replace(/[^/]*$/, '');
                const streamLines = m3u8Content.split('\n');
                for (let i = 0; i < streamLines.length; i++) {
                  const line = streamLines[i];
                  if (line.includes('EXT-X-STREAM') && !line.includes('I-FRAME')) {
                    const resMatch = line.match(/x(\d+)/);
                    const nextLine = streamLines[i + 1]?.trim();
                    if (resMatch && nextLine && !nextLine.startsWith('#')) {
                      const streamUrl = nextLine.startsWith('http') ? nextLine : `${relativeBase}${nextLine}`;
                      wixmpLinks.push({
                        quality: `${resMatch[1]}p`,
                        url: streamUrl,
                        provider: providerName
                      });
                    }
                  }
                }
              } else {
                wixmpLinks.push(link);
              }
            } catch (e) {
              console.error(`[SCRAPER] Wixmp m3u8 parse failed: ${e.message}`);
              wixmpLinks.push(link); // Keep original link as fallback
            }
          }
          if (wixmpLinks.length > 0) {
            helpers.success(`${providerName} Links Fetched (${wixmpLinks.length} streams)`);
            return wixmpLinks;
          }
        }
      }

      if (links.length > 0) {
        helpers.success(`${providerName} Links Fetched`);
      } else {
        console.log(`[SCRAPER] No links extracted from ${providerName}`);
      }
      return links;
    } catch (error) {
      console.error(`Failed to get links from ${providerName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate links from all providers
   */
  async generateLinks(sources) {
    const allLinks = [];

    const providerEntries = Object.entries(sources).filter(([_, url]) => !!url);
    
    const results = await Promise.all(
      providerEntries.map(async ([name, sourceUrl]) => {
        const decodedId = (sourceUrl.startsWith('http') || sourceUrl.startsWith('//')) 
          ? sourceUrl 
          : helpers.decodeProviderId(sourceUrl);
        return this.getVideoLinks(decodedId, name);
      })
    );

    results.forEach(links => allLinks.push(...links));
    return allLinks;
  }

  /**
   * Select quality from available links
   */
  selectQuality(links, quality) {
    if (!links || links.length === 0) {
      return null;
    }

    // Sort by quality (descending)
    const sortedLinks = links.sort((a, b) => {
      const qA = parseInt(a.quality) || 0;
      const qB = parseInt(b.quality) || 0;
      return qB - qA;
    });

    if (quality === 'best') {
      return sortedLinks[0];
    }

    if (quality === 'worst') {
      return sortedLinks[sortedLinks.length - 1];
    }

    // Find specific quality
    const found = sortedLinks.find(link => link.quality.includes(quality));
    if (found) {
      return found;
    }

    // Default to best
    console.log('Specified quality not found, defaulting to best');
    return sortedLinks[0];
  }
}

module.exports = new AllAnimeAPI();
