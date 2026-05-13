const { createRequire } = require('module');
const { fileURLToPath } = require('url');
const { dirname, join } = require('path');

const requireCustom = createRequire('file:///home/harikesh/Desktop/ani-cli/server/index.mjs');
const api = requireCustom('../src/api/allanime.js');

console.log('API Type:', typeof api);
console.log('Keys:', Object.keys(api));
console.log('searchAnime type:', typeof api.searchAnime);

if (typeof api.searchAnime === 'function') {
  console.log('SUCCESS: searchAnime is a function');
} else {
  console.log('FAILURE: searchAnime is NOT a function');
}
