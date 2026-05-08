import { Play } from "lucide-react";
import type { WatchProgress } from "@/data/animeData";

interface ProgressCardProps {
  item: WatchProgress;
}

export function ProgressCard({ item }: ProgressCardProps) {
  return (
    <div className="group relative shrink-0 w-[170px] md:w-[190px] aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-card transition-all duration-300 hover:scale-[1.04] hover:shadow-[var(--shadow-glow)] hover:ring-2 hover:ring-primary/60">
      <img
        src={item.coverImage}
        alt={item.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-card)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)]">
          <Play className="w-6 h-6 fill-current" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 pb-4">
        <p className="text-[11px] text-muted-foreground mb-1">Episode {item.currentEpisode}</p>
        <h3 className="text-sm font-semibold text-foreground truncate mb-2">{item.title}</h3>
        <div className="h-1 w-full rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary shadow-[0_0_8px_var(--primary-glow)]"
            style={{ width: `${item.progressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
