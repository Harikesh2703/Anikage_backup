const aggregator = require('./src/api/aggregator.js');

async function test() {
  console.log("Searching for 'one piece'...");
  const results = await aggregator.searchAnime('one piece');
  console.log("Results:");
  console.log(results.slice(0, 3).map(r => r.id + " | " + r.name));
  
  if (results.length > 0) {
    const target = results[0];
    console.log("\nGetting episodes for", target.id);
    const eps = await aggregator.getEpisodesList(target.id);
    console.log("Found eps:", eps.length);
    
    if (eps.length > 0) {
      const epNum = eps[0].episodeString;
      console.log("\nGetting embeds for ep", epNum);
      const embeds = await aggregator.getEpisodeEmbedUrls(target.id, epNum);
      console.log("Embeds:", JSON.stringify(embeds, null, 2));
      
      console.log("\nGenerating links...");
      const links = await aggregator.generateLinks(embeds.sources, target.id);
      console.log("Links:", JSON.stringify(links, null, 2));

      console.log("\nGetting extra mirrors...");
      const extraLinks = await aggregator.getExtraMirrors(target.name, epNum, target.id);
      console.log("Extra Links:", JSON.stringify(extraLinks, null, 2));
    }
  }
}

test().catch(console.error);
