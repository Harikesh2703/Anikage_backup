import { File } from 'buffer';
if (!globalThis.File) globalThis.File = File;

import { AnimeScraper } from 'better-ani-scraped';
try {
  console.log("Creating scraper...");
  const scraper = new AnimeScraper('animesama');
  console.log("Success:", !!scraper);
} catch (e) {
  console.error("Error:", e);
}
