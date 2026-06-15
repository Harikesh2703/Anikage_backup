const allanime = require('./allanime');
const aniwatch = require('./aniwatch');
const betterAni = require('./better-ani');

const providers = {
  allanime,
  aniwatch,
  'better-ani': betterAni
};

class AggregatorAPI {
  constructor() {
    this.userAgent = allanime.userAgent;
    this.referer = allanime.referer;
  }

  async searchAnime(query, opts = {}) {
    const promises = Object.entries(providers).map(async ([key, provider]) => {
      const results = await provider.searchAnime(query, opts);
      if (!results || results.length === 0) throw new Error('No results');
      return results.map(r => ({
        ...r,
        id: `${key}__${r.id}`,
        name: r.name
      }));
    });

    try {
      // Race them! First scraper to return valid results wins. Mobile friendly & fast.
      return await Promise.any(promises);
    } catch (e) {
      console.error('[Aggregator] All scrapers failed to find results:', e.errors || e.message);
      return [];
    }
  }

  async getEpisodesList(showId) {
    const parts = showId.split('__');
    const providerKey = parts[0];
    const actualId = parts.slice(1).join('__');
    
    if (!providers[providerKey]) {
      console.warn(`[Aggregator] Unknown provider ${providerKey}, falling back to allanime`);
      return allanime.getEpisodesList(showId);
    }
    
    return providers[providerKey].getEpisodesList(actualId);
  }

  async getEpisodeEmbedUrls(showId, episodeString) {
    const parts = showId.split('__');
    const providerKey = parts[0];
    const actualId = parts.slice(1).join('__');
    
    if (!providers[providerKey]) {
      return allanime.getEpisodeEmbedUrls(showId, episodeString);
    }
    
    return providers[providerKey].getEpisodeEmbedUrls(actualId, episodeString);
  }

  async generateLinks(sources, showId = '') {
    const parts = showId.split('__');
    const providerKey = parts[0];
    const actualId = parts.slice(1).join('__');
    
    if (!providers[providerKey]) {
      return allanime.generateLinks(sources);
    }
    
    return providers[providerKey].generateLinks(sources, actualId);
  }

  async getExtraMirrors(title, episodeString, originalShowId = '') {
    const originalProviderKey = originalShowId.split('__')[0];
    
    // We run the searches in parallel but use Promise.allSettled so one failure doesn't kill the batch
    const searchPromises = Object.entries(providers)
      .filter(([key]) => key !== originalProviderKey) // Skip the one we already got links from
      .map(async ([key, provider]) => {
        try {
          // 1. Search by title
          const results = await provider.searchAnime(title);
          if (!results || results.length === 0) return [];
          
          // 2. Take the first match
          const targetId = results[0].id;
          
          // 3. Get its episodes
          const episodes = await provider.getEpisodesList(targetId);
          
          // 4. Find the matching episode number (e.g. '1163')
          const ep = episodes.find(e => e.episodeString === episodeString.toString());
          if (!ep) return [];
          
          // 5. Get sources
          const { sources } = await provider.getEpisodeEmbedUrls(targetId, episodeString);
          if (!sources || Object.keys(sources).length === 0) return [];
          
          // 6. Generate links
          const links = await provider.generateLinks(sources, targetId);
          return links || [];
          
        } catch (e) {
          console.error(`[Aggregator Extra Mirrors] Failed for ${key}:`, e.message);
          return [];
        }
      });

    const resultsArray = await Promise.all(searchPromises);
    return resultsArray.flat();
  }

  // Fallback for any other methods
  selectQuality(links, preference) {
    return allanime.selectQuality(links, preference);
  }
}

module.exports = new AggregatorAPI();
