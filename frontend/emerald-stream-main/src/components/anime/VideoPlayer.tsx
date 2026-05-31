import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Loader2, ChevronLeft, ChevronRight,
  RotateCcw, ShieldAlert, Server, Download, Check
} from 'lucide-react';
import { api } from '@/lib/api';
import type { StreamSource } from '@/lib/api';

interface VideoPlayerProps {
  animeId: string;
  coverImage: string;
  streamUrl: string;
  title: string;
  episode: string;
  totalEpisodes: string[];
  onClose: () => void;
  onEpisodeChange: (ep: string) => void;
  onTryNextSource: () => void;
  onSourceChange: (index: number) => void;
  currentSourceIndex: number;
  allSources: StreamSource[];
  hasMoreSources: boolean;
  loading: boolean;
  error: string | null;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  initialTime?: number;
}

export function VideoPlayer({
  animeId, coverImage, streamUrl, title, episode, totalEpisodes,
  onClose, onEpisodeChange, onTryNextSource,
  onSourceChange, currentSourceIndex, allSources,
  hasMoreSources, loading, error, showToast, initialTime = 0
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTimeRef = useRef(initialTime);

  // Sync ref when stream or episode changes
  useEffect(() => {
    initialTimeRef.current = initialTime;
  }, [streamUrl, episode, initialTime]);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState('Auto');
  const [showSourceGuide, setShowSourceGuide] = useState(true);
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showLocalPopup, setShowLocalPopup] = useState(false);

  const handleDownloadEpisode = async () => {
    setDownloadState('loading');
    setShowLocalPopup(true);
    setTimeout(() => setShowLocalPopup(false), 3500);

    if (showToast) {
      showToast('Download started. See downloads tab to view progress.', 'info');
    }
    try {
      const q = currentQuality === 'Auto' ? (allSources[currentSourceIndex]?.quality || '1080p') : currentQuality;
      const currentUrl = allSources[currentSourceIndex]?.url;
      const res = await api.enqueueDownload(animeId, title, coverImage, episode, q, currentUrl);
      if (res.success) {
        setDownloadState('success');
        setTimeout(() => setDownloadState('idle'), 3000);
      } else {
        setDownloadState('error');
        if (showToast) showToast('Download failed to start.', 'error');
        setTimeout(() => setDownloadState('idle'), 3000);
      }
    } catch (err) {
      setDownloadState('error');
      if (showToast) showToast('Failed to queue download.', 'error');
      setTimeout(() => setDownloadState('idle'), 3000);
    }
  };

  const currentEpIndex = totalEpisodes.indexOf(episode);
  const hasPrev = currentEpIndex > 0;
  const hasNext = currentEpIndex < totalEpisodes.length - 1;

  const isIframe = streamUrl && !streamUrl.includes('.m3u8') && !streamUrl.includes('.mp4') && !streamUrl.includes('/api/proxy');

  // Load stream into video element with HLS.js
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || loading) return;

    // Cleanup previous instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setAvailableQualities([]);
    setCurrentQuality('Auto');

    const isHls = streamUrl.includes('.m3u8');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map(l => l.height + 'p');
        setAvailableQualities(['Auto', ...new Set(levels)]);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[HLS Error]', data);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isHls) {
      // Native HLS (Safari) or direct MP4
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [streamUrl, loading]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
    };
    const onDuration = () => setDuration(video.duration);
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      if (initialTimeRef.current > 0) {
        video.currentTime = initialTimeRef.current;
        initialTimeRef.current = 0; // only seek once
      }
    };
    const onEnded = () => {
      if (hasNext) {
        onEpisodeChange(totalEpisodes[currentEpIndex + 1]);
      }
    };
    const onError = () => {
      console.error('[Video Error] Playback failed, trying next source...');
      if (hasMoreSources) onTryNextSource();
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, [onTryNextSource, hasMoreSources, hasNext, currentEpIndex, totalEpisodes, onEpisodeChange]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Auto-hide the source guide after 8 seconds
  useEffect(() => {
    if (showSourceGuide) {
      const timer = setTimeout(() => {
        setShowSourceGuide(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [showSourceGuide]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') { video.currentTime += 10; }
      if (e.key === 'ArrowLeft') { video.currentTime -= 10; }
      if (e.key === 'f') { toggleFullscreen(); }
      if (e.key === 'm') { toggleMute(); }
      if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  // Save progress effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isIframe || loading || error) return;

    let lastSavedTime = video.currentTime;
    
    const saveProgressToDb = async () => {
      const curTime = video.currentTime;
      const dur = video.duration;
      if (!dur || isNaN(dur)) return;

      const percent = Math.floor((curTime / dur) * 100);
      
      let episodeToSave = episode;
      let percentToSave = percent;
      let timeToSave = curTime;

      // Netflix style: if watched >= 90%, advance to the next episode at 0%
      if (percent >= 90) {
        const currentEpIndex = totalEpisodes.indexOf(episode);
        if (currentEpIndex !== -1 && currentEpIndex < totalEpisodes.length - 1) {
          episodeToSave = totalEpisodes[currentEpIndex + 1];
          percentToSave = 0;
          timeToSave = 0;
        } else {
          percentToSave = 100;
        }
      }

      try {
        await api.recordHistory(
          { id: animeId, title, coverImage, tags: [] },
          episodeToSave,
          percentToSave,
          timeToSave,
          dur
        );
      } catch (err) {
        console.error('Failed to save watch progress:', err);
      }
    };

    const interval = setInterval(() => {
      if (playing && Math.abs(video.currentTime - lastSavedTime) >= 10) {
        saveProgressToDb();
        lastSavedTime = video.currentTime;
      }
    }, 5000);

    const handlePause = () => {
      saveProgressToDb();
    };

    video.addEventListener('pause', handlePause);

    return () => {
      clearInterval(interval);
      video.removeEventListener('pause', handlePause);
      saveProgressToDb(); // Save on unmount or episode changes
    };
  }, [playing, episode, animeId, title, coverImage, totalEpisodes, isIframe, loading, error]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (showSourceGuide) return; // Keep controls visible while guide is active
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, [showSourceGuide]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play().catch(() => {});
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * v.duration;
  };

  const handleQualityChange = (q: string) => {
    setCurrentQuality(q);
    if (!hlsRef.current) return;
    if (q === 'Auto') {
      hlsRef.current.currentLevel = -1;
    } else {
      const levelIndex = hlsRef.current.levels.findIndex(l => l.height + 'p' === q);
      if (levelIndex !== -1) hlsRef.current.currentLevel = levelIndex;
    }
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" ref={containerRef}
      onMouseMove={resetControlsTimer} onClick={resetControlsTimer}>

      {/* Video element */}
      <div className="flex-1 relative flex items-center justify-center" onClick={!isIframe ? togglePlay : undefined}>
        {isIframe ? (
          <iframe
            src={streamUrl}
            className="w-full h-full border-0 bg-black"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            // More permissive sandbox to avoid 'sad face' errors
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
          />
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            preload="auto"
          />
        )}

        {/* Loading / Buffering overlay */}
        {(loading || buffering) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-white/70 text-sm">{loading ? 'Fetching stream…' : 'Buffering…'}</p>
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold text-lg">Playback Issue Detected</p>
              <p className="text-white/60 text-sm max-w-sm">{error}</p>
            </div>
            
            {hasMoreSources ? (
              <button
                onClick={onTryNextSource}
                className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 active:scale-95 font-semibold rounded-lg text-sm flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
              >
                <Server className="w-4 h-4" />
                Try Next Mirror / API ({currentSourceIndex + 2}/{allSources.length})
              </button>
            ) : (
              <p className="text-white/40 text-xs">No more sources available for this episode.</p>
            )}
          </div>
        )}

        {/* Big play icon flash (Only for HLS/Direct) */}
        {!playing && !loading && !error && !isIframe && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-10 h-10 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Next Episode overlay 30s before end */}
        {!isIframe && hasNext && duration > 0 && (duration - currentTime <= 30) && (
          <div className="absolute bottom-24 right-8 z-[60]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEpisodeChange(totalEpisodes[currentEpIndex + 1]);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-right fade-in"
            >
              Next Episode <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Controls bar — fades in/out (Disabled for iframes) */}
      {!isIframe && (
        <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)' }}>

        {/* Next Mirror Guide Tooltip */}
        {showSourceGuide && allSources.length > 1 && (
          <div className="absolute bottom-20 right-4 lg:right-64 z-[70] max-w-xs animate-bounce bg-gradient-to-br from-primary/95 via-primary/90 to-primary/80 text-primary-foreground p-3.5 rounded-xl shadow-2xl border border-primary/30 backdrop-blur-md">
            {/* Arrow pointing down */}
            <div className="absolute -bottom-1.5 right-12 w-3 h-3 bg-primary/90 rotate-45" />
            <div className="flex flex-col gap-1.5 text-left relative">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[10px] uppercase tracking-wider text-white/90">Tip: Slow Stream?</span>
                <button onClick={(e) => { e.stopPropagation(); setShowSourceGuide(false); }} className="text-white/70 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-white/95">
                If the video is not playing or loading slowly, switch to the next mirror or API using this button.
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="px-4 pt-6 pb-2 cursor-pointer" onClick={seek}>
          <div className="relative h-1.5 bg-white/20 rounded-full group hover:h-2.5 transition-all">
            <div
              className="absolute left-0 top-0 h-full bg-primary rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-3 px-4 pb-4">
          {/* Prev episode */}
          <button onClick={() => hasPrev && onEpisodeChange(totalEpisodes[currentEpIndex - 1])}
            disabled={!hasPrev}
            className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
            {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 fill-current" />}
          </button>

          {/* Next episode */}
          <button onClick={() => hasNext && onEpisodeChange(totalEpisodes[currentEpIndex + 1])}
            disabled={!hasNext}
            className="text-white/70 hover:text-white disabled:opacity-30 transition-colors"
            title="Next Episode"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Download Episode Button */}
          <div className="relative flex items-center justify-center">
            <button 
              onClick={handleDownloadEpisode}
              disabled={downloadState === 'loading'}
              className={`transition-all p-1 rounded-full ${
                downloadState === 'success' ? 'text-green-400' :
                downloadState === 'error' ? 'text-red-400' :
                downloadState === 'loading' ? 'text-primary' :
                'text-white/70 hover:text-primary'
              }`}
              title="Download Current Episode"
            >
              {downloadState === 'success' ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <g className={downloadState === 'loading' ? 'animate-download-arrow' : ''}>
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </g>
                </svg>
              )}
            </button>

            {/* Local Popup Bubble */}
            {showLocalPopup && (
              <div className="absolute bottom-10 bg-slate-900 border border-slate-700/50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-xl animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                Download started!
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
              </div>
            )}
          </div>

          {/* Skip buttons */}
          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}
            className="text-white/60 hover:text-white text-xs transition-colors flex items-center gap-0.5">
            <ChevronLeft className="w-3 h-3" />10s
          </button>
          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}
            className="text-white/60 hover:text-white text-xs transition-colors flex items-center gap-0.5">
            10s<ChevronRight className="w-3 h-3" />
          </button>

          {/* Time */}
          <span className="text-white/60 text-xs ml-1 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <div className="hidden lg:flex flex-col items-center">
            <span className="text-white/80 text-sm font-medium truncate max-w-[200px]">
              {title} — Ep {episode}
            </span>
            {allSources[currentSourceIndex]?.provider && (
              <span className="text-primary text-[10px] font-semibold uppercase tracking-wider opacity-85 mt-0.5">
                Provider: {allSources[currentSourceIndex].provider}
              </span>
            )}
          </div>

          <div className="flex-1" />



          {/* Next Mirror / API Button */}
          {allSources.length > 1 && (
            <button
              onClick={() => {
                const nextIndex = (currentSourceIndex + 1) % allSources.length;
                onSourceChange(nextIndex);
              }}
              title={`Switch to next mirror/API. Current: ${allSources[currentSourceIndex]?.provider || 'Unknown'} (${allSources[currentSourceIndex]?.quality || 'Auto'})`}
              className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 active:scale-95 text-primary text-[10px] font-bold py-1.5 px-3 rounded border border-primary/30 transition-all uppercase tracking-wider"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Next Mirror ({currentSourceIndex + 1}/{allSources.length})</span>
            </button>
          )}

          {/* Quality Selector (HLS levels or single quality) */}
          {!isIframe && (
            <div className="flex items-center bg-primary/20 hover:bg-primary/30 rounded border border-primary/30 px-2 mr-1 transition-all">
              <span className="text-primary text-[8px] font-black uppercase mr-2 opacity-60">Quality</span>
              <select
                value={currentQuality}
                onChange={(e) => handleQualityChange(e.target.value)}
                className="bg-transparent text-primary text-[10px] font-bold py-1.5 outline-none cursor-pointer appearance-none uppercase tracking-wider"
              >
                {availableQualities.length > 1 ? (
                  availableQualities.map((q) => (
                    <option key={q} value={q} className="bg-black text-white">
                      {q}
                    </option>
                  ))
                ) : (
                  <option value={allSources[currentSourceIndex]?.quality || 'Auto'} className="bg-black text-white">
                    {allSources[currentSourceIndex]?.quality || 'Auto'}
                  </option>
                )}
              </select>
            </div>
          )}



          {/* Volume */}
          <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>

          {/* Close */}
          <button onClick={onClose}
            className="ml-2 text-white/70 hover:text-red-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      )}

      {/* Top bar — title + close (Only for HLS/Direct) */}
      {!isIframe && (
        <div className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-white font-semibold text-sm">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-white/50 text-xs">Episode {episode}</p>
              {allSources[currentSourceIndex]?.provider && (
                <>
                  <span className="text-white/20 text-xs">•</span>
                  <span className="text-primary font-medium text-xs">Mirror: {allSources[currentSourceIndex].provider}</span>
                </>
              )}
            </div>
          </div>

        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      )}

      {/* Persistent Title / Info for Iframes */}
      {isIframe && (
        <div className="absolute top-4 left-4 z-[60] bg-black/60 px-4 py-2 rounded-lg border border-white/10 shadow-xl pointer-events-none">
          <p className="text-white font-semibold text-sm">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-white/50 text-xs">Episode {episode}</p>
            {allSources[currentSourceIndex]?.provider && (
              <>
                <span className="text-white/20 text-xs">•</span>
                <span className="text-primary font-medium text-xs">Mirror: {allSources[currentSourceIndex].provider}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Persistent Controls for Iframes */}
      {isIframe && (
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-2">
          {/* Iframe Guide Tooltip */}
          {showSourceGuide && allSources.length > 1 && (
            <div className="absolute top-12 right-28 z-[70] max-w-xs animate-bounce bg-gradient-to-br from-primary/95 via-primary/90 to-primary/80 text-primary-foreground p-3.5 rounded-xl shadow-2xl border border-primary/30 backdrop-blur-md w-60">
              {/* Arrow pointing right/up */}
              <div className="absolute -top-1.5 right-6 w-3 h-3 bg-primary/90 rotate-45" />
              <div className="flex flex-col gap-1.5 text-left relative">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[10px] uppercase tracking-wider text-white/90">Tip: Slow Stream?</span>
                  <button onClick={(e) => { e.stopPropagation(); setShowSourceGuide(false); }} className="text-white/70 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] font-medium leading-relaxed text-white/95">
                  If the video is not playing or loading slowly, switch to the next mirror or API using this button.
                </p>
              </div>
            </div>
          )}
          {allSources.length > 1 && (
            <button onClick={() => {
              const nextIndex = (currentSourceIndex + 1) % allSources.length;
              onSourceChange(nextIndex);
            }}
              title={`Switch to next mirror/API (Current: ${allSources[currentSourceIndex]?.provider || 'Unknown'})`}
              className="h-10 px-4 rounded-full bg-black/60 hover:bg-primary hover:text-primary-foreground active:scale-95 flex items-center gap-2 text-white font-semibold text-xs transition-all border border-white/20 shadow-xl"
            >
              <Server className="w-4 h-4" />
              <span>Next Mirror ({currentSourceIndex + 1}/{allSources.length})</span>
            </button>
          )}
          <button onClick={onClose}
            title="Close player"
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-red-500/80 flex items-center justify-center transition-all border border-white/20 shadow-xl"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
