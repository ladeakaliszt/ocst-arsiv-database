/* ═══════════════════════════════════════════════════════
   OCST ADLİ ARŞİV — app.js v3.1
   ═══════════════════════════════════════════════════════ */

let currentMenu    = 'kayitlar';
let currentTopicId = null;
let deleteTarget   = null;
let pollInterval   = null;
let listRefresh    = null;
let allTopics      = [];
let appReady       = false;  // Başlatma tamamlandı mı?

const MENU_LABELS = {
  'kayitlar':    'KAYITLAR',
  'kisiler':     'KİŞİLER',
  'ek-dosyalar': 'EK DOSYALAR',
  'gorseller':   'GÖRSELLER'
};

// ─── SAAT ────────────────────────────────────────────────
function updateClock() {
  const now = new Date(), pad = n => String(n).padStart(2,'0');
  const el = document.getElementById('current-time');
  if (el) el.textContent =
    `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ─── GİRİŞ ───────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username) { errEl.textContent = '► KULLANICI ADI BOŞ BIRAKILAMAZ'; return; }
  if (!password) { errEl.textContent = '► ŞİFRE BOŞ BIRAKILAMAZ'; return; }
  try {
    const data = await post('/api/login', { username, password });
    if (data.success) startApp(data.username);
    else errEl.textContent = '► ' + data.message.toUpperCase();
  } catch { errEl.textContent = '► SUNUCU BAĞLANTI HATASI'; }
}

function startApp(username) {
  if (appReady) return;   // Çift çağrıyı engelle
  appReady = true;

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-system').style.display  = 'flex';
  document.getElementById('topbar-user').textContent    = `KULLANICI: ${username}`;
  setInterval(updateClock, 1000);
  updateClock();
  switchMenu('kayitlar', document.querySelector('.menu-item[data-menu="kayitlar"]'));
  startListRefresh();
}

// Sayfa yüklenince — postMessage veya session kontrolü ile giriş
document.addEventListener('DOMContentLoaded', () => {
  // Enter ile giriş
  ['login-username','login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  });

  // postMessage dinleyici — masaüstü iframe'e kullanıcı adını gönderir
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'OCST_LOGIN' && e.data.username && !appReady) {
      startApp(e.data.username);
    }
  });

  // Yedek: session kontrolü (doğrudan /arsiv/ adresine girilirse çalışır)
  fetch('/api/me')
    .then(r => r.json())
    .then(d => { if (d.loggedIn) startApp(d.username); })
    .catch(() => {});
});

async function doLogout() {
  await fetch('/api/logout', { method:'POST' });
  // Iframe içindeyse sadece bu sayfayı sıfırla
  appReady = false;
  document.getElementById('main-system').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  stopPolling();
  stopListRefresh();
}

// ─── MENÜ ────────────────────────────────────────────────
function switchMenu(menu, btn) {
  currentMenu = menu; currentTopicId = null; stopPolling();
  document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('list-title').textContent = MENU_LABELS[menu];
  document.getElementById('search-input').value = '';
  showList(); loadTopics();
}

// ─── GÖRÜNÜMLER ──────────────────────────────────────────
function showList() {
  document.getElementById('view-list').style.display      = 'block';
  document.getElementById('view-new-topic').style.display = 'none';
  document.getElementById('view-topic').style.display     = 'none';
  stopPolling();
}

function showNewTopicForm() {
  document.getElementById('view-list').style.display      = 'none';
  document.getElementById('view-new-topic').style.display = 'block';
  document.getElementById('view-topic').style.display     = 'none';
  document.getElementById('new-title').value   = '';
  document.getElementById('new-content').value = '';
  document.getElementById('new-tag').value     = '';
  document.getElementById('form-error').textContent = '';
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('tag-selected'));
  document.querySelector('.tag-btn[data-tag=""]').classList.add('tag-selected');
  stopListRefresh();
}

function showTopicDetail(topicId) {
  currentTopicId = topicId;
  document.getElementById('view-list').style.display      = 'none';
  document.getElementById('view-new-topic').style.display = 'none';
  document.getElementById('view-topic').style.display     = 'block';
  document.getElementById('detail-menu-label').textContent = MENU_LABELS[currentMenu];
  loadTopicDetail(topicId);
  startPolling(topicId);
  stopListRefresh();
}

// ─── ETİKET SEÇİCİ ───────────────────────────────────────
function selectTag(btn) {
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('tag-selected'));
  btn.classList.add('tag-selected');
  document.getElementById('new-tag').value = btn.dataset.tag;
}

// ─── KONULAR ─────────────────────────────────────────────
async function loadTopics() {
  const listEl = document.getElementById('topic-list');
  listEl.innerHTML = '<div class="loading-text">► VERİ YÜKLENİYOR...</div>';
  try {
    const res = await fetch(`/api/topics/${currentMenu}`);
    if (res.status === 401) {
      // Session düştü, login'e dön — location.reload() KULLANMA (iframe döngüsü yapar)
      doLogout();
      return;
    }
    allTopics = await res.json();
    renderTopics(allTopics);
  } catch {
    listEl.innerHTML = '<div class="empty-text">► BAĞLANTI HATASI.</div>';
  }
}

function renderTopics(topics) {
  const listEl = document.getElementById('topic-list');
  document.getElementById('record-count').textContent = `KAYIT SAYISI: ${topics.length}`;
  if (!topics.length) {
    listEl.innerHTML = '<div class="empty-text">► KAYIT BULUNAMADI.</div>';
    return;
  }
  listEl.innerHTML = topics.map((t, i) => `
    <div class="topic-row" onclick="showTopicDetail('${t.id}')">
      <span class="col-num">${String(i+1).padStart(3,'0')}</span>
      <span class="col-title">
        ${t.tag ? `<span class="tag-badge tag-${t.tag}">${t.tag}</span>` : ''}
        ${escHtml(t.title)}
      </span>
      <span class="col-author">${escHtml(t.author||'UNKNOWN')}</span>
      <span class="col-comments">${t.commentCount || 0}</span>
      <span class="col-date">${formatDate(t.createdAt)}</span>
    </div>
  `).join('');
}

// ─── ARAMA ───────────────────────────────────────────────
function filterTopics() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if (!q) { renderTopics(allTopics); return; }
  renderTopics(allTopics.filter(t => t.title.toLowerCase().includes(q)));
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  renderTopics(allTopics);
}

// ─── KONU DETAY ──────────────────────────────────────────
async function loadTopicDetail(topicId) {
  const detailEl = document.getElementById('topic-detail-content');
  detailEl.innerHTML = '<div class="loading-text">► KAYIT YÜKLENİYOR...</div>';
  try {
    const res = await fetch(`/api/topic/${topicId}`);
    if (res.status === 404) { showList(); return; }
    const topic = await res.json();
    detailEl.innerHTML = `
      <div class="topic-detail-header">
        <div class="topic-detail-title">
          ${topic.tag ? `<span class="tag-badge tag-${topic.tag}">${topic.tag}</span>` : ''}
          ${escHtml(topic.title)}
        </div>
        <div class="topic-detail-meta">
          <span>YAZAN: <span>${escHtml(topic.author||'UNKNOWN')}</span></span>
          <span>TARİH: <span>${formatDate(topic.createdAt)}</span></span>
          <span>KATEGORİ: <span>${MENU_LABELS[topic.menu]||topic.menu}</span></span>
        </div>
        <div class="topic-detail-body">${parseBBCode(topic.content)}</div>
      </div>
    `;
    loadComments(topicId);
  } catch {
    detailEl.innerHTML = '<div class="empty-text">► KAYIT YÜKLENEMEDİ.</div>';
  }
}

async function loadComments(topicId) {
  const listEl = document.getElementById('comments-list');
  try {
    const comments = await (await fetch(`/api/comments/${topicId}`)).json();
    if (!comments.length) {
      listEl.innerHTML = '<div class="empty-text" style="font-size:11px">► HENÜZ YORUM YAPILMAMIS.</div>';
      return;
    }
    listEl.innerHTML = comments.map(c => `
      <div class="comment-item" id="comment-${c.id}">
        <div class="comment-meta">
          <span class="author">${escHtml(c.author||'UNKNOWN')}</span>
          <span>${formatDate(c.createdAt)}</span>
          <button class="comment-delete-btn" onclick="deleteComment('${c.id}')">[SİL]</button>
        </div>
        <div class="comment-body">${parseBBCode(c.content)}</div>
      </div>
    `).join('');
  } catch {}
}

async function submitTopic() {
  const title   = document.getElementById('new-title').value.trim();
  const content = document.getElementById('new-content').value.trim();
  const tag     = document.getElementById('new-tag').value;
  const errEl   = document.getElementById('form-error');
  errEl.textContent = '';
  if (!title)   { errEl.textContent = '► KONU BAŞLIĞI ZORUNLUDUR'; return; }
  if (!content) { errEl.textContent = '► KONU İÇERİĞİ ZORUNLUDUR'; return; }
  try {
    const data = await post('/api/topics', { menu: currentMenu, title, content, tag });
    if (data.success) { showList(); loadTopics(); startListRefresh(); }
    else errEl.textContent = '► ' + (data.error||'HATA').toUpperCase();
  } catch { errEl.textContent = '► SUNUCU HATASI'; }
}

async function submitComment() {
  const content = document.getElementById('comment-content').value.trim();
  if (!content) return;
  try {
    const data = await post('/api/comments', { topicId: currentTopicId, content });
    if (data.success) {
      document.getElementById('comment-content').value = '';
      loadComments(currentTopicId);
    }
  } catch {}
}

// ─── SİLME ───────────────────────────────────────────────
function deleteTopic()      { deleteTarget = { type:'topic',   id:currentTopicId }; openDeleteModal(); }
function deleteComment(cid) { deleteTarget = { type:'comment', id:cid };            openDeleteModal(); }

function openDeleteModal() {
  document.getElementById('delete-pass').value = '';
  document.getElementById('delete-error').textContent = '';
  document.getElementById('delete-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('delete-pass').focus(), 100);
}
function closeDeleteModal() {
  document.getElementById('delete-modal').style.display = 'none';
  deleteTarget = null;
}

document.addEventListener('keydown', e => {
  if (e.key==='Escape') closeDeleteModal();
  if (e.key==='Enter' && document.getElementById('delete-modal').style.display==='flex') confirmDelete();
});

async function confirmDelete() {
  const pass  = document.getElementById('delete-pass').value;
  const errEl = document.getElementById('delete-error');
  if (!pass) { errEl.textContent = '► ŞİFRE GİRİLMEDİ'; return; }
  try {
    const url  = deleteTarget.type==='topic' ? `/api/topic/${deleteTarget.id}` : `/api/comment/${deleteTarget.id}`;
    const data = await del(url, { deletePassword: pass });
    if (data.success) {
      closeDeleteModal();
      if (deleteTarget.type==='topic') { showList(); loadTopics(); startListRefresh(); }
      else loadComments(currentTopicId);
    } else {
      errEl.textContent = '► ' + (data.error||'BAŞARISIZ').toUpperCase();
    }
  } catch { errEl.textContent = '► SUNUCU HATASI'; }
}

// ─── POLLING (yorum güncelleme) ──────────────────────────
function startPolling(topicId) {
  stopPolling();
  pollInterval = setInterval(() => { if (currentTopicId===topicId) loadComments(topicId); }, 8000);
}
function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// ─── LIST REFRESH (liste görünümündeyken) ────────────────
function startListRefresh() {
  stopListRefresh();
  listRefresh = setInterval(() => {
    if (document.getElementById('view-list').style.display !== 'none') {
      loadTopics();
    }
  }, 30000); // 30 saniyede bir — çok sık değil
}
function stopListRefresh() {
  if (listRefresh) { clearInterval(listRefresh); listRefresh = null; }
}

// ─── BBCode ───────────────────────────────────────────────
function parseBBCode(text) {
  if (!text) return '';
  let h = escHtml(text);
  h = h.replace(/\n/g, '<br>');
  h = h.replace(/\[b\]([\s\S]*?)\[\/b\]/gi,   '<b>$1</b>');
  h = h.replace(/\[i\]([\s\S]*?)\[\/i\]/gi,   '<i>$1</i>');
  h = h.replace(/\[u\]([\s\S]*?)\[\/u\]/gi,   '<u>$1</u>');
  h = h.replace(/\[s\]([\s\S]*?)\[\/s\]/gi,   '<s>$1</s>');
  h = h.replace(/\[color=([a-zA-Z#0-9]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
  h = h.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" class="bb-link" target="_blank" rel="noopener">$2</a>');
  h = h.replace(/\[url\]([\s\S]*?)\[\/url\]/gi,          '<a href="$1" class="bb-link" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\[img\]([\s\S]*?)\[\/img\]/gi,          '<img src="$1" class="bb-img" alt="Görsel" onerror="this.style.display=\'none\'">');
  h = h.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,      '<div class="bb-quote">$1</div>');
  h = h.replace(/\[code\]([\s\S]*?)\[\/code\]/gi,        '<code class="bb-code">$1</code>');
  h = h.replace(/\[video\]([\s\S]*?)\[\/video\]/gi, (_, url) => {
    const embedUrl = toEmbedUrl(url.trim());
    if (!embedUrl) return `<a href="${url}" class="bb-link" target="_blank">${url}</a>`;
    return `<div class="bb-video-wrap"><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></div>`;
  });
  return h;
}

function toEmbedUrl(url) {
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── BBCODE TOOLBAR ──────────────────────────────────────
function bbInsert(o,c)        { insertAt(document.getElementById('new-content'),     o, c); }
function bbInsertComment(o,c) { insertAt(document.getElementById('comment-content'), o, c); }

function insertAt(ta, open, close) {
  ta.focus();
  const s=ta.selectionStart, e=ta.selectionEnd, sel=ta.value.substring(s,e);
  ta.value = ta.value.substring(0,s)+open+sel+close+ta.value.substring(e);
  ta.selectionStart=s+open.length; ta.selectionEnd=s+open.length+sel.length;
}

function bbPromptURL()         { const u=prompt('URL:'); if(u) insertAt(document.getElementById('new-content'),     `[url=${u}]`,'[/url]'); }
function bbPromptIMG()         { const u=prompt('Görsel URL:'); if(u) insertAt(document.getElementById('new-content'),     `[img]${u}`,'[/img]'); }
function bbPromptVIDEO()       { const u=prompt('YouTube/Vimeo URL:'); if(u) insertAt(document.getElementById('new-content'),     `[video]${u}`,'[/video]'); }
function bbPromptURLComment()  { const u=prompt('URL:'); if(u) insertAt(document.getElementById('comment-content'), `[url=${u}]`,'[/url]'); }
function bbPromptIMGComment()  { const u=prompt('Görsel URL:'); if(u) insertAt(document.getElementById('comment-content'), `[img]${u}`,'[/img]'); }
function bbPromptVIDEOComment(){ const u=prompt('YouTube/Vimeo URL:'); if(u) insertAt(document.getElementById('comment-content'), `[video]${u}`,'[/video]'); }

// ─── TARİH ───────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '---';
  const d = new Date(typeof ts==='number' ? ts : Number(ts));
  if (isNaN(d)) return '---';
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── HTTP ─────────────────────────────────────────────────
async function post(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return r.json();
}
async function del(url, body) {
  const r = await fetch(url, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return r.json();
}
