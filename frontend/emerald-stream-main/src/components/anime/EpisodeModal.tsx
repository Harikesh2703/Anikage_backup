import { useEffect, useState } from 'react';
import { X, Play, Loader2, Download, CheckSquare, Square, Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { AnimeItem } from '@/lib/api';

interface EpisodeModalProps {
  anime: AnimeItem;
  onClose: () => void;
  onWatch: (episode: string, episodes: string[]) => void;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export function EpisodeModal({ anime, onClose, onWatch, showToast }: EpisodeModalProps) {
  const [episodes, setEpisodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchProgress, setWatchProgress] = useState<AnimeItem | null>(null);

  // Download mode states
  const [isDownloadMode, setIsDownloadMode] = useState(false);
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [downloadQuality, setDownloadQuality] = useState('1080p');
  const [enqueueing, setEnqueueing] = useState(false);
  const [showDownloadDisabledPopup, setShowDownloadDisabledPopup] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.episodes(anime.id),
      api.getProgress(anime.id).catch(() => null)
    ])
      .then(([eps, progress]) => {
        setEpisodes(eps);
        setWatchProgress(progress);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [anime.id]);

  const toggleEpisodeSelection = (ep: string) => {
    const next = new Set(selectedEpisodes);
    if (next.has(ep)) {
      next.delete(ep);
    } else {
      next.add(ep);
    }
    setSelectedEpisodes(next);
  };

  const handleSelectAll = () => {
    if (selectedEpisodes.size === episodes.length) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(episodes));
    }
  };

  const handleStartDownloads = async () => {
    if (selectedEpisodes.size === 0) return;
    setEnqueueing(true);
    try {
      const selectedList = Array.from(selectedEpisodes).sort((a, b) => {
        // Try to sort numerically if possible
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      for (const ep of selectedList) {
        await api.enqueueDownload(
          anime.id,
          anime.title,
          anime.coverImage,
          ep,
          downloadQuality
        );
      }

      if (showToast) {
        showToast(`Download started. See downloads tab to view progress.`, 'success');
      } else {
        alert(`Successfully queued ${selectedEpisodes.size} episode(s) for download!`);
      }
      setIsDownloadMode(false);
      setSelectedEpisodes(new Set());
    } catch (e: any) {
      if (showToast) {
        showToast(`Error queueing downloads: ${e.message}`, 'error');
      } else {
        alert(`Error queueing downloads: ${e.message}`);
      }
    } finally {
      setEnqueueing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Download Disabled Popup */}
      {showDownloadDisabledPopup && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setShowDownloadDisabledPopup(false)}
        >
          <div className="bg-card border border-border p-8 rounded-2xl max-w-md text-center shadow-2xl relative cursor-default" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-orange-500/10 text-orange-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-500/20 relative">
              <Download className="w-8 h-8 opacity-40" />
              <X className="w-8 h-8 absolute" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Downloads Temporarily Unavailable</h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Currently, our download servers are facing some technical issues due to strict Cloudflare protections from the video providers. We are actively working to fix this as soon as possible in a professional way. 
            </p>
            <p className="text-xs text-orange-400/80 mb-6 font-medium">
              (Streaming is fully functional. Please use the native player.)
            </p>
            <button 
              onClick={() => setShowDownloadDisabledPopup(false)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-2.5 rounded-full font-bold transition-all hover:scale-105 active:scale-95 shadow-lg w-full"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-2xl max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl transition-all duration-300"
        style={{ background: 'var(--color-card)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-border/40"
          style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb),0.15) 0%, transparent 60%)' }}>
          <img
            src={anime.coverImage}
            alt={anime.title}
            className="w-16 h-24 object-cover rounded-lg shrink-0 shadow-lg border border-border/20"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${anime.id}/160/240`; }}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-foreground truncate leading-tight">{anime.title}</h2>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {anime.tags.slice(0, 3).join(' • ')}
            </p>
            
            <div className="flex items-center gap-3 mt-3.5">
              {/* Watch/Resume button */}
              {!loading && !error && episodes.length > 0 && !isDownloadMode && (() => {
                const savedEpisode = watchProgress?.lastEpisode;
                const progressPercent = watchProgress?.progressPercent || 0;
                
                let episodeToPlay = episodes[0];
                let isResume = false;
                
                if (savedEpisode && episodes.includes(savedEpisode) && parseFloat(savedEpisode) !== 0) {
                  const savedEpIndex = episodes.indexOf(savedEpisode);
                  if (progressPercent >= 90 && savedEpIndex < episodes.length - 1) {
                    episodeToPlay = episodes[savedEpIndex + 1];
                    isResume = false;
                  } else {
                    episodeToPlay = savedEpisode;
                    isResume = true;
                  }
                }
                
                return (
                  <button
                    onClick={() => onWatch(episodeToPlay, episodes)}
                    className="flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-bold text-primary-foreground transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'var(--color-primary)' }}>
                    <Play className="w-3 h-3 fill-current" />
                    {isResume 
                      ? `Resume Ep ${episodeToPlay.replace(/^0+(?=\d)/, '')} (${progressPercent}%)` 
                      : `Watch Ep ${episodeToPlay.replace(/^0+(?=\d)/, '')}`
                    }
                  </button>
                );
              })()}

              {/* Download Mode Toggle */}
              {!loading && !error && episodes.length > 0 && (
                <button
                  onClick={() => {
                    setShowDownloadDisabledPopup(true);
                  }}
                  className={`flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-bold border transition-all hover:scale-105 active:scale-95 ${
                    isDownloadMode 
                      ? 'bg-primary/20 text-primary border-primary/30' 
                      : 'bg-card hover:bg-card/90 border-border text-foreground'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  {isDownloadMode ? 'Cancel Selection' : 'Batch Download'}
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Download Mode Option Bar */}
        {isDownloadMode && !loading && !error && (
          <div className="px-5 py-3.5 bg-muted/40 border-b border-border/40 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {/* Select All */}
              <button 
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all"
              >
                {selectedEpisodes.size === episodes.length ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select All
              </button>

              {/* Quality Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Quality:</span>
                <select
                  value={downloadQuality}
                  onChange={(e) => setDownloadQuality(e.target.value)}
                  className="bg-card border border-border text-foreground text-xs font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="480p">480p (SD)</option>
                  <option value="360p">360p (Low)</option>
                </select>
              </div>
            </div>

            {/* Execute Download */}
            <button
              onClick={handleStartDownloads}
              disabled={selectedEpisodes.size === 0 || enqueueing}
              className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_10px_rgba(var(--primary-rgb),0.2)]"
            >
              {enqueueing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Queueing...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> Queue Downloads ({selectedEpisodes.size})
                </>
              )}
            </button>
          </div>
        )}

        {/* Episode grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-muted-foreground text-sm font-medium">Fetching episodes...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-16 bg-red-500/5 rounded-2xl border border-red-500/10">
              <p className="text-red-400 text-sm font-bold">Failed to load episodes</p>
              <p className="text-muted-foreground text-xs mt-1.5 max-w-sm mx-auto">{error}</p>
            </div>
          )}

          {!loading && !error && episodes.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-16">No episodes found.</p>
          )}

          {!loading && !error && episodes.length > 0 && (
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2.5">
              {episodes.map((ep) => {
                const isSelected = selectedEpisodes.has(ep);
                return (
                  <button
                    key={ep}
                    onClick={() => {
                      if (isDownloadMode) {
                        toggleEpisodeSelection(ep);
                      } else {
                        onWatch(ep, episodes);
                      }
                    }}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all relative overflow-hidden flex items-center justify-center border hover:scale-105 active:scale-95 ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_12px_rgba(var(--primary-rgb),0.35)]'
                        : 'bg-muted/40 hover:bg-primary/20 border-border/40 hover:border-primary/20 text-foreground'
                    }`}
                  >
                    {ep.replace(/^0+(?=\d)/, '')}
                    {/* Badge showing selected state */}
                    {isDownloadMode && isSelected && (
                      <div className="absolute top-1 right-1 bg-primary-foreground text-primary rounded-full p-0.5 shadow-sm">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                    {/* Episode watch progress bar */}
                    {!isDownloadMode && watchProgress && watchProgress.lastEpisode === ep && watchProgress.progressPercent !== undefined && watchProgress.progressPercent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full bg-primary" style={{ width: `${watchProgress.progressPercent}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
