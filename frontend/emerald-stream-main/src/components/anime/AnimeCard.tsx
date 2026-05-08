import { Play } from 'lucide-react';
import type { AnimeItem } from '@/lib/api';

interface AnimeCardProps {
  anime: AnimeItem;
  className?: string;
  onCardClick?: (anime: AnimeItem) => void;
}

export function AnimeCard({ anime, className = '', onCardClick }: AnimeCardProps) {
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

      {/* Hover play overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)]">
          <Play className="w-6 h-6 fill-current" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <h3 className="text-sm font-semibold text-foreground truncate">{anime.title}</h3>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {anime.tags.slice(0, 3).join(' • ')}
        </p>
      </div>
    </div>
  );
}
