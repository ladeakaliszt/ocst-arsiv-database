const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── VERİ KLASÖRÜ ─────────────────────────────────────────
// Railway Volume /data'ya mount edilir, yoksa local ./data kullanılır
const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOPICS_FILE   = path.join(DATA_DIR, 'topics.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TOPICS_FILE))    fs.writeFileSync(TOPICS_FILE,   JSON.stringify([]));
if (!fs.existsSync(COMMENTS_FILE))  fs.writeFileSync(COMMENTS_FILE, JSON.stringify([]));

// ─── YARDIMCI FONKSİYONLAR ────────────────────────────────
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── SABİT DEĞERLER ───────────────────────────────────────
const SITE_PASSWORD   = 'OCSTARŞİV2020';
const DELETE_PASSWORD = '080808';
const MENUS = ['kayitlar', 'kisiler', 'ek-dosyalar', 'gorseller'];

// ─── MİDDLEWARE ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'ocst-arsiv-secret-2020',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// ─── AUTH MIDDLEWARE ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
}

// ─── AUTH ──────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim())
    return res.json({ success: false, message: 'Kullanıcı adı boş olamaz.' });
  if (password !== SITE_PASSWORD)
    return res.json({ success: false, message: 'Hatalı şifre.' });
  req.session.loggedIn = true;
  req.session.username = username.trim();
  res.json({ success: true, username: username.trim() });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.loggedIn)
    return res.json({ loggedIn: true, username: req.session.username });
  res.json({ loggedIn: false });
});

// ─── KONULAR ──────────────────────────────────────────────
app.get('/api/topics/:menu', requireAuth, (req, res) => {
  const { menu } = req.params;
  if (!MENUS.includes(menu)) return res.status(400).json({ error: 'Geçersiz menü.' });
  const topics = readJSON(TOPICS_FILE)
    .filter(t => t.menu === menu)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(topics);
});

app.get('/api/topic/:id', requireAuth, (req, res) => {
  const topic = readJSON(TOPICS_FILE).find(t => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Konu bulunamadı.' });
  res.json(topic);
});

app.post('/api/topics', requireAuth, (req, res) => {
  const { menu, title, content } = req.body;
  if (!MENUS.includes(menu))        return res.status(400).json({ error: 'Geçersiz menü.' });
  if (!title   || !title.trim())    return res.status(400).json({ error: 'Konu başlığı boş olamaz.' });
  if (!content || !content.trim())  return res.status(400).json({ error: 'Konu içeriği boş olamaz.' });

  const topics = readJSON(TOPICS_FILE);
  const newTopic = {
    id: generateId(), menu,
    title:     title.trim(),
    content:   content.trim(),
    author:    req.session.username,
    createdAt: Date.now()
  };
  topics.push(newTopic);
  writeJSON(TOPICS_FILE, topics);
  res.json({ success: true, id: newTopic.id });
});

app.delete('/api/topic/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD)
    return res.status(403).json({ error: 'Silme şifresi hatalı.' });

  let topics = readJSON(TOPICS_FILE);
  if (!topics.find(t => t.id === req.params.id))
    return res.status(404).json({ error: 'Konu bulunamadı.' });

  writeJSON(TOPICS_FILE,   topics.filter(t => t.id !== req.params.id));
  writeJSON(COMMENTS_FILE, readJSON(COMMENTS_FILE).filter(c => c.topicId !== req.params.id));
  res.json({ success: true });
});

// ─── YORUMLAR ─────────────────────────────────────────────
app.get('/api/comments/:topicId', requireAuth, (req, res) => {
  const comments = readJSON(COMMENTS_FILE)
    .filter(c => c.topicId === req.params.topicId)
    .sort((a, b) => a.createdAt - b.createdAt);
  res.json(comments);
});

app.post('/api/comments', requireAuth, (req, res) => {
  const { topicId, content } = req.body;
  if (!topicId)                    return res.status(400).json({ error: 'topicId eksik.' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'Yorum boş olamaz.' });

  const comments = readJSON(COMMENTS_FILE);
  const newComment = {
    id: generateId(), topicId,
    content:   content.trim(),
    author:    req.session.username,
    createdAt: Date.now()
  };
  comments.push(newComment);
  writeJSON(COMMENTS_FILE, comments);
  res.json({ success: true, id: newComment.id });
});

app.delete('/api/comment/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD)
    return res.status(403).json({ error: 'Silme şifresi hatalı.' });

  let comments = readJSON(COMMENTS_FILE);
  if (!comments.find(c => c.id === req.params.id))
    return res.status(404).json({ error: 'Yorum bulunamadı.' });

  writeJSON(COMMENTS_FILE, comments.filter(c => c.id !== req.params.id));
  res.json({ success: true });
});

// ─── BAŞLAT ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║     OCST ADLİ ARŞİV SİSTEMİ          ║`);
  console.log(`║     Sunucu: http://localhost:${PORT}    ║`);
  console.log(`║     Veri:   ${DATA_DIR}`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
