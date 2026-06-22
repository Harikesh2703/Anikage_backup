import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import EventEmitter from 'events';
import { db_helper } from './db.mjs';

// Global Event Emitter for broadcasting events to SSE clients
export const downloadEvents = new EventEmitter();

// Active and queued download tasks in memory
// Map of taskId -> { abortController, taskData }
const activeDownloads = new Map();
let isProcessingQueue = false;

/**
 * Sanitize filename for all operating systems
 */
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * Resolve absolute or relative segment URL from M3U8 base URL
 */
function resolveUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    return relativeUrl;
  }
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Referer': 'https://allmanga.to'
};

/**
 * Helper to fetch content as string
 */
function fetchText(url) {
  url = url.startsWith('//') ? 'https:' + url : url;
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: { ...DEFAULT_HEADERS }
    };
    protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(resolveUrl(url, res.headers.location)));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch: HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Parse M3U8 to extract segment URLs
 */
function parseM3U8(playlistContent, playlistUrl) {
  const lines = playlistContent.split('\n');
  const segments = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      segments.push(resolveUrl(playlistUrl, line));
    }
  }
  return segments;
}

/**
 * Download a single file chunk with retry logic and abort support
 */
function downloadChunk(url, destPath, abortSignal, onBytes, retries = 3) {
  url = url.startsWith('//') ? 'https:' + url : url;
  return new Promise((resolve, reject) => {
    const execute = (attempt) => {
      if (abortSignal.aborted) {
        return reject(new Error('Aborted'));
      }

      const parsedUrl = new URL(url);
      const protocol = url.startsWith('https') ? https : http;
      const options = {
        headers: { ...DEFAULT_HEADERS },
        signal: abortSignal
      };
      
      const req = protocol.get(url, options, (res) => {
        // Handle Redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = resolveUrl(url, res.headers.location);
          return resolve(downloadChunk(nextUrl, destPath, abortSignal, onBytes, retries));
        }

        if (res.statusCode !== 200) {
          if (attempt < retries) {
            console.log(`[DOWNLOAD] Retry chunk: ${attempt + 1}/${retries} due to HTTP ${res.statusCode}`);
            setTimeout(() => execute(attempt + 1), 1000);
          } else {
            reject(new Error(`Failed to download chunk: HTTP ${res.statusCode}`));
          }
          return;
        }

        const fileStream = fs.createWriteStream(destPath);
        
        res.on('data', (chunk) => {
          if (onBytes) onBytes(chunk.length);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          if (attempt < retries) {
            setTimeout(() => execute(attempt + 1), 1000);
          } else {
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        if (abortSignal.aborted) {
          return reject(new Error('Aborted'));
        }
        if (attempt < retries) {
          console.log(`[DOWNLOAD] Retry chunk: ${attempt + 1}/${retries} due to connection error`);
          setTimeout(() => execute(attempt + 1), 1000);
        } else {
          reject(err);
        }
      });
    };

    execute(1);
  });
}

/**
 * Download direct file (MP4) with Range headers support
 */
function downloadDirectFile(url, destPath, startBytes, totalBytes, abortSignal, onProgress) {
  url = url.startsWith('//') ? 'https:' + url : url;
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) return reject(new Error('Aborted'));

    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: { ...DEFAULT_HEADERS }
    };
    if (startBytes > 0) {
      options.headers['Range'] = `bytes=${startBytes}-`;
    }

    const req = protocol.get(url, { ...options, signal: abortSignal }, (res) => {
      // Handle Redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = resolveUrl(url, res.headers.location);
        return resolve(downloadDirectFile(nextUrl, destPath, startBytes, totalBytes, abortSignal, onProgress));
      }

      const isRange = res.statusCode === 206;
      if (res.statusCode !== 200 && !isRange) {
        return reject(new Error(`Direct download HTTP error: ${res.statusCode}`));
      }

      const contentLen = parseInt(res.headers['content-length'] || '0');
      const finalTotal = isRange ? totalBytes : contentLen;

      // Open in append mode if we are resuming
      const fileStream = fs.createWriteStream(destPath, { flags: startBytes > 0 ? 'r+' : 'w', start: startBytes });
      res.pipe(fileStream);

      let downloaded = startBytes;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (finalTotal > 0) {
          onProgress(downloaded, finalTotal);
        }
      });

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper to get path of system FFmpeg
 */
export async function getFFmpegPath() {
  const customFFmpeg = await db_helper.getSetting('ffmpeg_path');
  if (customFFmpeg && fs.existsSync(customFFmpeg)) {
    return customFFmpeg;
  }
  return new Promise((resolve) => {
    exec('ffmpeg -version', (err) => {
      if (!err) {
        resolve('ffmpeg');
      } else {
        const fallbacks = [
          '/usr/bin/ffmpeg',
          '/usr/local/bin/ffmpeg',
          'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
          'C:\\ffmpeg\\bin\\ffmpeg.exe'
        ];
        for (const fb of fallbacks) {
          if (fs.existsSync(fb)) {
            resolve(fb);
            return;
          }
        }
        resolve(null);
      }
    });
  });
}

/**
 * Stitch HLS segments together using ffmpeg or pure JS concatenation fallback
 */
function stitchSegments(tempDir, segmentCount, finalOutputPath) {
  return new Promise(async (resolve, reject) => {
    const ffmpegPath = await getFFmpegPath();
    if (!ffmpegPath) {
      console.log('[DOWNLOAD] FFmpeg not found. Falling back to pure JS concatenation (.ts container)...');
      try {
        const finalTsPath = finalOutputPath.replace(/\.mp4$/i, '.ts');
        const writeStream = fs.createWriteStream(finalTsPath);
        
        for (let i = 0; i < segmentCount; i++) {
          const segFileName = `${String(i).padStart(5, '0')}.ts`;
          const chunkPath = path.join(tempDir, segFileName);
          if (fs.existsSync(chunkPath)) {
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
          }
        }
        
        writeStream.end();
        writeStream.on('finish', () => {
          console.log('[DOWNLOAD] Pure JS concatenation complete:', finalTsPath);
          resolve({ localPath: finalTsPath });
        });
        writeStream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
      return;
    }

    // Create concat text file for FFmpeg
    const concatFilePath = path.join(tempDir, 'concat_list.txt');
    let fileContent = '';
    for (let i = 0; i < segmentCount; i++) {
      const segFileName = `${String(i).padStart(5, '0')}.ts`;
      fileContent += `file '${segFileName}'\n`;
    }
    fs.writeFileSync(concatFilePath, fileContent);

    // Run FFmpeg in copy mode (super fast)
    const ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFilePath,
      '-c', 'copy',
      '-y',
      finalOutputPath
    ]);

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ localPath: finalOutputPath });
      } else {
        reject(new Error(`FFmpeg stitch failed with exit code ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Queue Processor
 */
export async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const allTasks = await db_helper.getAllDownloads();
    
    // Count active downloads
    const downloadingCount = allTasks.filter(t => t.status === 'DOWNLOADING').length;
    const slotsAvailable = 2 - downloadingCount;

    if (slotsAvailable <= 0) {
      isProcessingQueue = false;
      return;
    }

    // Get next queued tasks
    const queuedTasks = allTasks.filter(t => t.status === 'QUEUED');
    
    for (let i = 0; i < Math.min(slotsAvailable, queuedTasks.length); i++) {
      const task = queuedTasks[i];
      if (activeDownloads.has(task.id)) continue;
      startDownloadTask(task);
    }
  } catch (err) {
    console.error('[DOWNLOAD MANAGER] Queue processing error:', err.message);
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Start/Resume a download task in the background
 */
async function startDownloadTask(task) {
  if (activeDownloads.has(task.id)) return;
  
  console.log(`[DOWNLOAD MANAGER] Starting task: ${task.animeTitle} Ep ${task.episodeNumber}`);
  
  const abortController = new AbortController();
  activeDownloads.set(task.id, { abortController, taskData: task });

  // Update status in DB
  await db_helper.updateDownloadStatus(task.id, 'DOWNLOADING');
  downloadEvents.emit('state-change', { id: task.id, status: 'DOWNLOADING' });

  // Get download directories
  let downloadDir = await db_helper.getSetting('download_path');
  if (!downloadDir) {
    downloadDir = path.join(os.homedir(), 'Downloads');
  }

  // Create sanitized paths
  const animeFolder = path.join(downloadDir, sanitizeFilename(task.animeTitle));
  if (!fs.existsSync(animeFolder)) {
    fs.mkdirSync(animeFolder, { recursive: true });
  }

  const finalOutputName = `${sanitizeFilename(task.animeTitle)} - Ep ${task.episodeNumber} [${task.quality}].mp4`;
  let finalOutputPath = path.join(animeFolder, finalOutputName);

  // Unique temporary directory for this task
  const tempDir = task.tempDir || path.join(os.tmpdir(), 'anikage', task.id);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save temp_dir and local_path in DB
  task.tempDir = tempDir;
  task.localPath = finalOutputPath;
  await db_helper.saveDownloadTask(task);

  try {
    let candidates = [];

    // 1. If streamUrl is provided in the task metadata, use it as first candidate
    if (task.streamUrl) {
      candidates.push({ url: task.streamUrl, quality: task.quality, provider: 'Provided Stream' });
    }

    // 2. Try loading from SQLite cache if candidates list is empty
    if (candidates.length === 0) {
      const cacheKey = `${task.animeId}:${task.episodeNumber}`;
      try {
        const cachedData = await db_helper.getLinksFromCache(cacheKey);
        if (cachedData && cachedData.sources && cachedData.sources.length > 0) {
          console.log(`[DOWNLOAD MANAGER] Resolved stream from cache for Ep ${task.episodeNumber}`);
          const matching = cachedData.sources.filter(l => l.quality === task.quality);
          const others = cachedData.sources.filter(l => l.quality !== task.quality);
          candidates = [...matching, ...others];
        }
      } catch (cacheErr) {
        console.error('[DOWNLOAD MANAGER] Cache resolution failed:', cacheErr.message);
      }
    }

    // 3. Fallback to dynamic scraping if candidates list is still empty
    if (candidates.length === 0) {
      console.log(`[DOWNLOAD MANAGER] Fetching fresh stream links dynamically for Ep ${task.episodeNumber}`);
      const { getApi } = await import('./index.mjs'); // Lazy load/resolve index API
      const api = getApi();
      try {
        const { sources } = await api.getEpisodeEmbedUrls(task.animeId, task.episodeNumber);
        const links = await api.generateLinks(sources);
        if (links && links.length > 0) {
          const matching = links.filter(l => l.quality === task.quality);
          const others = links.filter(l => l.quality !== task.quality);
          candidates = [...matching, ...others];
        }
      } catch (scrapeErr) {
        console.error('[DOWNLOAD MANAGER] Dynamic scrape failed:', scrapeErr.message);
      }
    }

    // Filter and sanitize candidate URLs
    candidates = candidates.filter(c => {
      const isInvalid = !c.url || c.url.includes('i3!') || c.url.includes('+++') || (!c.url.startsWith('http') && !c.url.startsWith('//'));
      if (isInvalid && c.url) {
        // Self-heal: If this was from cache, delete it
        const cacheKey = `${task.animeId}:${task.episodeNumber}`;
        db_helper.deleteLinkCacheEntry(cacheKey).catch(() => {});
      }
      return !isInvalid;
    });

    // Normalize protocol-relative URLs
    candidates = candidates.map(c => {
      let url = c.url;
      if (url.startsWith('//')) {
        url = 'https:' + url;
      }
      return { ...c, url };
    });

    if (candidates.length === 0) {
      throw new Error('Could not find stream URL for this episode.');
    }

    let success = false;
    let lastError = null;

    for (let mirrorIdx = 0; mirrorIdx < candidates.length; mirrorIdx++) {
      const candidate = candidates[mirrorIdx];
      const finalUrl = candidate.url;
      console.log(`[DOWNLOAD MANAGER] Attempting mirror ${mirrorIdx + 1}/${candidates.length}: ${candidate.provider || 'unknown'} (${finalUrl})`);

      try {
        // Check abort
        if (abortController.signal.aborted) {
          throw new Error('Aborted');
        }

        const isHLS = finalUrl.includes('.m3u8') || finalUrl.includes('playlist');

        if (isHLS) {
          // --- HLS SEGMENT DOWNLOADER ---
          console.log(`[DOWNLOAD] Parsing HLS playlist for Ep ${task.episodeNumber}`);
          const m3u8Content = await fetchText(finalUrl);
          const segments = parseM3U8(m3u8Content, finalUrl);
          const totalSegments = segments.length;

          if (totalSegments === 0) {
            throw new Error('Parsed playlist contains no segments.');
          }

          task.totalSegments = totalSegments;
          await db_helper.saveDownloadTask(task);

          let downloadedSegments = 0; // Reset progress when switching mirrors
          
          // Calculate initial bytes from existing segments
          let initialBytes = 0;
          try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
              if (file.endsWith('.ts')) {
                initialBytes += fs.statSync(path.join(tempDir, file)).size;
              }
            }
          } catch (e) {}
          
          task.initialBytes = initialBytes;
          task.sessionBytes = 0;
          task.startTime = Date.now();

          // Concurrently download chunks (up to 3 at a time)
          const downloadQueue = [...segments.keys()]; // Array of indices
          const concurrency = 3;
          
          const downloadWorker = async () => {
            while (downloadQueue.length > 0) {
              if (abortController.signal.aborted) {
                throw new Error('Aborted');
              }
              const index = downloadQueue.shift();
              const segmentUrl = segments[index];
              const chunkPath = path.join(tempDir, `${String(index).padStart(5, '0')}.ts`);

              // Skip if already downloaded (enables resuming!)
              if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) {
                continue;
              }

              await downloadChunk(segmentUrl, chunkPath, abortController.signal, (bytes) => {
                task.sessionBytes += bytes;
              });
              
              if (abortController.signal.aborted) {
                throw new Error('Aborted');
              }

              downloadedSegments++;
              const progress = Math.round((downloadedSegments / totalSegments) * 100);
              
              // Calculate progress tracking details: speed and eta
              const elapsed = (Date.now() - task.startTime) / 1000; // in seconds
              const speed = elapsed > 0 ? (task.sessionBytes / elapsed) : 0; // bytes/sec
              const totalDownloaded = task.initialBytes + task.sessionBytes;
              const averageSize = downloadedSegments > 0 ? (totalDownloaded / downloadedSegments) : 0;
              const estimatedTotal = averageSize * totalSegments;
              const remainingBytes = Math.max(0, estimatedTotal - totalDownloaded);
              const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

              // Throttled database update
              await db_helper.updateDownloadProgress(task.id, progress, downloadedSegments, totalSegments);
              
              downloadEvents.emit('progress', {
                id: task.id,
                progress,
                downloadedSegments,
                totalSegments,
                speed,
                eta
              });
            }
          };

          // Run workers
          const workers = Array(Math.min(concurrency, downloadQueue.length))
            .fill(null)
            .map(() => downloadWorker());

          await Promise.all(workers);

          // Check abort again
          if (abortController.signal.aborted) {
            throw new Error('Aborted');
          }

          // Stitch chunks
          console.log(`[DOWNLOAD] Stitching ${totalSegments} segments...`);
          const stitchResult = await stitchSegments(tempDir, totalSegments, finalOutputPath);
          if (stitchResult && stitchResult.localPath) {
            finalOutputPath = stitchResult.localPath;
          }
          
        } else {
          // --- DIRECT MP4 DOWNLOADER ---
          console.log(`[DOWNLOAD] Downloading direct MP4: ${finalUrl}`);
          // Get current size if file exists to resume
          let startBytes = 0;
          if (fs.existsSync(finalOutputPath)) {
            startBytes = fs.statSync(finalOutputPath).size;
          }

          // Probing total length and content type
          let totalBytes = 0;
          let contentType = '';
          await new Promise((resolve) => {
            const protocol = finalUrl.startsWith('https') ? https : http;
            const options = {
              method: 'HEAD',
              headers: { ...DEFAULT_HEADERS }
            };
            protocol.request(finalUrl, options, (res) => {
              totalBytes = parseInt(res.headers['content-length'] || '0');
              contentType = res.headers['content-type'] || '';
              resolve();
            }).on('error', () => resolve()).end();
          });

          if (contentType.includes('text/html')) {
            throw new Error('URL returned an HTML page (iframe) instead of a video file. This mirror cannot be natively downloaded.');
          }

          task.initialBytes = startBytes;
          task.sessionBytes = 0;
          task.startTime = Date.now();

          await downloadDirectFile(finalUrl, finalOutputPath, startBytes, totalBytes, abortController.signal, (downloaded, total) => {
            task.sessionBytes = downloaded - startBytes;
            const progress = Math.round((downloaded / total) * 100);
            
            // Calculate progress tracking details: speed and eta
            const elapsed = (Date.now() - task.startTime) / 1000; // in seconds
            const speed = elapsed > 0 ? (task.sessionBytes / elapsed) : 0; // bytes/sec
            const remainingBytes = Math.max(0, total - downloaded);
            const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

            db_helper.updateDownloadProgress(task.id, progress, downloaded, total);
            downloadEvents.emit('progress', { 
              id: task.id, 
              progress,
              downloadedSegments: downloaded,
              totalSegments: total,
              speed,
              eta
            });
          });
        }

        // Successfully downloaded from this mirror!
        success = true;
        break;

      } catch (err) {
        if (err.message === 'Aborted') {
          throw err; // Propagate Abort signal to stop processing altogether
        }
        
        console.error(`[DOWNLOAD MANAGER] Mirror ${mirrorIdx + 1} failed: ${err.message}`);
        lastError = err;

        // Clean up partial state for this mirror to avoid corrupting next attempt
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
          if (fs.existsSync(finalOutputPath)) {
            fs.unlinkSync(finalOutputPath);
          }
        } catch (cleanupErr) {}
      }
    }

    if (!success) {
      throw lastError || new Error('All stream mirrors failed to download.');
    }

    // Success! Update DB and clean up temp files
    console.log(`[DOWNLOAD MANAGER] Completed task: ${task.id}`);
    await db_helper.updateDownloadStatus(task.id, 'COMPLETED', null, finalOutputPath);
    activeDownloads.delete(task.id);
    downloadEvents.emit('state-change', { id: task.id, status: 'COMPLETED', localPath: finalOutputPath });

    // Try deleting temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    // Check if this completes a batch of downloads to push a notification
    checkAndNotifyBatchCompletion(task.animeId, task.animeTitle);

  } catch (err) {
    if (err.message === 'Aborted') {
      console.log(`[DOWNLOAD MANAGER] Paused/Aborted task: ${task.id}`);
      // Do not clean up temp files, so we can resume later!
    } else {
      console.error(`[DOWNLOAD MANAGER] Task failed: ${task.id}`, err.message);
      await db_helper.updateDownloadStatus(task.id, 'FAILED', err.message);
      activeDownloads.delete(task.id);
      downloadEvents.emit('state-change', { id: task.id, status: 'FAILED', errorMessage: err.message });
      
      checkAndNotifyBatchCompletion(task.animeId, task.animeTitle);
    }
  }

  // Trigger processQueue to run the next task with a 4.5s delay to prevent API rate-limit cascades
  setTimeout(() => {
    processQueue();
  }, 4500);
}

/**
 * Pause a download task
 */
export async function pauseDownload(id) {
  const active = activeDownloads.get(id);
  if (active) {
    active.abortController.abort();
    activeDownloads.delete(id);
  }
  await db_helper.updateDownloadStatus(id, 'PAUSED');
  downloadEvents.emit('state-change', { id, status: 'PAUSED' });
  processQueue();
}

/**
 * Cancel a download task (cleans up temp files)
 */
export async function cancelDownload(id) {
  const active = activeDownloads.get(id);
  if (active) {
    active.abortController.abort();
    activeDownloads.delete(id);
  }

  const task = await db_helper.getDownloadTask(id);
  if (task) {
    // Delete temp folder
    if (task.tempDir && fs.existsSync(task.tempDir)) {
      try {
        fs.rmSync(task.tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
    // Delete partially written final file if exists
    if (task.localPath && fs.existsSync(task.localPath) && task.status !== 'COMPLETED') {
      try {
        fs.unlinkSync(task.localPath);
      } catch (e) {}
    }
  }

  await db_helper.updateDownloadStatus(id, 'CANCELLED');
  downloadEvents.emit('state-change', { id, status: 'CANCELLED' });
  processQueue();
}

/**
 * Batch Notification Scheduler
 * Monitors when a set of queued/downloading episodes for an anime completes,
 * and pushes a unified notification to the frontend.
 */
async function checkAndNotifyBatchCompletion(animeId, animeTitle) {
  try {
    const allTasks = await db_helper.getAllDownloads();
    const showTasks = allTasks.filter(t => t.animeId === animeId);
    
    // Check if there are any active (QUEUED or DOWNLOADING) tasks for this anime
    const activeTasks = showTasks.filter(t => t.status === 'QUEUED' || t.status === 'DOWNLOADING');
    
    // If no active tasks remain, but there were some downloads in the batch
    if (activeTasks.length === 0) {
      // Find the tasks that completed/failed recently (e.g. in the last hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recentTasks = showTasks.filter(t => {
        const createdTime = new Date(t.createdAt).getTime();
        return createdTime > oneHourAgo;
      });

      if (recentTasks.length === 0) return;

      const completed = recentTasks.filter(t => t.status === 'COMPLETED');
      const failed = recentTasks.filter(t => t.status === 'FAILED');

      if (completed.length === 0 && failed.length === 0) return;

      let title = '';
      let message = '';
      let type = 'info';

      if (failed.length === 0) {
        title = 'Downloads Successful';
        message = `All ${completed.length} episodes of "${animeTitle}" downloaded successfully.`;
        type = 'info';
      } else if (completed.length === 0) {
        title = 'Downloads Failed';
        message = `Failed to download ${failed.length} episodes of "${animeTitle}". Check downloads panel.`;
        type = 'error';
      } else {
        title = 'Downloads Partially Completed';
        const failedEps = failed.map(t => t.episodeNumber).join(', ');
        message = `Downloaded ${completed.length}/${recentTasks.length} episodes of "${animeTitle}". Failed: Ep ${failedEps}.`;
        type = 'error';
      }

      // Emit this event so index.mjs can catch and broadcast as a notification
      downloadEvents.emit('batch-notification', {
        id: `batch-${animeId}-${Date.now()}`,
        type,
        title,
        message,
        timestamp: new Date()
      });
    }
  } catch (err) {
    console.error('Error checking batch completion:', err.message);
  }
}
