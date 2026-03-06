const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Storage strategy ────────────────────────────────────────────────────────
// On Vercel (POSTGRES_URL present) → @vercel/postgres + @vercel/blob
// Locally (no POSTGRES_URL)        → SQLite + disk uploads (unchanged dev UX)

const isVercel = !!process.env.POSTGRES_URL;

// ─── Local SQLite (dev only) ──────────────────────────────────────────────────
// sqlite3 is a native addon and cannot be loaded on Vercel's Lambda runtime.
// We guard the require() behind the isVercel flag so it is never evaluated
// during a Vercel deployment.
let db;
if (!isVercel) {
  // eslint-disable-next-line import/no-extraneous-dependencies
  const sqlite3 = require('sqlite3').verbose();
  const dataDir = path.join(__dirname, 'data');
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  db = new sqlite3.Database(path.join(dataDir, 'wedding_guests.db'));
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_url TEXT NOT NULL,
        name TEXT NOT NULL,
        bio TEXT NOT NULL,
        questionnaire_answers TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });
}

// ─── Vercel Postgres helpers ──────────────────────────────────────────────────
async function ensureTable() {
  const { sql } = require('@vercel/postgres');
  await sql`
    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      name TEXT NOT NULL,
      bio TEXT NOT NULL,
      questionnaire_answers TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function pgGetGuests() {
  const { sql } = require('@vercel/postgres');
  await ensureTable();
  const { rows } = await sql`
    SELECT id, image_url, name, bio, questionnaire_answers,
           created_at::TEXT AS created_at
    FROM guests
    ORDER BY created_at DESC
  `;
  return rows;
}

async function pgInsertGuest(image_url, name, bio, questionnaire_answers) {
  const { sql } = require('@vercel/postgres');
  await ensureTable();
  const { rows } = await sql`
    INSERT INTO guests (image_url, name, bio, questionnaire_answers)
    VALUES (${image_url}, ${name}, ${bio}, ${questionnaire_answers})
    RETURNING id, image_url, name, bio, questionnaire_answers
  `;
  return rows[0];
}

// ─── Image upload ─────────────────────────────────────────────────────────────
// Vercel Blob: store in memory, upload to blob store
// Local:       disk storage into public/uploads

const upload = multer({
  storage: isVercel ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, cb) =>
      cb(null, path.join(__dirname, 'public', 'uploads')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) { cb(null, true); return; }
    cb(new Error('Only image uploads are allowed.'));
  },
});

// ─── Express setup ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/guest', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'guest.html')));
app.get('/form', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'form.html')));

// ─── GET /api/guests ──────────────────────────────────────────────────────────
app.get('/api/guests', async (_req, res) => {
  if (isVercel) {
    try {
      const rows = await pgGetGuests();
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load guests.' });
    }
    return;
  }

  db.all(
    `SELECT id, image_url, name, bio, questionnaire_answers, created_at
     FROM guests ORDER BY datetime(created_at) DESC`,
    [],
    (err, rows) => {
      if (err) { res.status(500).json({ error: 'Failed to load guests.' }); return; }
      res.json(rows);
    }
  );
});

// ─── POST /api/guests ─────────────────────────────────────────────────────────
app.post('/api/guests', upload.single('image'), async (req, res) => {
  const { name, bio, questionnaire_answers: answers } = req.body;

  if (!req.file) {
    res.status(400).json({ error: 'Image is required.' }); return;
  }
  if (!name || !bio || !answers) {
    if (!isVercel) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: 'All fields are required.' }); return;
  }

  if (isVercel) {
    try {
      const { put } = require('@vercel/blob');
      const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const filename = `guests/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const blob = await put(filename, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
      });
      const guest = await pgInsertGuest(blob.url, name.trim(), bio.trim(), answers.trim());
      res.status(201).json(guest);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save guest.' });
    }
    return;
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  db.run(
    `INSERT INTO guests (image_url, name, bio, questionnaire_answers) VALUES (?, ?, ?, ?)`,
    [imageUrl, name.trim(), bio.trim(), answers.trim()],
    function insertCallback(err) {
      if (err) { res.status(500).json({ error: 'Failed to save guest.' }); return; }
      res.status(201).json({
        id: this.lastID, image_url: imageUrl,
        name: name.trim(), bio: bio.trim(), questionnaire_answers: answers.trim(),
      });
    }
  );
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err) {
    res.status(400).json({ error: err.message || 'Invalid request.' }); return;
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

// On Vercel, serverless functions must export the handler — do not call listen().
// Locally, start the HTTP server normally.
if (!isVercel) {
  app.listen(PORT, () => console.log(`Wedding app running on http://localhost:${PORT}`));
}

module.exports = app;
