const express    = require('express');
const session    = require('express-session');
const path       = require('path');
const fs         = require('fs');
const http       = require('http');
const https      = require('https');
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
const BANNED_FILE   = path.join(DATA_DIR, 'banned.json');

if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TOPICS_FILE))    fs.writeFileSync(TOPICS_FILE,   '[]');
if (!fs.existsSync(COMMENTS_FILE))  fs.writeFileSync(COMMENTS_FILE, '[]');
if (!fs.existsSync(CALLS_FILE))     fs.writeFileSync(CALLS_FILE,    '[]');
if (!fs.existsSync(BANNED_FILE))    fs.writeFileSync(BANNED_FILE,   '[]');

// ─── YARDIMCILAR ──────────────────────────────────────
function readJSON(f)    { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return []; } }
function writeJSON(f,d) { fs.writeFileSync(f, JSON.stringify(d,null,2),'utf8'); }
function genId()        { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ─── AKTİF PERSONEL (PC — bellek içi) ────────────────
const activePersonnel = new Map();
// { username -> { username, loginAt, lastSeen, sessionId } }

// ─── MOBİL CİHAZLAR (bellek içi) ─────────────────────
// { deviceId -> { deviceId, username, lastSeen, lat, lng, locationActive, ws } }
const mobileDevices = new Map();

// ─── WS İSTEMCİ TİPİ ─────────────────────────────────
// ws.clientType = 'pc' | 'mobile'
// ws.deviceId   = (mobile ise)

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function broadcastPC(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1 && c.clientType === 'pc') c.send(msg); });
}

function sendToDevice(deviceId, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === 1 && c.clientType === 'mobile' && c.deviceId === deviceId) {
      c.send(msg);
    }
  });
}

function broadcastPersonnel() {
  broadcastPC({ type: 'personnel_update', personnel: Array.from(activePersonnel.values()) });
}

function broadcastMobileDevices() {
  // Sadece şu an WS bağlı olan cihazları gönder
  const connected = [];
  for (const [did, dev] of mobileDevices.entries()) {
    const isConnected = Array.from(wss.clients).some(
      c => c.readyState === 1 && c.clientType === 'mobile' && c.deviceId === did
    );
    if (isConnected) {
      connected.push({ ...dev, ws: undefined }); // ws referansını gönderme
    }
  }
  broadcastPC({ type: 'mobile_devices_update', devices: connected });
}

// ─── WEBSOCKET ────────────────────────────────────────
wss.on('connection', (ws, req) => {
  ws.clientType = 'unknown';

  // İlk mesajla tip belirlenir
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'identify_pc') {
        ws.clientType = 'pc';
        // PC'ye başlangıç verilerini gönder
        const calls = readJSON(CALLS_FILE).slice(-50).reverse();
        ws.send(JSON.stringify({ type: 'init_calls', calls }));
        ws.send(JSON.stringify({ type: 'personnel_update', personnel: Array.from(activePersonnel.values()) }));
        const connectedDevices = [];
        for (const [did, dev] of mobileDevices.entries()) {
          const isConn = Array.from(wss.clients).some(c => c.readyState===1 && c.clientType==='mobile' && c.deviceId===did);
          if (isConn) connectedDevices.push({ ...dev, ws: undefined });
        }
        ws.send(JSON.stringify({ type: 'mobile_devices_update', devices: connectedDevices }));

      } else if (msg.type === 'identify_mobile') {
        ws.clientType = 'mobile';
        ws.deviceId   = msg.deviceId;
        // Cihazı güncelle
        const existing = mobileDevices.get(msg.deviceId) || {};
        mobileDevices.set(msg.deviceId, {
          ...existing,
          deviceId: msg.deviceId,
          username: msg.username || existing.username || msg.deviceId,
          lastSeen: Date.now(),
        });
        broadcastMobileDevices();

      } else if (msg.type === 'sms_sent_confirm') {
        // Mobil SMS gönderildiğini onayladı
        broadcastPC({ type: 'sms_confirmed', deviceId: ws.deviceId, callId: msg.callId });
      }
    } catch {}
  });

  ws.on('close', () => {
    if (ws.clientType === 'mobile' && ws.deviceId) {
      broadcastMobileDevices();
    }
  });

  ws.on('error', () => {});
});

// ─── SABİTLER ─────────────────────────────────────────
const SITE_PASSWORD   = 'OCSTARŞİV2020';
const DELETE_PASSWORD = '080808';
const MOBILE_KEY      = 'OCSTMLBL2020';
const MENUS = ['kayitlar','kisiler','ek-dosyalar','gorseller'];

// ─── MİDDLEWARE ───────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'ocst-desktop-2020',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*8 }
}));

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
  req.session.loggedIn   = true;
  req.session.username   = username.trim();
  req.session.sessionId  = genId();
  activePersonnel.set(username.trim(), {
    username: username.trim(),
    loginAt:  Date.now(),
    lastSeen: Date.now(),
    sessionId: req.session.sessionId
  });
  broadcastPersonnel();
  res.json({ success:true, username: username.trim() });
});

app.post('/api/logout', (req, res) => {
  if (req.session && req.session.username) {
    activePersonnel.delete(req.session.username);
    broadcastPersonnel();
  }
  req.session.destroy();
  res.json({ success:true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.loggedIn) {
    const p = activePersonnel.get(req.session.username);
    if (p) { p.lastSeen = Date.now(); activePersonnel.set(req.session.username, p); }
    return res.json({ loggedIn:true, username:req.session.username });
  }
  res.json({ loggedIn:false });
});

app.post('/api/heartbeat', (req, res) => {
  if (req.session && req.session.loggedIn) {
    const p = activePersonnel.get(req.session.username);
    if (p) { p.lastSeen = Date.now(); activePersonnel.set(req.session.username, p); }
  }
  res.json({ ok:true });
});

// ─── PERSONEL ─────────────────────────────────────────
app.get('/api/personnel', requireAuth, (req, res) => {
  res.json(Array.from(activePersonnel.values()));
});

// ─── MOBİL CİHAZLAR ──────────────────────────────────

// Cihaz kaydı
app.post('/api/mobile/register', (req, res) => {
  if (req.headers['x-api-key'] !== MOBILE_KEY) return res.status(401).json({ error:'Yetkisiz.' });
  const { deviceId, username } = req.body;
  if (!deviceId) return res.status(400).json({ error:'deviceId eksik.' });

  const banned = readJSON(BANNED_FILE);
  if (banned.find(b => b.deviceId === deviceId)) {
    return res.json({ success:false, banned:true });
  }

  const existing = mobileDevices.get(deviceId) || {};
  mobileDevices.set(deviceId, {
    ...existing,
    deviceId,
    username: username || existing.username || deviceId,
    lastSeen: Date.now(),
    registeredAt: existing.registeredAt || Date.now()
  });

  broadcastMobileDevices();
  res.json({ success:true, banned:false });
});

// Konum güncelleme
app.post('/api/mobile/location', (req, res) => {
  if (req.headers['x-api-key'] !== MOBILE_KEY) return res.status(401).json({ error:'Yetkisiz.' });
  const { deviceId, lat, lng, active } = req.body;
  if (!deviceId) return res.status(400).json({ error:'deviceId eksik.' });

  const dev = mobileDevices.get(deviceId);
  if (!dev) return res.status(404).json({ error:'Cihaz bulunamadı.' });

  dev.lat            = lat;
  dev.lng            = lng;
  dev.locationActive = !!active;
  dev.lastSeen       = Date.now();
  mobileDevices.set(deviceId, dev);

  broadcastMobileDevices();
  res.json({ success:true });
});

// Bağlı mobil cihazlar
app.get('/api/mobile/devices', requireAuth, (req, res) => {
  const connected = [];
  for (const [did, dev] of mobileDevices.entries()) {
    const isConn = Array.from(wss.clients).some(c => c.readyState===1 && c.clientType==='mobile' && c.deviceId===did);
    if (isConn) connected.push({ ...dev, ws:undefined });
  }
  res.json(connected);
});

// Engelleme
app.post('/api/mobile/ban', requireAuth, (req, res) => {
  const { deviceId, username, reason } = req.body;
  if (!deviceId) return res.status(400).json({ error:'deviceId eksik.' });
  const banned = readJSON(BANNED_FILE);
  if (!banned.find(b => b.deviceId === deviceId)) {
    banned.push({ deviceId, username, reason: reason||'', bannedAt: Date.now() });
    writeJSON(BANNED_FILE, banned);
  }
  // Bağlıysa bildir ve bağlantısını kes
  wss.clients.forEach(c => {
    if (c.readyState===1 && c.clientType==='mobile' && c.deviceId===deviceId) {
      c.send(JSON.stringify({ type:'banned' }));
      setTimeout(() => c.terminate(), 500);
    }
  });
  mobileDevices.delete(deviceId);
  broadcastMobileDevices();
  res.json({ success:true });
});

// Engel kaldır
app.post('/api/mobile/unban', requireAuth, (req, res) => {
  const { deviceId } = req.body;
  let banned = readJSON(BANNED_FILE);
  banned = banned.filter(b => b.deviceId !== deviceId);
  writeJSON(BANNED_FILE, banned);
  res.json({ success:true });
});

// Engelliler listesi
app.get('/api/mobile/banned', requireAuth, (req, res) => {
  res.json(readJSON(BANNED_FILE));
});

// ─── GEMİNİ PROXY ────────────────────────────────────
app.post('/api/gemini', requireAuth, (req, res) => {
  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY tanımlı değil.' });

  const { contents, system_instruction, generationConfig } = req.body;
  const payload = JSON.stringify({
    system_instruction,
    contents,
    generationConfig: generationConfig || { temperature:0.1, maxOutputTokens:400 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path:     `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    method:   'POST',
    headers:  { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const proxyReq = https.request(options, proxyRes => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      try { res.json(JSON.parse(data)); }
      catch { res.status(500).json({ error:'Gemini parse hatası.' }); }
    });
  });
  proxyReq.on('error', err => res.status(500).json({ error: err.message }));
  proxyReq.write(payload);
  proxyReq.end();
});

// ─── PC → MOBİL ÇAĞRI GÖNDER ─────────────────────────
app.post('/api/dispatch', requireAuth, (req, res) => {
  const { deviceId, callId, smsBody, smsNumber, title } = req.body;
  if (!deviceId) return res.status(400).json({ error:'deviceId eksik.' });

  // Mobil cihaza WS üzerinden SMS komutu gönder
  sendToDevice(deviceId, {
    type:      'sms_dispatch',
    callId,
    smsBody,
    smsNumber,
    title,
    sentAt:    Date.now()
  });

  broadcastPC({ type:'dispatch_sent', deviceId, callId });
  res.json({ success:true });
});

// ─── ÇAĞRILAR ─────────────────────────────────────────
app.get('/api/calls', requireAuth, (req, res) => {
  res.json(readJSON(CALLS_FILE).slice(-100).reverse());
});

app.get('/api/call/:id', requireAuth, (req, res) => {
  const call = readJSON(CALLS_FILE).find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error:'Çağrı bulunamadı.' });
  res.json(call);
});

app.post('/api/calls', (req, res) => {
  const isMobile  = req.headers['x-api-key'] === MOBILE_KEY;
  const isDesktop = req.session && req.session.loggedIn;
  if (!isMobile && !isDesktop) return res.status(401).json({ error:'Yetkisiz.' });

  const { type, title, detail, location, lat, lng, author } = req.body;
  if (!type)   return res.status(400).json({ error:'Tür eksik.' });
  if (!author) return res.status(400).json({ error:'Yazar eksik.' });

  const calls   = readJSON(CALLS_FILE);
  const newCall = {
    id:         genId(),
    type,
    title:      title   || (type==='panic' ? '🚨 PANİK BUTONU' : 'Çağrı'),
    detail:     detail  || '',
    location:   location || 'Konum belirtilmedi',
    lat:        lat  || null,
    lng:        lng  || null,
    author,
    assignedTo: null,
    status:     'bekliyor',
    notes:      [],
    createdAt:  Date.now()
  };
  calls.push(newCall);
  writeJSON(CALLS_FILE, calls);
  broadcast({ type:'new_call', call:newCall });
  res.json({ success:true, id:newCall.id });
});

app.post('/api/call/:id/status', requireAuth, (req, res) => {
  const { status, note } = req.body;
  const valid = ['bekliyor','yanitlandi','kapatildi'];
  if (!valid.includes(status)) return res.status(400).json({ error:'Geçersiz durum.' });
  const calls = readJSON(CALLS_FILE);
  const idx   = calls.findIndex(c => c.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Çağrı bulunamadı.' });
  calls[idx].status    = status;
  calls[idx].updatedAt = Date.now();
  if (note && note.trim()) {
    if (!calls[idx].notes) calls[idx].notes = [];
    calls[idx].notes.push({ text:note.trim(), by:req.session.username||'Sistem', at:Date.now() });
  }
  writeJSON(CALLS_FILE, calls);
  broadcast({ type:'update_call', call:calls[idx] });
  res.json({ success:true });
});

app.post('/api/call/:id/assign', requireAuth, (req, res) => {
  const { assignTo } = req.body;
  const calls = readJSON(CALLS_FILE);
  const idx   = calls.findIndex(c => c.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Çağrı bulunamadı.' });
  calls[idx].assignedTo = assignTo || null;
  calls[idx].updatedAt  = Date.now();
  if (!calls[idx].notes) calls[idx].notes = [];
  calls[idx].notes.push({ text: assignTo ? `${assignTo} çağrıya atandı.` : 'Atama kaldırıldı.', by: req.session.username||'Sistem', at: Date.now() });
  writeJSON(CALLS_FILE, calls);
  broadcast({ type:'update_call', call:calls[idx] });
  res.json({ success:true });
});

app.delete('/api/call/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD) return res.status(403).json({ error:'Şifre hatalı.' });
  let calls = readJSON(CALLS_FILE);
  if (!calls.find(c => c.id===req.params.id)) return res.status(404).json({ error:'Çağrı bulunamadı.' });
  calls = calls.filter(c => c.id!==req.params.id);
  writeJSON(CALLS_FILE, calls);
  broadcast({ type:'delete_call', id:req.params.id });
  res.json({ success:true });
});

// ─── ARŞİV KONULARI ───────────────────────────────────
app.get('/api/topics/:menu', requireAuth, (req, res) => {
  const { menu } = req.params;
  if (!MENUS.includes(menu)) return res.status(400).json({ error:'Geçersiz menü.' });
  const comments = readJSON(COMMENTS_FILE);
  const topics   = readJSON(TOPICS_FILE)
    .filter(t => t.menu===menu)
    .sort((a,b) => b.createdAt-a.createdAt)
    .map(t => ({ ...t, commentCount: comments.filter(c=>c.topicId===t.id).length }));
  res.json(topics);
});

app.get('/api/topic/:id', requireAuth, (req, res) => {
  const t = readJSON(TOPICS_FILE).find(t=>t.id===req.params.id);
  if (!t) return res.status(404).json({ error:'Konu bulunamadı.' });
  res.json(t);
});

app.post('/api/topics', requireAuth, (req, res) => {
  const { menu, title, content, tag } = req.body;
  if (!MENUS.includes(menu))       return res.status(400).json({ error:'Geçersiz menü.' });
  if (!title   || !title.trim())   return res.status(400).json({ error:'Başlık boş.' });
  if (!content || !content.trim()) return res.status(400).json({ error:'İçerik boş.' });
  const topics = readJSON(TOPICS_FILE);
  const t = { id:genId(), menu, title:title.trim(), content:content.trim(), tag:tag||'', author:req.session.username, createdAt:Date.now() };
  topics.push(t);
  writeJSON(TOPICS_FILE, topics);
  res.json({ success:true, id:t.id });
});

app.delete('/api/topic/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD) return res.status(403).json({ error:'Şifre hatalı.' });
  let topics = readJSON(TOPICS_FILE);
  if (!topics.find(t=>t.id===req.params.id)) return res.status(404).json({ error:'Konu bulunamadı.' });
  writeJSON(TOPICS_FILE, topics.filter(t=>t.id!==req.params.id));
  writeJSON(COMMENTS_FILE, readJSON(COMMENTS_FILE).filter(c=>c.topicId!==req.params.id));
  res.json({ success:true });
});

// ─── YORUMLAR ─────────────────────────────────────────
app.get('/api/comments/:topicId', requireAuth, (req, res) => {
  res.json(readJSON(COMMENTS_FILE).filter(c=>c.topicId===req.params.topicId).sort((a,b)=>a.createdAt-b.createdAt));
});

app.post('/api/comments', requireAuth, (req, res) => {
  const { topicId, content } = req.body;
  if (!topicId||!content||!content.trim()) return res.status(400).json({ error:'Eksik alan.' });
  const comments = readJSON(COMMENTS_FILE);
  const c = { id:genId(), topicId, content:content.trim(), author:req.session.username, createdAt:Date.now() };
  comments.push(c);
  writeJSON(COMMENTS_FILE, comments);
  res.json({ success:true, id:c.id });
});

app.delete('/api/comment/:id', requireAuth, (req, res) => {
  if (req.body.deletePassword !== DELETE_PASSWORD) return res.status(403).json({ error:'Şifre hatalı.' });
  let comments = readJSON(COMMENTS_FILE);
  if (!comments.find(c=>c.id===req.params.id)) return res.status(404).json({ error:'Yorum bulunamadı.' });
  writeJSON(COMMENTS_FILE, comments.filter(c=>c.id!==req.params.id));
  res.json({ success:true });
});

// ─── BAŞLAT ───────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   OCST BİLGİ SİSTEMLERİ v4.2         ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  if (!process.env.GEMINI_API_KEY) console.warn('⚠  GEMINI_API_KEY env var tanımlı değil!');
});
