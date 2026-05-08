import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { AnimeItem } from '@/lib/api';

interface UseAnimeDataReturn {
  trending: AnimeItem[];
  shonen: AnimeItem[];
  sliceOfLife: AnimeItem[];
  sciFi: AnimeItem[];
  hero: AnimeItem[];
  loading: boolean;
  error: string | null;
}

export function useAnimeData(): UseAnimeDataReturn {
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
        // Fetch trending (used for hero + trending row)
        const all = await api.trending({ limit: 30 });
        if (cancelled) return;

        // Slice into sections
        const hero = all.filter(a => a.banner).slice(0, 3);
        const trendRow = all.slice(0, 12);

        // Genre rows — filter from the same big result set
        const shonenList = all.filter(a =>
          a.tags.some(t => ['Shounen', 'Shonen', 'Action'].includes(t))
        ).slice(0, 12);

        const solList = all.filter(a =>
          a.tags.some(t => t.toLowerCase().includes('slice'))
        ).slice(0, 12);

        const sciFiList = all.filter(a =>
          a.tags.some(t => ['Sci-Fi', 'Mecha', 'Fantasy'].includes(t))
        ).slice(0, 12);

        setTrending(trendRow);
        setShonen(shonenList.length > 0 ? shonenList : trendRow.slice(0, 8));
        setSliceOfLife(solList.length > 0 ? solList : trendRow.slice(4, 12));
        setSciFi(sciFiList.length > 0 ? sciFiList : trendRow.slice(2, 10));
        // hero: fall back to first 3 trending if none have banners
        setTrending(trendRow);
        // store hero separately via parent
        setTrending(prev => {
          (prev as any).__hero = hero.length >= 3 ? hero : trendRow.slice(0, 3);
          return [...prev];
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const hero = (trending as any).__hero ?? trending.slice(0, 3);

  return { trending, shonen, sliceOfLife, sciFi, hero, loading, error };
}
