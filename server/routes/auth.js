const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { setupDatabase } = require('../db');

const router = express.Router();

// SECURITY: Generate a random JWT secret on first run and persist it (VULN-06)
function getOrCreateJWTSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'fallback-secret-key-do-not-use-in-prod') {
    return process.env.JWT_SECRET;
  }
  const secretPath = path.join(
    process.env.USER_DATA_PATH || require('os').homedir(),
    '.anikage-jwt-secret'
  );
  try {
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (e) {}
  const newSecret = crypto.randomBytes(64).toString('hex');
  try {
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
  } catch (e) {
    console.error('[Auth] Warning: Could not persist JWT secret:', e.message);
  }
  return newSecret;
}

const JWT_SECRET = getOrCreateJWTSecret();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy-client-id';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const db = await setupDatabase();
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    const token = jwt.sign({ id: result.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastID, username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await setupDatabase();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential, accessToken } = req.body;
    let payload;

    if (accessToken) {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error("Failed to fetch user info from Google");
      payload = await response.json();
    } else if (credential) {
      // SECURITY: Always verify the token cryptographically — never fall back
      // to jwt.decode() which performs NO signature verification (VULN-07)
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(401).json({ error: 'Invalid Google token payload' });
      }
    } else {
      return res.status(400).json({ error: 'No credential or access token provided' });
    }

    const { sub: google_id, email, name } = payload;
    // Generate a username from email if name is missing
    const generatedUsername = (name || email.split('@')[0]).replace(/\\s+/g, '_').toLowerCase();

    const db = await setupDatabase();
    let user = await db.get('SELECT * FROM users WHERE google_id = ?', [google_id]);
    
    if (!user) {
      // Check if username exists
      let finalUsername = generatedUsername;
      let existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [finalUsername]);
      let counter = 1;
      while (existingUsername) {
         finalUsername = `${generatedUsername}${counter}`;
         existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [finalUsername]);
         counter++;
      }
      
      const result = await db.run(
        'INSERT INTO users (google_id, username) VALUES (?, ?)',
        [google_id, finalUsername]
      );
      user = { id: result.lastID, username: finalUsername, google_id };
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Google authentication failed: ' + err.message });
  }
});

module.exports = router;
