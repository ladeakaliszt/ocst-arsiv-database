const express    = require('express');
const session    = require('express-session');
const path       = require('path');
const fs         = require('fs');
const http       = require('http');
const { WebSocketServer } = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

// ─── VERİ KLASÖRÜ ─────────────────────────────────────
const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOPICS_FILE   = path.join(DATA_DIR, 'topics.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const CALLS_FILE    = path.join(DATA_DIR, 'calls.json');

if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TOPICS_FILE))    fs.writeFileSync(TOPICS_FILE,   '[]');
if (!fs.existsSync(COMMENTS_FILE))  fs.writeFileSync(COMMENTS_FILE, '[]');
if (!fs.existsSync(CALLS_FILE))     fs.writeFileSync(CALLS_FILE,    '[]');

// ─── YARDIMCILAR ──────────────────────────────────────
function readJSON(f)    { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return []; } }
function writeJSON(f,d) { fs.writeFileSync(f, JSON.stringify(d,null,2),'utf8'); }
function genId()        { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ─── WEBSOCKET ────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on('connection', ws => {
  const calls = readJSON(CALLS_FILE).slice(-50).reverse();
  ws.send(JSON.stringify({ type: 'init_calls', calls }));
  ws.on('error', () => {});
});

// ─── SABİTLER ─────────────────────────────────────────
const SITE_PASSWORD   = 'OCSTARŞİV2020';
const DELETE_PASSWORD = '080808';
const MOBILE_KEY      = 'OCSTMLBL2020';
const MENUS = ['kayitlar','kisiler','ek-dosyalar','gorseller'];

// ─── MİDDLEWARE ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'ocst-desktop-2020',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*8 }
}));

// CORS — mobil siteden gelen istekler için
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── STATİK ───────────────────────────────────────────
app.use('/',      express.static(path.join(__dirname, 'public')));
app.use('/arsiv', express.static(path.join(__dirname, 'arsiv-public')));
app.get('/arsiv',  (_,res) => res.sendFile(path.join(__dirname,'arsiv-public','index.html')));
app.get('/arsiv/', (_,res) => res.sendFile(path.join(__dirname,'arsiv-public','index.html')));

// ─── AUTH ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.headers['x-api-key'] === MOBILE_KEY) return next();
  res.status(401).json({ error: 'Yetkisiz.' });
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim()) return res.json({ success:false, message:'Kullanıcı adı boş.' });
  if (password !== SITE_PASSWORD)   return res.json({ success:false, message:'Hatalı şifre.' });
  req.session.loggedIn = true;
  req.session.username = username.trim();
  res.json({ success:true, username: username.trim() });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success:true }); });

app.get('/api/me', (req, res) => {
  if (req.session && req.session.loggedIn)
    return res.json({ loggedIn:true, username:req.session.username });
  res.json({ loggedIn:false });
});

// ─── ÇAĞRILAR ─────────────────────────────────────────

// Tüm çağrıları getir
app.get('/api/calls', requireAuth, (req, res) => {
  const calls = readJSON(CALLS_FILE).slice(-100).reverse();
  res.json(calls);
});

// Tekil çağrı
app.get('/api/call/:id', requireAuth, (req, res) => {
  const call = readJSON(CALLS_FILE).find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error: 'Çağrı bulunamadı.' });
  res.json(call);
});

// Yeni çağrı (mobil + desktop)
app.post('/api/calls', (req, res) => {
  // Mobil API key veya oturum kontrolü
  const isMobile = req.headers['x-api-key'] === MOBILE_KEY;
  const isDesktop = req.session && req.session.loggedIn;
  if (!isMobile && !isDesktop) return res.status(401).json({ error: 'Yetkisiz.' });

  const { type, title, detail, location, lat, lng, author } = req.body;
  if (!type)   return res.status(400).json({ error: 'Tür eksik.' });
  if (!author) return res.status(400).json({ error: 'Yazar eksik.' });

  const calls = readJSON(CALLS_FILE);
  const newCall = {
    id:        genId(),
    type,                           // 'panic' | 'normal'
    title:     title   || (type === 'panic' ? '🚨 PANİK BUTONU' : 'Çağrı'),
    detail:    detail  || '',
    location:  location || 'Konum belirtilmedi',
    lat:       lat  || null,
    lng:       lng  || null,
    author:    author,
    status:    'bekliyor',          // bekliyor | yanitlandi | kapatildi
    createdAt: Date.now()
  };
  calls.push(newCall);
  writeJSON(CALLS_FILE, calls);

  // Tüm bağlı client'lara anlık bildir
  broadcast({ type: 'new_call', call: newCall });

  res.json({ success:true, id: newCall.id });
});

// Çağrı durumu güncelle
app.post('/api/call/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['bekliyor','yanitlandi','kapatildi'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Geçersiz durum.' });
  const calls = readJSON(CALLS_FILE);
  const idx = calls.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Çağrı bulunamadı.' });
  calls[idx].status = status;
  calls[idx].updatedAt = Date.now();
  writeJSON(CALLS_FILE, calls);
  broadcast({ type: 'update_call', call: calls[idx] });
  res.json({ success:true });
});

// Çağrı sil
app.delete('/api/call/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD)
    return res.status(403).json({ error: 'Şifre hatalı.' });
  let calls = readJSON(CALLS_FILE);
  if (!calls.find(c => c.id === req.params.id))
    return res.status(404).json({ error: 'Çağrı bulunamadı.' });
  calls = calls.filter(c => c.id !== req.params.id);
  writeJSON(CALLS_FILE, calls);
  broadcast({ type: 'delete_call', id: req.params.id });
  res.json({ success:true });
});

// ─── ARŞİV KONULARI ───────────────────────────────────
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
  if (!title   || !title.trim())   return res.status(400).json({ error: 'Başlık boş.' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'İçerik boş.' });
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
  writeJSON(TOPICS_FILE, topics.filter(t => t.id!==req.params.id));
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
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   OCST BİLGİ SİSTEMLERİ v4.0         ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
