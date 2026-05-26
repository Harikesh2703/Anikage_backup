import { useState, useEffect } from 'react';
import { 
  Download, Play, FolderOpen, Pause, PlayCircle, 
  RotateCcw, Trash2, XCircle, Clock, AlertTriangle, CheckCircle, Search, Info,
  ChevronDown, ChevronUp, Film
} from 'lucide-react';
import { api } from '@/lib/api';

export interface DownloadTask {
  id: string;
  animeId: string;
  animeTitle: string;
  coverImage: string;
  episodeNumber: string;
  quality: string;
  status: 'QUEUED' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  downloadedSegments: number;
  totalSegments: number;
  localPath?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  speed?: number;
  eta?: number;
}

interface DownloadsViewProps {
  onAddNotification?: (notif: { type: 'info' | 'error'; title: string; message: string }) => void;
}

export function DownloadsView({ onAddNotification }: DownloadsViewProps) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'downloaded' | 'tasks'>('downloaded');
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);

  // Load downloads from SQLite
  const loadDownloads = async () => {
    try {
      const data = await api.downloads();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load downloads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDownloads();

    // Setup SSE connection to listen for real-time progress & status updates
    const eventSource = new EventSource('http://localhost:3001/api/downloads/events');

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'progress') {
          const { id, progress, downloadedSegments, totalSegments, speed, eta } = message.data;
          setTasks(prev => prev.map(task => {
            if (task.id === id) {
              return { ...task, progress, downloadedSegments, totalSegments, speed, eta };
            }
            return task;
          }));
        } 
        
        else if (message.type === 'state-change') {
          const { id, status, localPath, errorMessage } = message.data;
          setTasks(prev => prev.map(task => {
            if (task.id === id) {
              return { ...task, status, localPath, errorMessage };
            }
            return task;
          }));
          
          // Re-load completely if status is changed to update lists
          loadDownloads();
        }

        else if (message.type === 'batch-notification') {
          const { type, title, message: msg } = message.data;
          if (onAddNotification) {
            onAddNotification({ type, title, message: msg });
          }
        }
      } catch (e) {
        console.error('Error parsing SSE data:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [onAddNotification]);

  const handlePause = async (id: string) => {
    try {
      await api.pauseDownload(id);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'PAUSED' } : t));
    } catch (e) {
      console.error('Failed to pause download:', e);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.resumeDownload(id);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'QUEUED' } : t));
    } catch (e) {
      console.error('Failed to resume download:', e);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.cancelDownload(id);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'CANCELLED', progress: 0 } : t));
      loadDownloads();
    } catch (e) {
      console.error('Failed to cancel download:', e);
    }
  };

  const handleRetry = async (task: DownloadTask) => {
    try {
      await api.enqueueDownload(task.animeId, task.animeTitle, task.coverImage, task.episodeNumber, task.quality);
      loadDownloads();
    } catch (e) {
      console.error('Failed to retry download:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDownload(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error('Failed to delete download task:', e);
    }
  };

  const handlePlayFile = (localPath?: string) => {
    if (!localPath) return;
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      window.electron.invoke('open-path', localPath).then((res: any) => {
        if (!res.success) alert(`Error playing file: ${res.error}`);
      });
    } else {
      alert('Local file playback is only supported in the Desktop application.');
    }
  };

  const handleOpenFolder = (localPath?: string) => {
    if (!localPath) return;
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      window.electron.invoke('show-item-in-folder', localPath).then((res: any) => {
        if (!res.success) alert(`Error opening folder: ${res.error}`);
      });
    } else {
      alert('Opening local folders is only supported in the Desktop application.');
    }
  };

  const toggleGroup = (animeTitle: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [animeTitle]: !prev[animeTitle]
    }));
  };

  // Group completed downloads by anime
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
  const groupedDownloads: { [key: string]: { animeTitle: string; coverImage: string; episodes: DownloadTask[] } } = {};
  
  completedTasks.forEach(task => {
    if (!groupedDownloads[task.animeTitle]) {
      groupedDownloads[task.animeTitle] = {
        animeTitle: task.animeTitle,
        coverImage: task.coverImage,
        episodes: []
      };
    }
    groupedDownloads[task.animeTitle].episodes.push(task);
  });

  // Sort episodes in each group ascending
  Object.values(groupedDownloads).forEach(group => {
    group.episodes.sort((a, b) => parseFloat(a.episodeNumber) - parseFloat(b.episodeNumber));
  });

  // Filter groups based on search
  const filteredGroupedDownloads = Object.values(groupedDownloads).map(group => {
    const matchingEpisodes = group.episodes.filter(ep => 
      group.animeTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `episode ${ep.episodeNumber}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...group, episodes: matchingEpisodes };
  }).filter(group => group.episodes.length > 0);

  // Filter Tasks list based on search
  const filteredTasks = tasks.filter(task => {
    return task.animeTitle.toLowerCase().includes(searchQuery.toLowerCase()) || 
           `episode ${task.episodeNumber}`.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'QUEUED': return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case 'DOWNLOADING': return <Download className="w-5 h-5 text-primary animate-bounce" />;
      case 'PAUSED': return <Pause className="w-5 h-5 text-blue-400" />;
      case 'COMPLETED': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'FAILED': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'CANCELLED': return <XCircle className="w-5 h-5 text-muted-foreground" />;
      default: return <Download className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Downloads Manager</h1>
            <p className="text-muted-foreground text-sm">Organize library, monitor queue, and play your offline episodes.</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card/50 border border-border focus:border-primary/50 focus:outline-none rounded-xl pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab('downloaded')}
          className={`px-6 py-3 font-semibold text-sm transition-all relative ${
            activeTab === 'downloaded' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Library ({completedTasks.length})
          {activeTab === 'downloaded' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-6 py-3 font-semibold text-sm transition-all relative ${
            activeTab === 'tasks' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Queue & History ({tasks.filter(t => t.status !== 'COMPLETED').length})
          {activeTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
        </button>
      </div>

      {/* Container Format Tip */}
      <div className="mb-6 p-4 rounded-xl bg-card border border-border/60 flex items-start gap-3 shadow-sm">
        <div className="p-1 rounded-lg bg-primary/10 text-primary mt-0.5">
          <Info className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Container Format & Compatibility Notice</h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Episodes are saved in their native source container format (typically <code>.mp4</code> or <code>.ts</code>). 
            Our built-in video player plays both seamlessly. However, for maximum compatibility with other local media players or external devices, 
            you might need to rename or convert <code>.ts</code> files to <code>.mp4</code>.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <Download className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground text-sm font-medium">Loading downloads list...</p>
        </div>
      ) : activeTab === 'downloaded' ? (
        /* LIBRARY TAB */
        <div className="space-y-4">
          {filteredGroupedDownloads.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-card border border-border flex items-center justify-center mb-4 opacity-25">
                <Film className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No downloaded videos</p>
              <p className="text-muted-foreground/60 text-sm">Completed downloads will show up here.</p>
            </div>
          ) : (
            filteredGroupedDownloads.map(group => {
              const isExpanded = !!expandedGroups[group.animeTitle];
              return (
                <div key={group.animeTitle} className="border border-border/60 bg-card/40 rounded-2xl overflow-hidden transition-all duration-300">
                  {/* Accordion Header */}
                  <div 
                    onClick={() => toggleGroup(group.animeTitle)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/75 transition-all select-none"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-16 w-12 rounded-lg overflow-hidden bg-muted border border-border/40 shrink-0">
                        {group.coverImage ? (
                          <img src={group.coverImage} alt={group.animeTitle} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground font-bold text-xs">AN</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground text-base truncate">{group.animeTitle}</h3>
                        <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                          {group.episodes.length} {group.episodes.length === 1 ? 'Episode' : 'Episodes'} Downloaded
                        </p>
                      </div>
                    </div>
                    <div className="text-muted-foreground p-1 bg-card border border-border rounded-lg">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="border-t border-border/40 bg-card/10 px-4 divide-y divide-border/30">
                      {group.episodes.map(episode => (
                        <div key={episode.id} className="py-3.5 flex items-center justify-between gap-4 group/row">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-foreground text-sm">
                              Episode {episode.episodeNumber}
                            </span>
                            <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary font-bold px-2 py-0.5 rounded-full uppercase">
                              {episode.quality}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePlayFile(episode.localPath)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs transition-all shadow-[0_2px_8px_rgba(var(--primary-rgb),0.2)]"
                            >
                              <Play className="w-3 h-3 fill-current" /> Play
                            </button>
                            <button
                              onClick={() => handleOpenFolder(episode.localPath)}
                              className="p-2 rounded-xl bg-card hover:bg-card/90 border border-border text-foreground transition-all"
                              title="Show in Folder"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(episode.id)}
                              className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 transition-all opacity-0 group-hover/row:opacity-100"
                              title="Delete Video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* QUEUE & HISTORY TAB */
        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-card border border-border flex items-center justify-center mb-4 opacity-25">
                <Download className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No tasks found</p>
              <p className="text-muted-foreground/60 text-sm">Download queue is currently empty.</p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <div 
                key={task.id}
                className="p-4 bg-card/60 hover:bg-card border border-border/60 hover:border-primary/20 rounded-2xl flex gap-4 items-center transition-all duration-300 group shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
              >
                {/* Cover Image */}
                <div className="h-20 w-16 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/40 relative">
                  {task.coverImage ? (
                    <img src={task.coverImage} alt={task.animeTitle} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground font-bold">AN</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute bottom-1 right-1 text-[10px] bg-black/80 font-bold px-1.5 py-0.5 rounded text-primary">
                    {task.quality}
                  </span>
                </div>

                {/* Details & Progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {getStatusIcon(task.status)}
                    <h3 className="font-bold text-foreground truncate text-base">{task.animeTitle}</h3>
                    <span className="shrink-0 text-xs px-2.5 py-0.5 bg-card border border-border text-muted-foreground rounded-full font-semibold">
                      Episode {task.episodeNumber}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full flex items-center gap-3">
                    <div className="flex-1 h-2 bg-card border border-border/80 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          task.status === 'COMPLETED' ? 'bg-green-500' :
                          task.status === 'FAILED' ? 'bg-red-500' :
                          task.status === 'PAUSED' ? 'bg-blue-400' : 'bg-primary'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.status === 'COMPLETED' && (
                        <CheckCircle className="w-4 h-4 text-green-400 shrink-0" title="Completed" />
                      )}
                      <span className="shrink-0 text-xs font-bold text-foreground w-8 text-right">
                        {task.progress}%
                      </span>
                    </div>
                  </div>

                  {/* Status subtext */}
                  <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                    <div>
                      {task.status === 'DOWNLOADING' && task.totalSegments > 0 && (
                        <span>
                          Downloading chunk {task.downloadedSegments} of {task.totalSegments}
                          {task.speed !== undefined && task.speed > 0 && ` • ${(() => {
                            const mb = task.speed / (1024 * 1024);
                            if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
                            const kb = task.speed / 1024;
                            return `${kb.toFixed(0)} KB/s`;
                          })()}`}
                          {task.eta !== undefined && task.eta > 0 && ` • ${(() => {
                            if (task.eta < 60) return `${task.eta}s remaining`;
                            const mins = Math.floor(task.eta / 60);
                            const secs = task.eta % 60;
                            return `${mins}m ${secs}s remaining`;
                          })()}`}
                        </span>
                      )}
                      {task.status === 'QUEUED' && (
                        <span className="text-yellow-500/80">Pending in download queue...</span>
                      )}
                      {task.status === 'PAUSED' && (
                        <span className="text-blue-400/80">Paused — partial files saved</span>
                      )}
                      {task.status === 'COMPLETED' && (
                        <span className="text-green-400/85 font-medium">Finished — saved on local disk</span>
                      )}
                      {task.status === 'FAILED' && (
                        <span className="text-red-400 truncate max-w-md block" title={task.errorMessage}>
                          Failed: {task.errorMessage}
                        </span>
                      )}
                      {task.status === 'CANCELLED' && (
                        <span>Download cancelled</span>
                      )}
                    </div>
                    <span>
                      {new Date(task.createdAt).toLocaleDateString()} {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Active Controls */}
                  {task.status === 'DOWNLOADING' && (
                    <>
                      <button
                        onClick={() => handlePause(task.id)}
                        className="p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 border border-blue-500/25 transition-all"
                        title="Pause Download"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/25 transition-all"
                        title="Cancel Download"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {task.status === 'QUEUED' && (
                    <button
                      onClick={() => handleCancel(task.id)}
                      className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/25 transition-all"
                      title="Cancel"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}

                  {task.status === 'PAUSED' && (
                    <>
                      <button
                        onClick={() => handleResume(task.id)}
                        className="p-2.5 rounded-xl bg-primary/10 hover:bg-primary/25 text-primary border border-primary/25 transition-all"
                        title="Resume Download"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/25 transition-all"
                        title="Cancel Download"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Completed Controls */}
                  {task.status === 'COMPLETED' && (
                    <>
                      <button
                        onClick={() => handlePlayFile(task.localPath)}
                        className="p-2.5 rounded-xl bg-primary/10 hover:bg-primary/25 text-primary border border-primary/25 transition-all"
                        title="Play in Default Player"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button
                        onClick={() => handleOpenFolder(task.localPath)}
                        className="p-2.5 rounded-xl bg-card hover:bg-card/90 border border-border text-foreground transition-all"
                        title="Show in Folder"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all opacity-0 group-hover:opacity-100"
                        title="Remove Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Failed / Cancelled Controls (Retry else button) */}
                  {(task.status === 'FAILED' || task.status === 'CANCELLED') && (
                    <>
                      <button
                        onClick={() => handleRetry(task)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/20 hover:border-primary/45 text-primary font-semibold text-xs transition-all animate-pulse"
                        title="Retry Download"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Retry
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
