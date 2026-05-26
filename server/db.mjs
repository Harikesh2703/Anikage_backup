import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.USER_DATA_PATH
  ? join(process.env.USER_DATA_PATH, 'anikage.db')
  : (process.env.NODE_ENV === 'production'
      ? (process.platform === 'win32' 
          ? join(process.env.APPDATA || os.homedir(), 'Anikage', 'anikage.db')
          : join(os.homedir(), '.anikage.db'))
      : join(__dirname, '../anikage.db'));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('\x1b[34m✓\x1b[0m SQLite database connected');
});

// Initialize tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS watch_history (
      anime_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cover_image TEXT,
      last_episode TEXT,
      genres TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata_cache (
      url TEXT PRIMARY KEY,
      resolution TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS link_cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      anime_id TEXT NOT NULL,
      anime_title TEXT NOT NULL,
      cover_image TEXT,
      episode_number TEXT NOT NULL,
      quality TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      downloaded_segments INTEGER DEFAULT 0,
      total_segments INTEGER DEFAULT 0,
      local_path TEXT,
      temp_dir TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      stream_url TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`ALTER TABLE downloads ADD COLUMN stream_url TEXT`, (err) => {
    // Ignore error if column already exists
  });
});

export const db_helper = {
  // Link caching
  getLinksFromCache: (key) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT payload FROM link_cache WHERE key = ?`;
      db.get(sql, [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? JSON.parse(row.payload) : null);
      });
    });
  },

  saveLinksToCache: (key, data) => {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(data);
      const size = Buffer.byteLength(payload, 'utf8');
      const MAX_CACHE_SIZE = 10 * 1024 * 1024; // 10MB

      db.serialize(() => {
        const insertSql = `
          INSERT INTO link_cache (key, payload, size, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            payload = excluded.payload,
            size = excluded.size,
            created_at = CURRENT_TIMESTAMP
        `;
        
        db.run(insertSql, [key, payload, size], (err) => {
          if (err) return reject(err);
          
          db.get(`SELECT SUM(size) as total_size FROM link_cache`, [], (err, row) => {
            if (err) return reject(err);
            
            let totalSize = row.total_size || 0;
            if (totalSize > MAX_CACHE_SIZE) {
              db.all(`SELECT key, size FROM link_cache ORDER BY created_at ASC`, [], (err, rows) => {
                if (err) return reject(err);
                
                const keysToDelete = [];
                for (const r of rows) {
                  if (totalSize <= MAX_CACHE_SIZE) break;
                  if (r.key === key && rows.length > 1) continue;
                  keysToDelete.push(r.key);
                  totalSize -= r.size;
                }
                
                if (keysToDelete.length > 0) {
                  const placeholders = keysToDelete.map(() => '?').join(',');
                  db.run(`DELETE FROM link_cache WHERE key IN (${placeholders})`, keysToDelete, (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                } else {
                  resolve();
                }
              });
            } else {
              resolve();
            }
          });
        });
      });
    });
  },

  deleteLinkCacheEntry: (key) => {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM link_cache WHERE key = ?`;
      db.run(sql, [key], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  // Metadata caching
  saveMetadata: (url, resolution) => {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO metadata_cache (url, resolution, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET resolution = excluded.resolution, updated_at = CURRENT_TIMESTAMP`;
      db.run(sql, [url, resolution], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  getMetadata: (url) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT resolution FROM metadata_cache WHERE url = ?`;
      db.get(sql, [url], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.resolution : null);
      });
    });
  },
  // Add or update history
  saveProgress: (animeId, title, coverImage, episode, genres) => {
    return new Promise((resolve, reject) => {
      const genresStr = Array.isArray(genres) ? genres.join(',') : genres;
      const sql = `
        INSERT INTO watch_history (anime_id, title, cover_image, last_episode, genres, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(anime_id) DO UPDATE SET
          last_episode = excluded.last_episode,
          updated_at = CURRENT_TIMESTAMP
      `;
      db.run(sql, [animeId, title, coverImage, episode, genresStr], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },

  // Get recent history
  getRecentHistory: (limit = 10) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM watch_history ORDER BY updated_at DESC LIMIT ?`;
      db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.anime_id,
          title: row.title,
          coverImage: row.cover_image,
          lastEpisode: row.last_episode,
          tags: row.genres ? row.genres.split(',') : [],
          updatedAt: row.updated_at
        })));
      });
    });
  },

  // Get all history for analytics
  getAllHistory: () => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM watch_history`;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.anime_id,
          title: row.title,
          tags: row.genres ? row.genres.split(',') : [],
        })));
      });
    });
  },

  // Downloads Management
  saveDownloadTask: (task) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO downloads (id, anime_id, anime_title, cover_image, episode_number, quality, status, progress, downloaded_segments, total_segments, local_path, temp_dir, error_message, created_at, completed_at, stream_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          progress = excluded.progress,
          downloaded_segments = excluded.downloaded_segments,
          total_segments = excluded.total_segments,
          local_path = excluded.local_path,
          temp_dir = excluded.temp_dir,
          error_message = excluded.error_message,
          completed_at = excluded.completed_at,
          stream_url = excluded.stream_url
      `;
      db.run(sql, [
        task.id, task.animeId, task.animeTitle, task.coverImage, task.episodeNumber, task.quality,
        task.status, task.progress || 0, task.downloadedSegments || 0, task.totalSegments || 0,
        task.localPath || null, task.tempDir || null, task.errorMessage || null, task.completedAt || null,
        task.streamUrl || null
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },

  getDownloadTask: (id) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM downloads WHERE id = ?`;
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row ? {
          id: row.id,
          animeId: row.anime_id,
          animeTitle: row.anime_title,
          coverImage: row.cover_image,
          episodeNumber: row.episode_number,
          quality: row.quality,
          status: row.status,
          progress: row.progress,
          downloadedSegments: row.downloaded_segments,
          totalSegments: row.total_segments,
          localPath: row.local_path,
          tempDir: row.temp_dir,
          errorMessage: row.error_message,
          createdAt: row.created_at,
          completedAt: row.completed_at,
          streamUrl: row.stream_url
        } : null);
      });
    });
  },

  getAllDownloads: () => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM downloads ORDER BY created_at DESC`;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.id,
          animeId: row.anime_id,
          animeTitle: row.anime_title,
          coverImage: row.cover_image,
          episodeNumber: row.episode_number,
          quality: row.quality,
          status: row.status,
          progress: row.progress,
          downloadedSegments: row.downloaded_segments,
          totalSegments: row.total_segments,
          localPath: row.local_path,
          tempDir: row.temp_dir,
          errorMessage: row.error_message,
          createdAt: row.created_at,
          completedAt: row.completed_at,
          streamUrl: row.stream_url
        })));
      });
    });
  },

  updateDownloadProgress: (id, progress, downloadedSegments, totalSegments) => {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE downloads 
        SET progress = ?, downloaded_segments = ?, total_segments = ?
        WHERE id = ?
      `;
      db.run(sql, [progress, downloadedSegments, totalSegments, id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  updateDownloadStatus: (id, status, errorMsg = null, localPath = null) => {
    return new Promise((resolve, reject) => {
      const completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;
      const sql = `
        UPDATE downloads 
        SET status = ?, error_message = ?, local_path = COALESCE(?, local_path), completed_at = COALESCE(?, completed_at)
        WHERE id = ?
      `;
      db.run(sql, [status, errorMsg, localPath, completedAt, id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  deleteDownloadTask: (id) => {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM downloads WHERE id = ?`;
      db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  // App Settings Management
  getSetting: (key, defaultValue = null) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT value FROM app_settings WHERE key = ?`;
      db.get(sql, [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : defaultValue);
      });
    });
  },

  saveSetting: (key, value) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `;
      db.run(sql, [key, value], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};
