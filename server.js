const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── VERİ KLASÖRÜ ─────────────────────────────────────
const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOPICS_FILE   = path.join(DATA_DIR, 'topics.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TOPICS_FILE))    fs.writeFileSync(TOPICS_FILE,   '[]');
if (!fs.existsSync(COMMENTS_FILE))  fs.writeFileSync(COMMENTS_FILE, '[]');

// ─── YARDIMCILAR ──────────────────────────────────────
function readJSON(f)    { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return []; } }
function writeJSON(f,d) { fs.writeFileSync(f, JSON.stringify(d,null,2),'utf8'); }
function genId()        { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ─── SABİTLER ─────────────────────────────────────────
const SITE_PASSWORD   = 'OCSTARŞİV2020';
const DELETE_PASSWORD = '080808';
const MENUS = ['kayitlar','kisiler','ek-dosyalar','gorseller'];

// ─── MİDDLEWARE ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'ocst-desktop-2020',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*8 }
}));

// ─── STATIK DOSYALAR ──────────────────────────────────
// Ana masaüstü: /
app.use('/', express.static(path.join(__dirname, 'public')));
// Arşiv (iframe içinde): /arsiv/
app.use('/arsiv', express.static(path.join(__dirname, 'arsiv-public')));
app.get('/arsiv', (req, res) => res.sendFile(path.join(__dirname, 'arsiv-public', 'index.html')));
app.get('/arsiv/', (req, res) => res.sendFile(path.join(__dirname, 'arsiv-public', 'index.html')));

// ─── AUTH ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
}

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

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/me', (req, res) => {
  if (req.session && req.session.loggedIn)
    return res.json({ loggedIn: true, username: req.session.username });
  res.json({ loggedIn: false });
});

// ─── KONULAR ──────────────────────────────────────────
app.get('/api/topics/:menu', requireAuth, (req, res) => {
  const { menu } = req.params;
  if (!MENUS.includes(menu)) return res.status(400).json({ error: 'Geçersiz menü.' });
  const comments = readJSON(COMMENTS_FILE);
  const topics = readJSON(TOPICS_FILE)
    .filter(t => t.menu === menu)
    .sort((a,b) => b.createdAt - a.createdAt)
    .map(t => ({ ...t, commentCount: comments.filter(c => c.topicId===t.id).length }));
  res.json(topics);
});

app.get('/api/topic/:id', requireAuth, (req, res) => {
  const t = readJSON(TOPICS_FILE).find(t => t.id===req.params.id);
  if (!t) return res.status(404).json({ error: 'Konu bulunamadı.' });
  res.json(t);
});

app.post('/api/topics', requireAuth, (req, res) => {
  const { menu, title, content, tag } = req.body;
  if (!MENUS.includes(menu))       return res.status(400).json({ error: 'Geçersiz menü.' });
  if (!title   || !title.trim())   return res.status(400).json({ error: 'Başlık boş olamaz.' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'İçerik boş olamaz.' });
  const topics = readJSON(TOPICS_FILE);
  const t = { id:genId(), menu, title:title.trim(), content:content.trim(), tag:tag||'', author:req.session.username, createdAt:Date.now() };
  topics.push(t);
  writeJSON(TOPICS_FILE, topics);
  res.json({ success:true, id:t.id });
});

app.delete('/api/topic/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD) return res.status(403).json({ error: 'Şifre hatalı.' });
  let topics = readJSON(TOPICS_FILE);
  if (!topics.find(t => t.id===req.params.id)) return res.status(404).json({ error: 'Konu bulunamadı.' });
  writeJSON(TOPICS_FILE,   topics.filter(t => t.id!==req.params.id));
  writeJSON(COMMENTS_FILE, readJSON(COMMENTS_FILE).filter(c => c.topicId!==req.params.id));
  res.json({ success:true });
});

// ─── YORUMLAR ─────────────────────────────────────────
app.get('/api/comments/:topicId', requireAuth, (req, res) => {
  res.json(readJSON(COMMENTS_FILE).filter(c=>c.topicId===req.params.topicId).sort((a,b)=>a.createdAt-b.createdAt));
});

app.post('/api/comments', requireAuth, (req, res) => {
  const { topicId, content } = req.body;
  if (!topicId || !content || !content.trim()) return res.status(400).json({ error: 'Eksik alan.' });
  const comments = readJSON(COMMENTS_FILE);
  const c = { id:genId(), topicId, content:content.trim(), author:req.session.username, createdAt:Date.now() };
  comments.push(c);
  writeJSON(COMMENTS_FILE, comments);
  res.json({ success:true, id:c.id });
});

app.delete('/api/comment/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD) return res.status(403).json({ error: 'Şifre hatalı.' });
  let comments = readJSON(COMMENTS_FILE);
  if (!comments.find(c=>c.id===req.params.id)) return res.status(404).json({ error: 'Yorum bulunamadı.' });
  writeJSON(COMMENTS_FILE, comments.filter(c=>c.id!==req.params.id));
  res.json({ success:true });
});

// ─── BAŞLAT ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   OCST BİLGİ SİSTEMLERİ MASAÜSTÜ    ║`);
  console.log(`║   http://localhost:${PORT}             ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
