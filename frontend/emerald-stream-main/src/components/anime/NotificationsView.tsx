import { Bell, Download, RefreshCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export interface AppNotification {
  id: string;
  type: 'update' | 'info' | 'error';
  title: string;
  message: string;
  version?: string;
  patchUrl?: string;
  timestamp: Date;
  isRead: boolean;
}

interface NotificationsViewProps {
  notifications: AppNotification[];
  onInstallPatch: (id: string, url: string) => Promise<void>;
  onMarkAsRead: (id: string) => void;
}

export function NotificationsView({ notifications, onInstallPatch, onMarkAsRead }: NotificationsViewProps) {
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const handlePatch = async (id: string, url: string) => {
    setPatchingId(id);
    try {
      await onInstallPatch(id, url);
    } finally {
      setPatchingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Notifications</h1>
            <p className="text-muted-foreground text-sm">Stay updated with the latest fixes and news.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-card border border-border flex items-center justify-center mb-4 opacity-20">
              <Bell className="w-8 h-8" />
            </div>
            <p className="text-muted-foreground font-medium">All caught up!</p>
            <p className="text-muted-foreground/60 text-sm">You have no new notifications.</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id}
              className={`p-5 rounded-2xl border transition-all duration-300 ${
                notif.isRead 
                  ? 'bg-card/30 border-border' 
                  : 'bg-card border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]'
              }`}
              onClick={() => onMarkAsRead(notif.id)}
            >
              <div className="flex gap-4">
                <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                  notif.type === 'update' ? 'bg-primary/10 text-primary' : 
                  notif.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                }`}>
                  {notif.type === 'update' ? <Download className="w-5 h-5" /> : 
                   notif.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-bold text-foreground text-lg">{notif.title}</h3>
                    <span className="text-xs text-muted-foreground">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {notif.message}
                  </p>

                  {notif.type === 'update' && notif.patchUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePatch(notif.id, notif.patchUrl!);
                      }}
                      disabled={patchingId !== null}
                      className="group relative flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-[var(--shadow-glow)]"
                    >
                      {patchingId === notif.id ? (
                        <>
                          <RefreshCcw className="w-4 h-4 animate-spin" />
                          Patching...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 group-hover:scale-110 transition" />
                          Apply Hot-Fix (v{notif.version})
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
