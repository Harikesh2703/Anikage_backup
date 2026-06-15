const aniwatch = require('./src/api/aniwatch.js');

async function test() {
  console.log("Searching with aniwatch for 'naruto'...");
  const results = await aniwatch.searchAnime('naruto');
  console.log("Results:");
  console.log(results.slice(0, 3));
  if (results.length > 0) {
    const target = results[0];
    const eps = await aniwatch.getEpisodesList(target.id);
    console.log("Eps:", eps.length);
    if (eps.length > 0) {
      const epNum = eps[0].episodeString;
      const embeds = await aniwatch.getEpisodeEmbedUrls(target.id, epNum);
      console.log("Embeds:", JSON.stringify(embeds, null, 2));
      const links = await aniwatch.generateLinks(embeds.sources, target.id);
      console.log("Links:", JSON.stringify(links, null, 2));
    }
  }
}

test().catch(console.error);
