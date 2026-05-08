import { useState } from 'react';
import { AnalyticsView } from '@/components/anime/AnalyticsView';
import { HomeView } from '@/components/anime/HomeView';
import { Navbar } from '@/components/anime/Navbar';
import type { AppView } from '@/components/anime/types';

export function AnimeApp() {
  const [view, setView] = useState<AppView>('home');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar view={view} onNavigate={(v: AppView) => setView(v)} />
      {view === 'home' ? <HomeView /> : <AnalyticsView />}
    </div>
  );
}
