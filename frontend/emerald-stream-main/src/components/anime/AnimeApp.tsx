import { useState, useCallback, useEffect } from 'react';
import { AnalyticsView } from '@/components/anime/AnalyticsView';
import { NotificationsView, type AppNotification } from '@/components/anime/NotificationsView';
import { SettingsView } from '@/components/anime/SettingsView';
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
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [episodeList, setEpisodeList] = useState<string[]>([]);
  
  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    // Listen for background updates
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      const removeListener = window.electron.on('update-available', (data: any) => {
        setNotifications(prev => [
          {
            id: `update-${data.version}`,
            type: 'update',
            title: 'Scraper Hot-Fix Available',
            message: data.changelog || `A critical fix is available for the anime sources. v${data.version}`,
            version: data.version,
            patchUrl: data.url,
            timestamp: new Date(),
            isRead: false
          },
          ...prev
        ]);
      });
      return () => removeListener();
    }
  }, []);

  const installPatch = async (id: string, url: string) => {
    // @ts-ignore
    const result = await window.electron.invoke('patch-scraper', { url });
    if (result.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true, message: 'Patch applied successfully! Restart the app to see changes.' } : n));
    } else {
      alert(`Patching failed: ${result.error}`);
    }
  };

  // Called by AnimeCard when user clicks a card
  const openEpisodeModal = useCallback((anime: AnimeItem) => {
    setSelectedAnime(anime);
  }, []);

  // Shared stream-fetch logic
  const fetchStream = useCallback(async (anime: AnimeItem, episode: string) => {
    setStreamLoading(true);
    setStreamError(null);
    setStreamUrl('');
    setSources([]);
    setSourceIndex(0);
    setCurrentEpisode(episode);
    try {
      const response = await api.stream(anime.id, episode);
      if (!response.sources || response.sources.length === 0) throw new Error('No stream sources found.');
      
      setSources(response.sources);
      
      // Load the first source
      const firstSource = response.sources[0];
      const isDirectVideo = 
        firstSource.url.includes('.m3u8') || 
        firstSource.url.includes('.mp4') || 
        firstSource.url.includes('.mkv') ||
        firstSource.url.includes('fast4speed.rsvp') ||
        firstSource.url.includes('googlevideo.com');
      
      if (isDirectVideo) {
        const proxiedUrl = `http://127.0.0.1:3001/api/proxy?url=${encodeURIComponent(firstSource.url)}`;
        setStreamUrl(proxiedUrl);
      } else {
        setStreamUrl(firstSource.url);
      }

      // Record this watch in history
      api.recordHistory(anime, episode).catch(e => console.error('Failed to record history:', e));
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Stream fetch failed');
    } finally {
      setStreamLoading(false);
    }
  }, []);

  // Manual source switching or automatic fallback
  const tryNextSource = useCallback(() => {
    if (sourceIndex >= sources.length - 1) {
      setStreamError('All sources failed. Try another episode.');
      return;
    }

    const nextIndex = sourceIndex + 1;
    setSourceIndex(nextIndex);
    const nextSource = sources[nextIndex];
    
    const isDirectVideo = 
      nextSource.url.includes('.m3u8') || 
      nextSource.url.includes('.mp4') || 
      nextSource.url.includes('.mkv') ||
      nextSource.url.includes('fast4speed.rsvp') ||
      nextSource.url.includes('googlevideo.com');

    if (isDirectVideo) {
      const proxiedUrl = `http://127.0.0.1:3001/api/proxy?url=${encodeURIComponent(nextSource.url)}`;
      setStreamUrl(proxiedUrl);
    } else {
      setStreamUrl(nextSource.url);
    }
    setStreamError(null);
  }, [sourceIndex, sources]);

  const changeSource = useCallback((index: number) => {
    if (index < 0 || index >= sources.length) return;
    
    setSourceIndex(index);
    const nextSource = sources[index];
    
    const isDirectVideo = 
      nextSource.url.includes('.m3u8') || 
      nextSource.url.includes('.mp4') || 
      nextSource.url.includes('.mkv') ||
      nextSource.url.includes('fast4speed.rsvp') ||
      nextSource.url.includes('googlevideo.com');

    if (isDirectVideo) {
      const proxiedUrl = `http://127.0.0.1:3001/api/proxy?url=${encodeURIComponent(nextSource.url)}`;
      setStreamUrl(proxiedUrl);
    } else {
      setStreamUrl(nextSource.url);
    }
    setStreamError(null);
  }, [sources]);

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
      <Navbar 
        view={view} 
        onNavigate={(v: AppView) => setView(v)} 
        onCardClick={openEpisodeModal} 
        hasNotifications={notifications.some(n => !n.isRead)}
      />

      {view === 'home' && (
        <HomeView onCardClick={openEpisodeModal} />
      )}
      
      {view === 'analytics' && (
        <AnalyticsView onCardClick={openEpisodeModal} />
      )}

      {view === 'notifications' && (
        <NotificationsView 
          notifications={notifications} 
          onInstallPatch={installPatch} 
          onMarkAsRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))}
        />
      )}

      {view === 'settings' && (
        <SettingsView />
      )}

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
          onTryNextSource={tryNextSource}
          onSourceChange={changeSource}
          currentSourceIndex={sourceIndex}
          allSources={sources}
          hasMoreSources={sourceIndex < sources.length - 1}
        />
      )}
    </div>
  );
}
