import { Settings, RefreshCcw, ShieldAlert, Database, FileText, Info, Download, AlertCircle, FolderOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { AppNotification } from './NotificationsView';
import { api } from '../../lib/api';

interface SettingsViewProps {
  notifications: AppNotification[];
}

export function SettingsView({ notifications }: SettingsViewProps) {
  const [appVersion] = useState('1.0.0');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const [versions, setVersions] = useState<any>(null);
  const [downloadPath, setDownloadPath] = useState('');


  useEffect(() => {
    // Check if there are any pending updates
    const pending = notifications.filter(n => !n.isRead && n.type === 'update');
    setPendingUpdates(pending.length);
    setUpdateAvailable(pending.length > 0);

    // Fetch local versions
    api.getLocalVersions().then(v => setVersions(v)).catch(console.error);

    // Fetch download directory
    api.getDownloadPath().then(res => setDownloadPath(res.path)).catch(console.error);


  }, [notifications]);

  const handleNavigateToUpdates = () => {
    // Navigate to notifications tab
    window.location.hash = '#notifications';
  };

  const handleChangeDirectory = async () => {
    const res = await api.selectDirectory();
    if (res.success && res.path) {
      try {
        await api.saveDownloadPath(res.path);
        setDownloadPath(res.path);
      } catch (err) {
        console.error('Failed to save download directory:', err);
      }
    }
  };



  const handleFactoryReset = async () => {
    const confirmed = window.confirm(
      "WARNING: This will wipe all scraper patches and logs. Your Watch History and Database will be PRESERVED. The app will reload to factory settings. Continue?"
    );

    if (confirmed) {
      try {
        // @ts-ignore
        const electron = window.electron;
        if (!electron) {
          throw new Error('Desktop API not found.');
        }
        const res = await electron.invoke('factory-reset');
        if (res.success) {
          alert("Success! App has been reset. Reloading now...");
          try {
            await electron.invoke('restart-app');
          } catch (e) {
            window.location.reload();
          }
        } else {
          alert("Reset failed: " + res.error);
        }
      } catch (err: any) {
        alert("Error: " + err.message);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Settings</h1>
            <p className="text-muted-foreground text-sm">Configure and maintain your Anikage experience.</p>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {/* Maintenance Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Maintenance & Recovery
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Tools to fix common playback or loading issues.</p>
          </div>
          
          <div className="p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex-1">
                <h3 className="font-bold text-foreground mb-1">Factory Reset Scraper</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Clears all downloaded hot-fixes and temporary logs. Use this if anime mirrors aren't loading or the app feels sluggish.
                </p>
                <div className="flex items-center gap-4 mt-4 text-xs font-medium uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-green-500">
                    <Database className="w-3.5 h-3.5" />
                    Database Safe
                  </span>
                  <span className="flex items-center gap-1.5 text-red-500">
                    <FileText className="w-3.5 h-3.5" />
                    Logs Cleared
                  </span>
                </div>
              </div>

              <button
                onClick={handleFactoryReset}
                className="group flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-3 rounded-xl font-black text-xs transition-all uppercase tracking-widest"
              >
                <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Reset App
              </button>
            </div>
          </div>
        </section>

        {/* Portability Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Data Portability
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Move your watch history and library to a new device.</p>
          </div>
          
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Library
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Save your entire watch history and personalized library as a single <code>.json</code> file.
              </p>
              <button
                onClick={async () => {
                  try {
                    // @ts-ignore
                    const electron = window.electron;
                    if (!electron) {
                      throw new Error('Desktop API not found. If you are using a web browser, this feature is unavailable.');
                    }
                    const res = await electron.invoke('export-db');
                    if (res.success) alert('Backup saved successfully!');
                    else if (res.error) alert('Export failed: ' + res.error);
                  } catch (err: any) {
                    alert('An error occurred: ' + err.message);
                  }
                }}
                className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
              >
                Create Backup
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                Import Library
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Restore your history from a backup file. <span className="text-red-500 font-bold">This will overwrite your current library.</span>
              </p>
              <button
                onClick={async () => {
                  if (confirm('Are you sure? This will replace your current watch history with the backup file. The app will reload.')) {
                    try {
                      // @ts-ignore
                      const electron = window.electron;
                      if (!electron) {
                        throw new Error('Desktop API not found. If you are using a web browser, this feature is unavailable.');
                      }
                      const res = await electron.invoke('import-db');
                      if (res.success) {
                        alert('Import successful! Reloading to apply changes...');
                        window.location.reload();
                      } else if (res.error) {
                        alert('Import failed: ' + res.error);
                      }
                    } catch (err: any) {
                      alert('An error occurred: ' + err.message);
                    }
                  }
                }}
                className="w-full py-3 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
              >
                Restore from File
              </button>
            </div>
          </div>
        </section>

        {/* Downloads Configuration Section */}
        <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Offline Downloads Settings
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Configure your local download storage and video components.</p>
          </div>
          
          <div className="p-8 space-y-6">
            {/* Storage Directory Selector */}
            <div className="space-y-2">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                Download Directory
              </h3>
              <p className="text-sm text-muted-foreground">
                All episodes will be downloaded to this folder, organized inside subfolders named after the anime.
              </p>
              <div className="flex gap-3 mt-3">
                <input
                  type="text"
                  readOnly
                  value={downloadPath || 'Loading...'}
                  className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleChangeDirectory}
                  className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/45 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Select Folder
                </button>
              </div>
            </div>


          </div>
        </section>

        {/* About Section */}
        <section className="bg-card border border-border rounded-3xl p-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              updateAvailable 
                ? 'bg-yellow-500/10 text-yellow-500' 
                : 'bg-muted text-muted-foreground'
            }`}>
              {updateAvailable ? <AlertCircle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-foreground">Version Info</h3>
              <div className="text-xs text-muted-foreground flex flex-col gap-1 mt-1">
                <span className="text-foreground">App: v{versions?.app || appVersion}</span>
                <span>UI: v{versions?.ui || '1.0.0'}</span>
                <span>Server: v{versions?.server || '1.0.0'}</span>
                <span>Scraper: v{versions?.scraper || '1.0.0'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleNavigateToUpdates}
            className={`text-xs font-bold px-3 py-1 rounded-full border uppercase tracking-widest transition-all ${
              updateAvailable
                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20'
                : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
            }`}
          >
            {updateAvailable ? `${pendingUpdates} Update${pendingUpdates !== 1 ? 's' : ''} Available` : 'Up to date'}
          </button>
        </section>
      </div>
    </div>
  );
}
