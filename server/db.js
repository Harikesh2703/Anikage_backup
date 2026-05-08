const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbPromise;

async function setupDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  }).then(async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE,
        username TEXT UNIQUE,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return db;
  });

  return dbPromise;
}

module.exports = { setupDatabase };
