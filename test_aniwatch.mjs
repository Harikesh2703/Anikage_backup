import { getAnimeSearchResults } from 'aniwatch';
async function test() {
  try {
    const res = await getAnimeSearchResults("Naruto");
    console.log("Success:", res.animes.length);
  } catch(e) {
    console.error("Error:", e);
  }
}
test();
