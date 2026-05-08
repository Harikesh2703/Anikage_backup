import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  title: string;
  episode: string;
  totalEpisodes: string[];
  onClose: () => void;
  onEpisodeChange: (ep: string) => void;
  loading: boolean;
  error: string | null;
}

export function VideoPlayer({
  streamUrl, title, episode, totalEpisodes,
  onClose, onEpisodeChange, loading, error
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <p className="text-red-400 font-semibold text-lg">Stream unavailable</p>
            <p className="text-white/60 text-sm max-w-sm">{error}</p>
            <p className="text-white/40 text-xs">Try a different episode or wait a moment.</p>
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
      </div>

      {/* Controls bar — fades in/out (Disabled for iframes) */}
      {!isIframe && (
        <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)' }}>

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
            className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>

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

          {/* Title + Episode */}
          <span className="text-white/80 text-sm font-medium truncate max-w-[200px] hidden md:block">
            {title} — Ep {episode}
          </span>

          <div className="flex-1" />

          {/* Quality Selector */}
          {availableQualities.length > 0 && (
            <select
              value={currentQuality}
              onChange={(e) => {
                const q = e.target.value;
                setCurrentQuality(q);
                if (hlsRef.current) {
                  if (q === 'Auto') hlsRef.current.currentLevel = -1;
                  else {
                    const idx = availableQualities.indexOf(q) - 1;
                    hlsRef.current.currentLevel = idx;
                  }
                }
              }}
              className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold py-1 px-2 rounded border-0 outline-none cursor-pointer appearance-none uppercase tracking-wider"
            >
              {availableQualities.map(q => <option key={q} value={q} className="bg-black">{q}</option>)}
            </select>
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
        <div>
          <p className="text-white font-semibold text-sm">{title}</p>
          <p className="text-white/50 text-xs">Episode {episode}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      )}

      {/* Persistent Close Button for Iframes */}
      {isIframe && (
        <button onClick={onClose}
          className="absolute top-4 right-4 z-[60] w-10 h-10 rounded-full bg-black/60 hover:bg-red-500/80 flex items-center justify-center transition-all border border-white/20 shadow-xl"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      )}
    </div>
  );
}
