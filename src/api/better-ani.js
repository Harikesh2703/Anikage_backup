class BetterAniAPI {
  async searchAnime(query, opts = {}) {
    try {
      const { AnimeScraper } = await import('better-ani-scraped');
      const scraper = new AnimeScraper('animesama');
      const results = await scraper.searchAnime(query);
      return (results || []).map(item => ({
        id: item.url,
        name: item.title,
        thumbnail: item.thumbnail || item.image,
      }));
    } catch (e) {
      console.error('[BetterAni] Search error:', e);
      return [];
    }
  }

  async getEpisodesList(showId) {
    try {
      const { AnimeScraper } = await import('better-ani-scraped');
      const scraper = new AnimeScraper('animesama');
      const info = await scraper.getAnimeInfo(showId);
      return (info.episodes || []).map(ep => ({
        episodeString: ep.number?.toString() || ep.id,
        title: ep.title
      }));
    } catch (e) {
      console.error('[BetterAni] Episode list error:', e);
      return [];
    }
  }

  async getEpisodeEmbedUrls(showId, episodeString) {
    try {
      const { AnimeScraper } = await import('better-ani-scraped');
      const scraper = new AnimeScraper('animesama');
      const servers = await scraper.getEmbed(showId, episodeString);
      return {
        sources: servers || {},
        fallback: null
      };
    } catch (e) {
      console.error('[BetterAni] Embed URL error:', e);
      return { sources: {} };
    }
  }

  async generateLinks(sources, showId) {
    try {
      const { getVideoUrlFromEmbed } = await import('better-ani-scraped');
      const links = [];
      for (const [key, sourceUrl] of Object.entries(sources)) {
        try {
          const videoUrl = await getVideoUrlFromEmbed(key, sourceUrl);
          if (videoUrl) {
            links.push({
              link: videoUrl,
              resolutionStr: 'Auto',
              resolution: 1080,
              provider: key
            });
          }
        } catch (innerE) {
          // ignore
        }
      }
      return links;
    } catch (e) {
      console.error('[BetterAni] Link generation error:', e);
      return [];
    }
  }
}

module.exports = new BetterAniAPI();
