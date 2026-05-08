import { useState, useCallback } from 'react';
import { AnalyticsView } from '@/components/anime/AnalyticsView';
import { HomeView } from '@/components/anime/HomeView';
import { Navbar } from '@/components/anime/Navbar';
import { EpisodeModal } from '@/components/anime/EpisodeModal';
import { VideoPlayer } from '@/components/anime/VideoPlayer';
import type { AppView } from '@/components/anime/types';
import type { AnimeItem, StreamSource } from '@/lib/api';
import { api } from '@/lib/api';

export function AnimeApp() {
  const [view, setView] = useState<AppView>('home');

  // The anime whose episode list modal is open
  const [selectedAnime, setSelectedAnime] = useState<AnimeItem | null>(null);

  // The anime currently playing in the player (persists while player is open)
  const [watchingAnime, setWatchingAnime] = useState<AnimeItem | null>(null);

  // Player state
  const [playerOpen, setPlayerOpen] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [episodeList, setEpisodeList] = useState<string[]>([]);

  // Called by AnimeCard when user clicks a card
  const openEpisodeModal = useCallback((anime: AnimeItem) => {
    setSelectedAnime(anime);
  }, []);

  // Shared stream-fetch logic
  const fetchStream = useCallback(async (anime: AnimeItem, episode: string) => {
    setStreamLoading(true);
    setStreamError(null);
    setStreamUrl('');
    setCurrentEpisode(episode);
    try {
      const source: StreamSource = await api.stream(anime.id, episode);
      if (!source.url) throw new Error('No stream URL returned from server.');
      
      const isDirectVideo = source.url.includes('.m3u8') || source.url.includes('.mp4') || source.url.includes('.mkv');
      
      if (isDirectVideo) {
        const proxiedUrl = `http://localhost:3001/api/proxy?url=${encodeURIComponent(source.url)}`;
        setStreamUrl(proxiedUrl);
      } else {
        // It's likely an embed page URL
        setStreamUrl(source.url);
      }
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Stream fetch failed');
    } finally {
      setStreamLoading(false);
    }
  }, []);

  // Called by EpisodeModal when user picks an episode
  const watchEpisode = useCallback(async (episode: string, episodes: string[]) => {
    if (!selectedAnime) return;
    const anime = selectedAnime;
    setSelectedAnime(null);   // close episode modal
    setWatchingAnime(anime);  // remember who we're watching
    setEpisodeList(episodes);
    setPlayerOpen(true);      // open player immediately (shows loading state)
    await fetchStream(anime, episode);
  }, [selectedAnime, fetchStream]);

  // Called by VideoPlayer prev/next buttons
  const changeEpisode = useCallback(async (episode: string) => {
    if (!watchingAnime) return;
    await fetchStream(watchingAnime, episode);
  }, [watchingAnime, fetchStream]);

  const closePlayer = useCallback(() => {
    setPlayerOpen(false);
    setStreamUrl('');
    setWatchingAnime(null);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar view={view} onNavigate={(v: AppView) => setView(v)} onCardClick={openEpisodeModal} />

      {view === 'home'
        ? <HomeView onCardClick={openEpisodeModal} />
        : <AnalyticsView onCardClick={openEpisodeModal} />
      }

      {/* Episode picker modal */}
      {selectedAnime && (
        <EpisodeModal
          anime={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onWatch={watchEpisode}
        />
      )}

      {/* Fullscreen video player */}
      {playerOpen && watchingAnime && (
        <VideoPlayer
          streamUrl={streamUrl}
          title={watchingAnime.title}
          episode={currentEpisode}
          totalEpisodes={episodeList}
          loading={streamLoading}
          error={streamError}
          onClose={closePlayer}
          onEpisodeChange={changeEpisode}
        />
      )}
    </div>
  );
}
