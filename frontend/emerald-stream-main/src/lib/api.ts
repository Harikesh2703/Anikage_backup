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
  lastEpisode?: string;
  progressPercent?: number;
  currentTime?: number;
  duration?: number;
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

export function normalizeTitle(title: string): string {
  if (!title) return title;
  // Replace "Nato: Shippuuden", "Nato Shippuuden", "Nato: Shippuden", "Nato Shippuden"
  // case-insensitively with "Naruto Shippuden" (or "Naruto: Shippuuden")
  return title
    .replace(/Nato:\s*Shippuuden/gi, 'Naruto: Shippuuden')
    .replace(/Nato\s*Shippuuden/gi, 'Naruto Shippuuden')
    .replace(/Nato:\s*Shippuden/gi, 'Naruto: Shippuden')
    .replace(/Nato\s*Shippuden/gi, 'Naruto Shippuden');
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
    get<AnimeItem[]>(`/search?q=${encodeURIComponent(q)}`).then(items =>
      items.map(item => ({ ...item, title: normalizeTitle(item.title) }))
    ),

  trending: (opts?: { limit?: number; genre?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.genre) params.set('genre', opts.genre);
    return get<AnimeItem[]>(`/trending?${params.toString()}`).then(items =>
      items.map(item => ({ ...item, title: normalizeTitle(item.title) }))
    );
  },

  episodes: (showId: string) =>
    get<string[]>(`/episodes/${showId}`),

  stream: (showId: string, episode: string) =>
    get<StreamResponse>(`/sources/${showId}/${episode}`),

  history: () =>
    get<AnimeItem[]>(`/history`).then(items =>
      items.map(item => ({ ...item, title: normalizeTitle(item.title) }))
    ),

  getProgress: (animeId: string) =>
    get<AnimeItem | null>(`/history/${animeId}`).then(item =>
      item ? { ...item, title: normalizeTitle(item.title) } : null
    ),

  recordHistory: (anime: AnimeItem, episode: string, progressPercent: number = 0, currentTime: number = 0, duration: number = 0) =>
    post<{ success: boolean }>('/history', {
      id: anime.id,
      title: normalizeTitle(anime.title),
      coverImage: anime.coverImage,
      episode,
      tags: anime.tags,
      progressPercent,
      currentTime,
      duration
    }),

  checkUpdates: () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('check-for-updates');
    }
    return Promise.resolve({ success: false, error: 'Not in Electron' });
  },

  getAvailablePatches: () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('get-available-patches');
    }
    return Promise.resolve([]);
  },

  installPatch: (type: string, version: string, url: string) => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('install-patch', { type, version, url });
    }
    return Promise.resolve({ success: false, error: 'Not in Electron' });
  },

  autoInstallPatches: () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('auto-install-patches');
    }
    return Promise.resolve({ success: false, error: 'Not in Electron' });
  },

  getLocalVersions: () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('get-local-versions');
    }
    return Promise.resolve({ app: '1.0.0', scraper: '1.0.0', ui: '1.0.0', server: '1.0.0' });
  },

  // Downloads Feature APIs
  downloads: () =>
    get<any[]>('/downloads').then(tasks =>
      tasks.map(task => ({ ...task, animeTitle: normalizeTitle(task.animeTitle) }))
    ),

  enqueueDownload: (animeId: string, animeTitle: string, coverImage: string, episodeNumber: string, quality: string, streamUrl?: string) =>
    post<{ success: boolean }>('/downloads/enqueue', { 
      animeId, 
      animeTitle: normalizeTitle(animeTitle), 
      coverImage, 
      episodeNumber, 
      quality, 
      streamUrl 
    }),

  pauseDownload: (id: string) =>
    post<{ success: boolean }>('/downloads/pause', { id }),

  resumeDownload: (id: string) =>
    post<{ success: boolean }>('/downloads/resume', { id }),

  cancelDownload: (id: string) =>
    post<{ success: boolean }>('/downloads/cancel', { id }),

  deleteDownload: (id: string) =>
    fetch(`${API_BASE}/downloads/${id}`, { method: 'DELETE' }).then(res => res.json()),

  getDownloadPath: () =>
    get<{ path: string }>('/settings/download-path'),

  saveDownloadPath: (path: string) =>
    post<{ success: boolean }>('/settings/download-path', { path }),

  getFFmpegPath: () =>
    get<{ customPath: string; actualPath: string }>('/settings/ffmpeg-path'),

  saveFFmpegPath: (path: string) =>
    post<{ success: boolean }>('/settings/ffmpeg-path', { path }),

  selectDirectory: () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      return window.electron.invoke('select-download-directory');
    }
    return Promise.resolve({ success: false, error: 'Not in Electron' });
  }
};
