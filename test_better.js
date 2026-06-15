const { File } = require('buffer');
globalThis.File = File;

(async () => {
  const { AnimeScraper } = await import('better-ani-scraped');
  console.log("AnimeScraper:", typeof AnimeScraper);
  try {
    const scraper = new AnimeScraper('animesama');
    console.log("Success:", !!scraper);
  } catch(e) {
    console.error("Error:", e);
  }
})();
