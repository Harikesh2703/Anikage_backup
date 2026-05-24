import { Bell, Download, RefreshCcw, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
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
  isDownloaded?: boolean;
}

interface NotificationsViewProps {
  notifications: AppNotification[];
  onInstallPatch: (id: string, url: string) => Promise<void>;
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
  onCheckUpdates: () => Promise<void>;
  onAutoInstallAll: () => Promise<void>;
}

export function NotificationsView({ notifications, onInstallPatch, onMarkAsRead, onClearAll, onCheckUpdates, onAutoInstallAll }: NotificationsViewProps) {
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [autoInstalling, setAutoInstalling] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const handlePatch = async (id: string, url: string) => {
    setPatchingId(id);
    try {
      await onInstallPatch(id, url);
    } finally {
      setPatchingId(null);
    }
  };

  const handleCheckNow = async () => {
    setCheckingUpdates(true);
    setCheckResult(null);
    try {
      await onCheckUpdates();
      setCheckResult('Check complete! Any updates will appear below.');
    } catch (e) {
      setCheckResult('Could not reach the update server.');
    } finally {
      setCheckingUpdates(false);
      setTimeout(() => setCheckResult(null), 5000);
    }
  };

  const handleAutoInstallAll = async () => {
    setAutoInstalling(true);
    try {
      await onAutoInstallAll();
    } finally {
      setAutoInstalling(false);
    }
  };

  const pendingUpdates = notifications.filter(n => n.type === 'update' && !n.isRead);

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

        <div className="flex items-center gap-2">
          {/* Auto-install all button — only visible when there are pending updates */}
          {pendingUpdates.length > 0 && (
            <button
              id="auto-install-all-btn"
              onClick={handleAutoInstallAll}
              disabled={autoInstalling || patchingId !== null}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 shadow-[var(--shadow-glow)]"
            >
              {autoInstalling ? (
                <>
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Installing All...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Install All ({pendingUpdates.length})
                </>
              )}
            </button>
          )}

          {/* Check Now and Clear All buttons */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {notifications.filter(n => !n.isRead).length > 0 && (
                <button
                  onClick={onClearAll}
                  className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200"
                >
                  Clear All
                </button>
              )}
              <button
                id="check-updates-now-btn"
                onClick={handleCheckNow}
                disabled={checkingUpdates}
                className="flex items-center gap-2 bg-card hover:bg-card/80 border border-border hover:border-primary/40 text-foreground px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checkingUpdates ? 'animate-spin text-primary' : ''}`} />
                {checkingUpdates ? 'Checking...' : 'Check Now'}
              </button>
            </div>
            {checkResult && (
              <p className="text-xs text-muted-foreground max-w-[200px] text-right">{checkResult}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {notifications.filter(n => !n.isRead).length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-card border border-border flex items-center justify-center mb-4 opacity-20">
              <Bell className="w-8 h-8" />
            </div>
            <p className="text-muted-foreground font-medium">All caught up!</p>
            <p className="text-muted-foreground/60 text-sm">You have no new notifications.</p>
          </div>
        ) : (
          notifications.filter(n => !n.isRead).map((notif) => (
            <div
              key={notif.id}
              className={`p-5 rounded-2xl border transition-all duration-300 ${
                notif.isRead
                  ? 'bg-card/30 border-border'
                  : 'bg-card border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]'
              }`}
              onClick={() => onMarkAsRead(notif.id)}
            >
              <div className="flex gap-4 relative">
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
                    <div className="flex items-center gap-3">
                      {!notif.isRead && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onMarkAsRead(notif.id); }}
                          className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-all flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark as Read
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {notif.message}
                  </p>

                  {notif.type === 'update' && notif.patchUrl && !notif.isDownloaded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePatch(notif.id, notif.patchUrl!);
                      }}
                      disabled={patchingId !== null || autoInstalling}
                      className="group relative flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-[var(--shadow-glow)]"
                    >
                      {patchingId === notif.id ? (
                        <>
                          <RefreshCcw className="w-4 h-4 animate-spin" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 group-hover:scale-110 transition" />
                          Apply Update (v{notif.version})
                        </>
                      )}
                    </button>
                  )}

                  {notif.isDownloaded && (
                    <div className="flex items-center gap-2 text-sm text-green-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Downloaded — restart to apply
                    </div>
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
