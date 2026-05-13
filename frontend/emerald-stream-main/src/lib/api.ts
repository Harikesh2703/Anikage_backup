// Central API client — all calls go to the Express server at port 3001
const API_BASE = 'http://localhost:3001/api';

export interface AnimeItem {
  id: string;
  title: string;
  coverImage: string;
  banner?: string;
  tags: string[];
  synopsis?: string;
  score?: number;
  episodes?: number;
  type?: string;
}

export interface StreamSource {
  url: string;
  quality: string;
  provider: string;
}

export interface StreamResponse {
  sources: StreamSource[];
  fallback: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  search: (q: string) =>
    get<AnimeItem[]>(`/search?q=${encodeURIComponent(q)}`),

  trending: (opts?: { limit?: number; genre?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.genre) params.set('genre', opts.genre);
    return get<AnimeItem[]>(`/trending?${params.toString()}`);
  },

  episodes: (showId: string) =>
    get<string[]>(`/episodes/${showId}`),

  stream: (showId: string, episode: string) =>
    get<StreamResponse>(`/sources/${showId}/${episode}`),

  history: () =>
    get<AnimeItem[]>(`/history`),

  recordHistory: (anime: AnimeItem, episode: string) =>
    post<{ success: boolean }>('/history', {
      id: anime.id,
      title: anime.title,
      coverImage: anime.coverImage,
      episode,
      tags: anime.tags
    }),
};
