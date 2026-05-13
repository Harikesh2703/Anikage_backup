const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../utils/config');
const helpers = require('../utils/helpers');

const execAsync = promisify(exec);

class AllAnimeAPI {
  constructor() {
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";
    this.referer = "https://allmanga.to";
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

  async executeGraphql(query, variables) {
    const payload = { query, variables };
    const tempFile = path.join(os.tmpdir(), `graphql_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(payload));

    try {
      const curlCmd = `curl -s -H "User-Agent: ${this.userAgent}" -H "Referer: ${this.referer}" -H "Origin: https://allmanga.to" -H "Accept: application/json" -H "Accept-Language: en-US,en;q=0.9" -H "Sec-Fetch-Dest: empty" -H "Sec-Fetch-Mode: cors" -H "Sec-Fetch-Site: cross-site" -H "Content-Type: application/json" --data @"${tempFile}" "${this.apiUrl}"`;

      const { stdout } = await execAsync(curlCmd, { maxBuffer: 10 * 1024 * 1024 });
      return JSON.parse(stdout);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  async execGet(url) {
    const curlCmd = `curl -s -H "User-Agent: ${this.userAgent}" -H "Referer: ${this.referer}" -H "Origin: https://allmanga.to" -H "Accept: */*" -H "Accept-Language: en-US,en;q=0.9" -H "Sec-Fetch-Dest: empty" -H "Sec-Fetch-Mode: cors" -H "Sec-Fetch-Site: same-site" "${url}"`;
    const { stdout } = await execAsync(curlCmd, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
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
      let curlCmd = `curl -s -e "${this.referer}" -H "Origin: https://youtu-chan.com" -A "${this.userAgent}" "${api_url}"`;
      
      let { stdout } = await execAsync(curlCmd, { maxBuffer: 10 * 1024 * 1024 });
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
   */
  async getVideoLinks(providerId, providerName) {
    try {
      if (!providerId.includes('apivtwo')) {
        return [{
          quality: 'unknown',
          url: providerId.startsWith('http') ? providerId : `https://${providerId}`,
          provider: providerName
        }];
      }

      const baseUrl = this.apiUrl.slice(0, -4);
      const url = providerId.startsWith('http') ? providerId : 
                 (providerId.startsWith('/') ? `${baseUrl}${providerId}` : `${baseUrl}/${providerId}`);
      console.log("\\nDEBUG: Fetching provider URL ->", url);
      const data = await this.execGet(url);
      console.log("\\nDEBUG RAW SOURCE DATA:\\n", data.substring(0, 1000), "...");
      const links = [];

      // Parse links based on response format
      if (typeof data === 'string') {
        // Extract links from JSON-like string
        const linkMatches = data.matchAll(/"link":"([^"]*)".*?"resolutionStr":"([^"]*)"/g);
        for (const match of linkMatches) {
          links.push({
            quality: match[2],
            url: match[1],
            provider: providerName
          });
        }

        // Extract m3u8 links
        const m3u8Matches = data.matchAll(/"hls","url":"([^"]*)".*?"hardsub_lang":"en-US"/g);
        for (const match of m3u8Matches) {
          links.push({
            quality: 'hls',
            url: match[1],
            provider: providerName
          });
        }
      }

      helpers.success(`${providerName} Links Fetched`);
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
        const decodedId = sourceUrl.startsWith('http') ? sourceUrl : helpers.decodeProviderId(sourceUrl);
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
