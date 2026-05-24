import { useEffect, useState } from 'react';
import { Play, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { AnimeItem } from '@/lib/api';

interface HeroSlideshowProps {
  slides: AnimeItem[];
  onCardClick?: (anime: AnimeItem) => void;
}

export function HeroSlideshow({ slides, onCardClick }: HeroSlideshowProps) {
  const [index, setIndex] = useState<number>(0);

  useEffect(() => {
    if (slides.length === 0) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <section className="relative h-[70vh] min-h-[480px] w-full flex items-center justify-center bg-card">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </section>
    );
  }

  const slide = slides[index];
  const bgImage = slide.banner || slide.coverImage;

  function handleWatch() {
    onCardClick?.(slide);
  }

  return (
    <section className="relative h-[70vh] min-h-[480px] w-full overflow-hidden">
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === index ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}
        >
          <img
            src={s.banner || s.coverImage}
            alt={s.title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = s.coverImage;
            }}
          />
          <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        </div>
      ))}

      <div className="relative z-20 h-full flex flex-col justify-end pb-20 px-6 md:px-14 max-w-3xl">
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary-glow)]" />
          Trending Now
        </span>
        <h1 className="text-4xl md:text-6xl font-black text-foreground leading-[1.05] mb-4 tracking-tight">
          {slide.title}
        </h1>
        {slide.synopsis && (
          <p className="text-base md:text-lg text-muted-foreground mb-2 max-w-xl line-clamp-2">
            {slide.synopsis.replace(/<[^>]*>/g, '')}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-6">
          {slide.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="text-xs px-2.5 py-1 rounded-full border border-border bg-card/60 backdrop-blur text-foreground/80"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleWatch}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-lg hover:bg-primary-glow transition-all shadow-[var(--shadow-glow)] hover:scale-[1.03]"
          >
            <Play className="w-5 h-5 fill-current" />
            Watch Now
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-card/70 backdrop-blur border border-border text-foreground font-semibold px-6 py-3 rounded-lg hover:border-primary hover:text-primary transition-all"
          >
            <Plus className="w-5 h-5" />
            My List
          </button>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
          className="h-9 w-9 rounded-full border border-border bg-card/70 backdrop-blur text-foreground hover:text-primary hover:border-primary transition flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-8 bg-primary shadow-[0_0_8px_var(--primary-glow)]' : 'w-3 bg-border'}`}
          />
        ))}
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => setIndex((i) => (i + 1) % slides.length)}
          className="h-9 w-9 rounded-full border border-border bg-card/70 backdrop-blur text-foreground hover:text-primary hover:border-primary transition flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
