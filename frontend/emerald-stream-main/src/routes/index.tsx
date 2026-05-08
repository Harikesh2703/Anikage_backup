import { createFileRoute } from "@tanstack/react-router";
import { AnimeApp } from "@/components/anime/AnimeApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anikage — Your Anime Universe" },
      {
        name: "description",
        content:
          "Anikage is a beautifully dark anime streaming experience: continue watching, trending shonen, slice of life rows and personalized analytics.",
      },
      { property: "og:title", content: "Anikage — Your Anime Universe" },
      {
        property: "og:description",
        content: "Stream anime, track your taste, discover what to watch next.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <AnimeApp />;
}
