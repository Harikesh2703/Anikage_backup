import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Clock, Flame, Tv, Loader2 } from 'lucide-react';
import { AnimeCard } from '@/components/anime/AnimeCard';
import { AnimeRow } from '@/components/anime/AnimeRow';
import { api } from '@/lib/api';
import type { AnimeItem } from '@/lib/api';

const GENRE_COLORS = [
  '#10B981', '#34D399', '#06B6D4', '#6EE7B7',
  '#0EA5E9', '#A7F3D0', '#818CF8', '#F472B6',
];

interface GenreStat {
  name: string;
  value: number;
  color: string;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: GenreStat;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-[var(--shadow-card)]">
      <p className="text-xs text-muted-foreground">{item.name}</p>
      <p className="text-sm font-bold text-foreground">{item.value} titles</p>
    </div>
  );
}

interface AnalyticsViewProps {
  onCardClick?: (anime: AnimeItem) => void;
}

export function AnalyticsView({ onCardClick }: AnalyticsViewProps) {
  const [genreStats, setGenreStats] = useState<GenreStat[]>([]);
  const [recommendations, setRecommendations] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const all = await api.trending({ limit: 30 });
        // Derive genre stats from the trending set
        const counts: Record<string, number> = {};
        for (const anime of all) {
          for (const tag of anime.tags.slice(0, 3)) {
            counts[tag] = (counts[tag] ?? 0) + 1;
          }
        }
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        const stats: GenreStat[] = sorted.map(([name, value], i) => ({
          name,
          value,
          color: GENRE_COLORS[i % GENRE_COLORS.length],
        }));
        setGenreStats(stats);
        setRecommendations(all.slice(0, 8));
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const topGenre = genreStats[0];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-20 px-6 md:px-10 pt-10 max-w-7xl mx-auto">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-2">Profile</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
          Your Watch Profile
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          A look at trending anime genres — discover what's popular right now.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <StatCard icon={<Clock className="w-5 h-5" />} label="Trending Titles" value={String(recommendations.length)} />
        <StatCard icon={<Tv className="w-5 h-5" />} label="Genres Tracked" value={String(genreStats.length)} />
        <StatCard icon={<Flame className="w-5 h-5" />} label="Top Genre" value={topGenre?.name ?? '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-12">
        <div className="lg:col-span-3 bg-card border border-border rounded-2xl p-6 md:p-8">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">Trending by Genre</h2>
              <p className="text-sm text-muted-foreground">Distribution of current trending anime</p>
            </div>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genreStats}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={130}
                  paddingAngle={2}
                  stroke="oklch(0.18 0.012 165)"
                  strokeWidth={3}
                >
                  {genreStats.map((g) => (
                    <Cell key={g.name} fill={g.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-bold text-foreground mb-1">Genre Breakdown</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Top genre: {topGenre?.name ?? '—'}
          </p>
          <ul className="space-y-3">
            {genreStats.map((g) => (
              <li key={g.name} className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-sm text-foreground flex-1">{g.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{g.value}</span>
                <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((g.value / (genreStats[0]?.value || 1)) * 100)}%`,
                      backgroundColor: g.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AnimeRow
        title={topGenre ? `Because you love ${topGenre.name}...` : 'Recommended'}
        subtitle="Hand-picked from trending"
      >
        {recommendations.map((item) => (
          <AnimeCard key={item.id} anime={item} onCardClick={onCardClick} />
        ))}
      </AnimeRow>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-primary/60 transition">
      <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
