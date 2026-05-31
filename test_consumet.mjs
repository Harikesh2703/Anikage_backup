import { ANIME } from '@consumet/extensions';
const gogoanime = new ANIME.Gogoanime();
async function test() {
  const query = "Naruto";
  console.log("Searching for:", query);
  const searchRes = await gogoanime.search(query);
  console.log("Search results:", searchRes.results?.length);
  if (searchRes.results?.length > 0) {
    const id = searchRes.results[0].id;
    console.log("Found ID:", id);
    const info = await gogoanime.fetchAnimeInfo(id);
    console.log("Episodes:", info.episodes?.length);
    console.log("First episode number:", info.episodes[0]?.number, "type:", typeof info.episodes[0]?.number);
  }
}
test().catch(console.error);
