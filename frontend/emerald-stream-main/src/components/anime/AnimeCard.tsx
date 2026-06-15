import { Play } from 'lucide-react';
import type { AnimeItem } from '@/lib/api';

interface AnimeCardProps {
  anime: AnimeItem;
  className?: string;
  onCardClick?: (anime: AnimeItem) => void;
  onInfoClick?: (anime: AnimeItem) => void;
  onRemoveHistory?: (anime: AnimeItem) => void;
}

export function AnimeCard({ anime, className = '', onCardClick, onInfoClick, onRemoveHistory }: AnimeCardProps) {
  function handlePlay() {
    onCardClick?.(anime);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePlay}
      onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
      className={`group relative shrink-0 w-[170px] md:w-[190px] aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-card transition-all duration-300 hover:scale-[1.04] hover:shadow-[var(--shadow-glow)] hover:ring-2 hover:ring-primary/60 ${className}`}
    >
      <img
        src={anime.coverImage}
        alt={anime.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        onError={(e) => {
          (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${anime.id}/400/600`;
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'var(--gradient-card)' }}
      />

      {/* Hover play/info overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
        {onInfoClick ? (
          <div className="flex gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlay();
              }}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)] hover:scale-110 transition-transform"
              title="Resume Playback"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick(anime);
              }}
              className="w-12 h-12 rounded-full bg-slate-800/90 text-white flex items-center justify-center border border-white/10 hover:bg-slate-700 hover:scale-110 transition-transform"
              title="Episodes & Info"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Play className="w-6 h-6 fill-current" />
          </div>
        )}
      </div>

      {onRemoveHistory && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveHistory(anime);
          }}
          className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors z-20"
          title="Remove from history"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 pointer-events-none">
        <h3 className="text-sm font-semibold text-foreground truncate">{anime.title}</h3>
        {anime.lastEpisode ? (
          <p className="text-[11px] text-primary font-bold mt-0.5">
            Episode {anime.lastEpisode}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {anime.tags.slice(0, 3).join(' • ')}
          </p>
        )}
      </div>

      {anime.progressPercent !== undefined && anime.progressPercent > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 overflow-hidden">
          <div
            className="h-full bg-primary rounded-r"
            style={{ width: `${anime.progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
