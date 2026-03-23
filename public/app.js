/* ═══════════════════════════════════════════════════════
   OCST ADLİ ARŞİV — app.js
   ═══════════════════════════════════════════════════════ */

let currentMenu   = 'kayitlar';
let currentTopicId = null;
let deleteTarget  = null;
let pollInterval  = null;

const MENU_LABELS = {
  'kayitlar':    'KAYITLAR',
  'kisiler':     'KİŞİLER',
  'ek-dosyalar': 'EK DOSYALAR',
  'gorseller':   'GÖRSELLER'
};

// ─── SAAT ────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('current-time').textContent =
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
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      startApp(data.username);
    } else {
      errEl.textContent = '► ' + data.message.toUpperCase();
    }
  } catch (e) {
    errEl.textContent = '► SUNUCU BAĞLANTI HATASI';
  }
}

function startApp(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-system').style.display  = 'flex';
  document.getElementById('topbar-user').textContent    = `KULLANICI: ${username}`;
  setInterval(updateClock, 1000);
  updateClock();
  switchMenu('kayitlar', document.querySelector('.menu-item[data-menu="kayitlar"]'));
}

document.addEventListener('DOMContentLoaded', () => {
  ['login-username','login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
  // Mevcut oturum kontrolü
  fetch('/api/me').then(r => r.json()).then(data => {
    if (data.loggedIn) startApp(data.username);
  });
});

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

// ─── MENÜ ────────────────────────────────────────────────
function switchMenu(menu, btn) {
  currentMenu    = menu;
  currentTopicId = null;
  stopPolling();
  document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('list-title').textContent = MENU_LABELS[menu];
  showList();
  loadTopics();
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
  document.getElementById('form-error').textContent = '';
}

function showTopicDetail(topicId) {
  currentTopicId = topicId;
  document.getElementById('view-list').style.display      = 'none';
  document.getElementById('view-new-topic').style.display = 'none';
  document.getElementById('view-topic').style.display     = 'block';
  document.getElementById('detail-menu-label').textContent = MENU_LABELS[currentMenu];
  loadTopicDetail(topicId);
  startPolling(topicId);
}

// ─── KONULAR ─────────────────────────────────────────────
async function loadTopics() {
  const listEl = document.getElementById('topic-list');
  listEl.innerHTML = '<div class="loading-text">► VERİ YÜKLENİYOR...</div>';
  try {
    const res    = await fetch(`/api/topics/${currentMenu}`);
    if (res.status === 401) { location.reload(); return; }
    const topics = await res.json();

    document.getElementById('record-count').textContent = `KAYIT SAYISI: ${topics.length}`;

    if (!topics.length) {
      listEl.innerHTML = '<div class="empty-text">► KAYIT BULUNAMADI. YENİ KONU AÇMAK İÇİN "KONU AÇ" BUTONUNU KULLANIN.</div>';
      return;
    }
    listEl.innerHTML = topics.map((t, i) => `
      <div class="topic-row" onclick="showTopicDetail('${t.id}')">
        <span class="col-num">${String(i+1).padStart(3,'0')}</span>
        <span class="col-title">${escHtml(t.title)}</span>
        <span class="col-author">${escHtml(t.author || 'UNKNOWN')}</span>
        <span class="col-date">${formatDate(t.createdAt)}</span>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = '<div class="empty-text">► BAĞLANTI HATASI. SAYFAYI YENİLEYİN.</div>';
  }
}

async function loadTopicDetail(topicId) {
  const detailEl = document.getElementById('topic-detail-content');
  detailEl.innerHTML = '<div class="loading-text">► KAYIT YÜKLENİYOR...</div>';
  try {
    const res = await fetch(`/api/topic/${topicId}`);
    if (res.status === 404) { showList(); return; }
    const topic = await res.json();
    detailEl.innerHTML = `
      <div class="topic-detail-header">
        <div class="topic-detail-title">${escHtml(topic.title)}</div>
        <div class="topic-detail-meta">
          <span>YAZAN: <span>${escHtml(topic.author || 'UNKNOWN')}</span></span>
          <span>TARİH: <span>${formatDate(topic.createdAt)}</span></span>
          <span>KATEGORİ: <span>${MENU_LABELS[topic.menu] || topic.menu}</span></span>
        </div>
        <div class="topic-detail-body">${parseBBCode(topic.content)}</div>
      </div>
    `;
    loadComments(topicId);
  } catch (e) {
    detailEl.innerHTML = '<div class="empty-text">► KAYIT YÜKLENEMEDİ.</div>';
  }
}

async function loadComments(topicId) {
  const listEl = document.getElementById('comments-list');
  try {
    const res      = await fetch(`/api/comments/${topicId}`);
    const comments = await res.json();
    if (!comments.length) {
      listEl.innerHTML = '<div class="empty-text" style="font-size:11px">► HENÜZ YORUM YAPILMAMIS.</div>';
      return;
    }
    listEl.innerHTML = comments.map(c => `
      <div class="comment-item" id="comment-${c.id}">
        <div class="comment-meta">
          <span class="author">${escHtml(c.author || 'UNKNOWN')}</span>
          <span>${formatDate(c.createdAt)}</span>
          <button class="comment-delete-btn" onclick="deleteComment('${c.id}')">[SİL]</button>
        </div>
        <div class="comment-body">${parseBBCode(c.content)}</div>
      </div>
    `).join('');
  } catch(e) {}
}

async function submitTopic() {
  const title   = document.getElementById('new-title').value.trim();
  const content = document.getElementById('new-content').value.trim();
  const errEl   = document.getElementById('form-error');
  errEl.textContent = '';
  if (!title)   { errEl.textContent = '► KONU BAŞLIĞI ZORUNLUDUR'; return; }
  if (!content) { errEl.textContent = '► KONU İÇERİĞİ ZORUNLUDUR'; return; }
  try {
    const res  = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu: currentMenu, title, content })
    });
    const data = await res.json();
    if (data.success) { showList(); loadTopics(); }
    else errEl.textContent = '► ' + (data.error || 'HATA OLUŞTU').toUpperCase();
  } catch (e) {
    errEl.textContent = '► SUNUCU HATASI';
  }
}

async function submitComment() {
  const content = document.getElementById('comment-content').value.trim();
  if (!content) return;
  try {
    const res  = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: currentTopicId, content })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('comment-content').value = '';
      loadComments(currentTopicId);
    }
  } catch(e) {}
}

// ─── SİLME ───────────────────────────────────────────────
function deleteTopic()         { deleteTarget = { type: 'topic',   id: currentTopicId }; openDeleteModal(); }
function deleteComment(cid)    { deleteTarget = { type: 'comment', id: cid };             openDeleteModal(); }

function openDeleteModal() {
  document.getElementById('delete-pass').value        = '';
  document.getElementById('delete-error').textContent = '';
  document.getElementById('delete-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('delete-pass').focus(), 100);
}

function closeDeleteModal() {
  document.getElementById('delete-modal').style.display = 'none';
  deleteTarget = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDeleteModal();
  if (e.key === 'Enter' && document.getElementById('delete-modal').style.display === 'flex') confirmDelete();
});

async function confirmDelete() {
  const pass  = document.getElementById('delete-pass').value;
  const errEl = document.getElementById('delete-error');
  if (!pass) { errEl.textContent = '► ŞİFRE GİRİLMEDİ'; return; }
  try {
    const url = deleteTarget.type === 'topic'
      ? `/api/topic/${deleteTarget.id}`
      : `/api/comment/${deleteTarget.id}`;
    const res  = await fetch(url, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ deletePassword: pass })
    });
    const data = await res.json();
    if (data.success) {
      closeDeleteModal();
      if (deleteTarget.type === 'topic') { showList(); loadTopics(); }
      else loadComments(currentTopicId);
    } else {
      errEl.textContent = '► ' + (data.error || 'SİLME BAŞARISIZ').toUpperCase();
    }
  } catch(e) { errEl.textContent = '► SUNUCU HATASI'; }
}

// ─── POLLING ─────────────────────────────────────────────
function startPolling(topicId) {
  stopPolling();
  pollInterval = setInterval(() => {
    if (currentTopicId === topicId) loadComments(topicId);
  }, 5000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

setInterval(() => {
  if (document.getElementById('view-list').style.display !== 'none') loadTopics();
}, 10000);

// ─── BBCode ───────────────────────────────────────────────
function parseBBCode(text) {
  if (!text) return '';
  let html = escHtml(text);
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi,   '<b>$1</b>');
  html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi,   '<i>$1</i>');
  html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi,   '<u>$1</u>');
  html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi,   '<s>$1</s>');
  html = html.replace(/\[color=([a-zA-Z#0-9]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
  html = html.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" class="bb-link" target="_blank" rel="noopener">$2</a>');
  html = html.replace(/\[url\]([\s\S]*?)\[\/url\]/gi,          '<a href="$1" class="bb-link" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/\[img\]([\s\S]*?)\[\/img\]/gi,          '<img src="$1" class="bb-img" alt="Görsel" onerror="this.style.display=\'none\'">');
  html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,      '<div class="bb-quote">$1</div>');
  html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/gi,        '<code class="bb-code">$1</code>');
  return html;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── BBCODE TOOLBAR ──────────────────────────────────────
function bbInsert(open, close)        { insertAtCursor(document.getElementById('new-content'),     open, close); }
function bbInsertComment(open, close) { insertAtCursor(document.getElementById('comment-content'), open, close); }

function insertAtCursor(ta, open, close) {
  ta.focus();
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.substring(s, e);
  ta.value = ta.value.substring(0,s) + open + sel + close + ta.value.substring(e);
  ta.selectionStart = s + open.length;
  ta.selectionEnd   = s + open.length + sel.length;
}

function bbPromptURL() {
  const url = prompt('URL adresini girin:');
  if (!url) return;
  const ta  = document.getElementById('new-content');
  const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd) || url;
  insertAtCursor(ta, `[url=${url}]`, '[/url]');
}

function bbPromptIMG() {
  const url = prompt('Görsel URL adresini girin:');
  if (!url) return;
  const ta  = document.getElementById('new-content');
  const pos = ta.selectionStart;
  ta.value  = ta.value.substring(0, pos) + `[img]${url}[/img]` + ta.value.substring(pos);
}

function bbPromptURLComment() {
  const url = prompt('URL adresini girin:');
  if (!url) return;
  insertAtCursor(document.getElementById('comment-content'), `[url=${url}]`, '[/url]');
}

function bbPromptIMGComment() {
  const url = prompt('Görsel URL adresini girin:');
  if (!url) return;
  const ta  = document.getElementById('comment-content');
  const pos = ta.selectionStart;
  ta.value  = ta.value.substring(0, pos) + `[img]${url}[/img]` + ta.value.substring(pos);
}

// ─── TARİH ───────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '---';
  const date = new Date(typeof ts === 'number' ? ts : Number(ts));
  if (isNaN(date)) return '---';
  const pad = n => String(n).padStart(2,'0');
  return `${pad(date.getDate())}.${pad(date.getMonth()+1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
