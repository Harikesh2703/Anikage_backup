import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AnimeCard } from '@/components/anime/AnimeCard';
import { AnimeRow } from '@/components/anime/AnimeRow';
import { HeroSlideshow } from '@/components/anime/HeroSlideshow';
import { api } from '@/lib/api';
import type { AnimeItem } from '@/lib/api';

export function HomeView() {
  const [hero, setHero] = useState<AnimeItem[]>([]);
  const [trending, setTrending] = useState<AnimeItem[]>([]);
  const [shonen, setShonen] = useState<AnimeItem[]>([]);
  const [sliceOfLife, setSliceOfLife] = useState<AnimeItem[]>([]);
  const [sciFi, setSciFi] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const all = await api.trending({ limit: 30 });
        if (cancelled) return;

        const heroSlides = all.filter(a => a.banner && a.banner !== a.coverImage).slice(0, 3);
        const trendRow = all.slice(0, 14);

        const shonenList = all
          .filter(a => a.tags.some(t => ['Shounen', 'Action', 'Adventure'].includes(t)))
          .slice(0, 12);

        const solList = all
          .filter(a => a.tags.some(t => t.toLowerCase().includes('slice')))
          .slice(0, 12);

        const sciFiList = all
          .filter(a => a.tags.some(t => ['Sci-Fi', 'Mecha', 'Fantasy', 'Supernatural'].includes(t)))
          .slice(0, 12);

        setHero(heroSlides.length >= 2 ? heroSlides : trendRow.slice(0, 3));
        setTrending(trendRow);
        setShonen(shonenList.length > 2 ? shonenList : trendRow.slice(0, 8));
        setSliceOfLife(solList.length > 2 ? solList : trendRow.slice(2, 10));
        setSciFi(sciFiList.length > 2 ? sciFiList : trendRow.slice(4, 12));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-xl font-bold text-foreground">Could not connect to server</p>
        <p className="text-muted-foreground text-sm max-w-md">
          Make sure the API server is running:<br />
          <code className="text-primary">node server/index.mjs</code>
        </p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <HeroSlideshow slides={hero} />

      <div className="-mt-12 relative z-10">
        <AnimeRow title="Trending Now" subtitle="What everyone is watching">
          {trending.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </AnimeRow>

        <AnimeRow title="Shounen & Action" subtitle="The blades everyone is talking about">
          {shonen.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </AnimeRow>

        <AnimeRow title="Slice of Life" subtitle="Slow afternoons, warm hearts">
          {sliceOfLife.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </AnimeRow>

        <AnimeRow title="Fantasy & Supernatural" subtitle="Neon skies and ancient spirits">
          {sciFi.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </AnimeRow>
      </div>
    </div>
  );
}
