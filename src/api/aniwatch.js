class AniwatchAPI {
  async searchAnime(query, opts = {}) {
    try {
      const { getAnimeSearchResults } = await import('aniwatch');
      const data = await getAnimeSearchResults(query);
      return (data.animes || data.results || []).map(item => ({
        id: item.id,
        name: item.name,
        thumbnail: item.poster
      }));
    } catch (e) {
      console.error('[Aniwatch] Search error:', e);
      return [];
    }
  }

  async getEpisodesList(showId) {
    try {
      const { getAnimeEpisodes } = await import('aniwatch');
      const data = await getAnimeEpisodes(showId);
      return (data.episodes || []).map(ep => ({
        episodeString: ep.number.toString(),
        title: ep.title,
        id: ep.episodeId
      }));
    } catch (e) {
      console.error('[Aniwatch] Episode list error:', e);
      return [];
    }
  }

  async getEpisodeEmbedUrls(showId, episodeString) {
    try {
      const { getEpisodeServers } = await import('aniwatch');
      const episodes = await this.getEpisodesList(showId);
      const targetEp = episodes.find(e => e.episodeString === episodeString.toString());
      if (!targetEp) throw new Error('Episode not found');
      
      const servers = await getEpisodeServers(targetEp.id);
      
      const sourcesObj = {};
      if (servers.sub) {
        servers.sub.forEach(s => sourcesObj[`sub_${s.serverName}`] = s.serverId);
      }
      if (servers.dub) {
        servers.dub.forEach(s => sourcesObj[`dub_${s.serverName}`] = s.serverId);
      }
      
      return {
        sources: sourcesObj,
        fallback: null
      };
    } catch (e) {
      console.error('[Aniwatch] Embed URL error:', e);
      return { sources: {} };
    }
  }

  async generateLinks(sources) {
    try {
      const { getAnimeEpisodeSources } = await import('aniwatch');
      const links = [];
      for (const [key, serverId] of Object.entries(sources)) {
        try {
          const type = key.startsWith('dub') ? 'dub' : 'sub';
          const serverName = key.split('_')[1] || 'vidstreaming';
          const data = await getAnimeEpisodeSources(serverId, serverName, type);
          if (data && data.sources) {
            data.sources.forEach(src => {
              links.push({
                link: src.url,
                resolutionStr: src.quality || 'Auto',
                resolution: parseInt(src.quality) || 1080,
                provider: key
              });
            });
          }
        } catch (innerE) {
          console.error(`[Aniwatch] Failed to get source for ${key}:`, innerE.message);
        }
      }
      return links;
    } catch (e) {
      console.error('[Aniwatch] Link generation error:', e);
      return [];
    }
  }
}

module.exports = new AniwatchAPI();
