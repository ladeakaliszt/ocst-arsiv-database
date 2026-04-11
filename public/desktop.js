/* ══════════════════════════════════════════════════════
   OCST BİLGİ SİSTEMLERİ — desktop.js v4
══════════════════════════════════════════════════════ */

const SITE_PASSWORD = 'OCSTARŞİV2020';
const DAILY_URL     = 'https://meet.jit.si/ocst-iletisim-2020';
const DELETE_PASS   = '080808';

let currentUser  = '';
let zCounter     = 200;
let minimized    = {};
let maximized    = {};
let dragState    = null;

// CAD state
let allCalls     = [];
let selectedCall = null;
let cadFilter    = 'hepsi';
let wsConn       = null;
let panicCallId  = null;  // popup için

// ══════════════════════════════════════════════════════
// GİRİŞ
// ══════════════════════════════════════════════════════
function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username) { errEl.textContent = '► Kullanıcı adı boş olamaz'; return; }
  if (password !== SITE_PASSWORD) { errEl.textContent = '► Hatalı şifre'; return; }

  currentUser = username;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('desktop').style.display      = 'block';
  document.getElementById('start-username').textContent  = username.toUpperCase();
  document.getElementById('settings-username').textContent = username;
  startClock();
  connectWebSocket();
}

function doLogout() { location.reload(); }

document.addEventListener('DOMContentLoaded', () => {
  ['login-username','login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});

// ══════════════════════════════════════════════════════
// SAAT
// ══════════════════════════════════════════════════════
function startClock() {
  function tick() {
    const now = new Date(), p = n => String(n).padStart(2,'0');
    const timeStr = `${p(now.getHours())}:${p(now.getMinutes())}`;
    const fullStr = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    document.getElementById('taskbar-time').textContent = timeStr;
    const cadClock = document.getElementById('cad-clock');
    if (cadClock) cadClock.textContent = fullStr;
  }
  tick(); setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════════════════
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url   = `${proto}://${location.host}`;
  wsConn = new WebSocket(url);

  wsConn.onopen = () => {
    setWSStatus(true);
    cadLog('SİSTEM', 'WebSocket bağlantısı kuruldu', 'sys');
  };

  wsConn.onclose = () => {
    setWSStatus(false);
    setTimeout(connectWebSocket, 3000);
  };

  wsConn.onerror = () => setWSStatus(false);

  wsConn.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      handleWSMessage(msg);
    } catch {}
  };
}

function setWSStatus(ok) {
  const dot   = document.getElementById('cad-ws-dot');
  const label = document.getElementById('cad-ws-label');
  if (!dot || !label) return;
  if (ok) {
    dot.style.color   = '#00cc44';
    dot.className     = 'cad-dot blink-green';
    label.textContent = 'CANLI';
    label.style.color = '#00cc44';
  } else {
    dot.style.color   = '#ff4444';
    dot.className     = 'cad-dot blink-red';
    label.textContent = 'BAĞLANTI KESİLDİ';
    label.style.color = '#ff4444';
  }
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'init_calls':
      allCalls = msg.calls || [];
      renderCADList();
      break;
    case 'new_call':
      allCalls.unshift(msg.call);
      renderCADList();
      if (msg.call.type === 'panic') {
        showPanicPopup(msg.call);
        playPanicAlert();
      }
      cadLog(msg.call.type === 'panic' ? 'PANİK' : 'ÇAĞRI',
        `${msg.call.author} — ${msg.call.title}`,
        msg.call.type === 'panic' ? 'panic' : '');
      break;
    case 'update_call':
      allCalls = allCalls.map(c => c.id === msg.call.id ? msg.call : c);
      renderCADList();
      if (selectedCall && selectedCall.id === msg.call.id) {
        selectedCall = msg.call;
        renderCADDetail(msg.call);
      }
      break;
    case 'delete_call':
      allCalls = allCalls.filter(c => c.id !== msg.id);
      if (selectedCall && selectedCall.id === msg.id) {
        selectedCall = null;
        document.getElementById('cad-detail').innerHTML = `
          <div class="cad-detail-empty"><div class="cad-detail-placeholder"><div style="font-size:32px;margin-bottom:10px">📡</div><div>Çağrı seçin</div></div></div>`;
      }
      renderCADList();
      break;
  }
}

// ══════════════════════════════════════════════════════
// CAD — LİSTE
// ══════════════════════════════════════════════════════
function filterCalls(f, btn) {
  cadFilter = f;
  document.querySelectorAll('.cad-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCADList();
}

function renderCADList() {
  const listEl = document.getElementById('cad-call-list');
  if (!listEl) return;

  let calls = allCalls;
  if (cadFilter === 'panic')      calls = calls.filter(c => c.type === 'panic');
  else if (cadFilter !== 'hepsi') calls = calls.filter(c => c.status === cadFilter);

  // Panik sayısı
  const panicCount = allCalls.filter(c => c.type === 'panic' && c.status === 'bekliyor').length;
  const badge = document.getElementById('cad-panic-count');
  const tray  = document.getElementById('cad-tray-alert');
  if (badge) { badge.style.display = panicCount ? 'inline' : 'none'; badge.textContent = `${panicCount} PANİK`; }
  if (tray)  { tray.style.display  = panicCount ? 'inline' : 'none'; }

  // Toplam
  const total = document.getElementById('cad-total');
  if (total) total.textContent = `TOPLAM: ${allCalls.length} ÇAĞRI`;

  if (!calls.length) {
    listEl.innerHTML = '<div class="cad-empty">► Çağrı yok.</div>';
    return;
  }

  listEl.innerHTML = calls.map(call => {
    const isPanic    = call.type === 'panic';
    const isSelected = selectedCall && selectedCall.id === call.id;
    const icon       = isPanic ? '🚨' : '📞';
    const badge      = `<span class="call-status-badge badge-${call.status}">${statusLabel(call.status)}</span>`;
    const meta       = `${call.author} · ${formatTime(call.createdAt)}`;
    return `
      <div class="cad-call-row ${isPanic?'is-panic':''} ${isSelected?'selected':''}"
           onclick="selectCALLRow('${call.id}')">
        <div class="call-type-icon">${icon}</div>
        <div class="call-info">
          <div class="call-title-row">
            <span class="call-title-text">${escH(call.title)}</span>
            ${badge}
          </div>
          <div class="call-meta">${escH(meta)}</div>
        </div>
      </div>`;
  }).join('');
}

function selectCALLRow(id) {
  selectedCall = allCalls.find(c => c.id === id) || null;
  renderCADList();
  if (selectedCall) renderCADDetail(selectedCall);
}

function renderCADDetail(call) {
  const el = document.getElementById('cad-detail');
  if (!el) return;

  const isPanic   = call.type === 'panic';
  const gpsBlock  = (call.lat && call.lng)
    ? `<a class="cd-gps-link" href="https://www.google.com/maps?q=${call.lat},${call.lng}" target="_blank">
        🗺️ Haritada Aç (${parseFloat(call.lat).toFixed(5)}, ${parseFloat(call.lng).toFixed(5)})
       </a>` : '';

  el.innerHTML = `
    <div class="cad-detail-content">
      ${isPanic ? '<div class="cd-type-panic">🚨 PANİK BUTONU BASILDI 🚨</div>' : ''}
      <div class="cd-field"><div class="cd-label">ÇAĞRI TİPİ</div><div class="cd-value">${isPanic?'PANİK':'Normal Çağrı'}</div></div>
      <div class="cd-field"><div class="cd-label">BAŞLIK</div><div class="cd-value">${escH(call.title)}</div></div>
      <div class="cd-field"><div class="cd-label">PERSONEL</div><div class="cd-value">${escH(call.author)}</div></div>
      <div class="cd-field"><div class="cd-label">KONUM</div><div class="cd-value">${escH(call.location)}<br>${gpsBlock}</div></div>
      ${call.detail ? `<div class="cd-field"><div class="cd-label">DETAY</div><div class="cd-value">${escH(call.detail)}</div></div>` : ''}
      <div class="cd-field"><div class="cd-label">ZAMAN</div><div class="cd-value">${formatDateTime(call.createdAt)}</div></div>
      <div class="cd-field"><div class="cd-label">DURUM</div><div class="cd-value">${statusLabel(call.status)}</div></div>
      <div class="cd-status-btns">
        <button class="cd-status-btn cd-btn-bekliyor"   onclick="updateStatus('${call.id}','bekliyor')">BEKLİYOR</button>
        <button class="cd-status-btn cd-btn-yanitlandi" onclick="updateStatus('${call.id}','yanitlandi')">YANITLANDI</button>
        <button class="cd-status-btn cd-btn-kapatildi"  onclick="updateStatus('${call.id}','kapatildi')">KAPATILDI</button>
      </div>
      <button class="cd-delete-btn" onclick="deleteCall('${call.id}')">[ ÇAĞRIYI SİL ]</button>
    </div>`;
}

async function updateStatus(id, status) {
  await fetch(`/api/call/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
}

async function deleteCall(id) {
  const pass = prompt('Silme şifresi:');
  if (!pass) return;
  await fetch(`/api/call/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletePassword: pass })
  });
}

function cadLog(label, text, cls) {
  const logEl = document.getElementById('cad-log');
  if (!logEl) return;
  const now = new Date(), p = n => String(n).padStart(2,'0');
  const time = `${p(now.getHours())}:${p(now.getMinutes())}`;
  const div  = document.createElement('div');
  div.className = `log-entry ${cls==='panic'?'log-panic':cls==='sys'?'log-sys':''}`;
  div.textContent = `[${time}] ${label}: ${text}`;
  logEl.prepend(div);
  // Max 30 log
  while (logEl.children.length > 30) logEl.lastChild.remove();
}

// ══════════════════════════════════════════════════════
// PANİK POPUP
// ══════════════════════════════════════════════════════
function showPanicPopup(call) {
  panicCallId = call.id;
  document.getElementById('pp-author').textContent   = call.author;
  document.getElementById('pp-location').textContent = call.location || 'Konum alınamadı';
  document.getElementById('pp-time').textContent     = formatDateTime(call.createdAt);
  document.getElementById('panic-popup').style.display = 'block';
}

function closePanicPopup() {
  document.getElementById('panic-popup').style.display = 'none';
}

function openCADFromPopup() {
  closePanicPopup();
  openApp('cagri');
  // Çağrıyı seç
  setTimeout(() => {
    if (panicCallId) selectCALLRow(panicCallId);
  }, 300);
}

function playPanicAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660, 880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.18);
    });
  } catch {}
}

// ══════════════════════════════════════════════════════
// PENCERE YÖNETİMİ
// ══════════════════════════════════════════════════════
const APP_MAP = {
  arsiv:    { winId:'win-arsiv',    label:'📁 Adli Arşiv' },
  cagri:    { winId:'win-cagri',    label:'📡 Çağrı Yönetim' },
  iletisim: { winId:'win-iletisim', label:'🎙️ İletişim' },
  ayarlar:  { winId:'win-ayarlar',  label:'⚙️ Ayarlar' },
};

function openApp(appKey) {
  const app = APP_MAP[appKey]; if (!app) return;
  const win = document.getElementById(app.winId); if (!win) return;
  if (win.style.display !== 'none' && !minimized[app.winId]) { focusWindow(app.winId); return; }
  minimized[app.winId] = false;
  win.style.display = 'flex'; win.style.flexDirection = 'column';
  focusWindow(app.winId); updateTaskbar();
}

function closeWin(winId) {
  const win = document.getElementById(winId); if (!win) return;
  if (winId === 'win-iletisim') {
    document.getElementById('daily-iframe').src = '';
    document.getElementById('comm-placeholder').style.display = 'flex';
  }
  win.style.display = 'none'; minimized[winId] = false; updateTaskbar();
}

function minimizeWin(winId) {
  const win = document.getElementById(winId); if (!win) return;
  win.style.display = 'none'; minimized[winId] = true; updateTaskbar();
}

function maximizeWin(winId) {
  const win = document.getElementById(winId); if (!win) return;
  if (maximized[winId]) {
    const s = maximized[winId];
    win.style.width=s.w; win.style.height=s.h; win.style.top=s.t; win.style.left=s.l;
    delete maximized[winId];
  } else {
    maximized[winId] = { w:win.style.width, h:win.style.height, t:win.style.top, l:win.style.left };
    win.style.width='100%'; win.style.height='calc(100vh - 40px)'; win.style.top='0'; win.style.left='0';
  }
  focusWindow(winId);
}

function focusWindow(winId) {
  document.querySelectorAll('.window').forEach(w => { w.classList.remove('active'); w.style.zIndex=100; });
  const win = document.getElementById(winId);
  if (win) { win.style.zIndex = ++zCounter; win.classList.add('active'); }
  updateTaskbar();
}

function updateTaskbar() {
  const bar = document.getElementById('taskbar-windows');
  bar.innerHTML = '';
  Object.entries(APP_MAP).forEach(([key, app]) => {
    const win = document.getElementById(app.winId); if (!win) return;
    const isOpen = win.style.display !== 'none' || minimized[app.winId]; if (!isOpen) return;
    const isActive = win.classList.contains('active') && !minimized[app.winId];
    const btn = document.createElement('button');
    btn.className = 'taskbar-btn' + (isActive ? ' active' : '');
    btn.textContent = app.label;
    btn.onclick = () => {
      if (minimized[app.winId]) { minimized[app.winId]=false; win.style.display='flex'; win.style.flexDirection='column'; focusWindow(app.winId); }
      else if (win.classList.contains('active')) minimizeWin(app.winId);
      else focusWindow(app.winId);
    };
    bar.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════════
// START MENÜSÜ
// ══════════════════════════════════════════════════════
function toggleStartMenu() {
  const m = document.getElementById('start-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  const m = document.getElementById('start-menu');
  const s = document.getElementById('taskbar-start');
  if (m && !m.contains(e.target) && !s.contains(e.target)) m.style.display = 'none';
});

// ══════════════════════════════════════════════════════
// SÜRÜKLEME
// ══════════════════════════════════════════════════════
function dragStart(e, winId) {
  if (maximized[winId]) return;
  const win = document.getElementById(winId);
  focusWindow(winId);
  const rect = win.getBoundingClientRect();
  dragState = { winId, offX: e.clientX-rect.left, offY: e.clientY-rect.top };
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
}

function dragMove(e) {
  if (!dragState) return;
  const win = document.getElementById(dragState.winId);
  let x = Math.max(0, Math.min(window.innerWidth-100, e.clientX-dragState.offX));
  let y = Math.max(0, Math.min(window.innerHeight-80, e.clientY-dragState.offY));
  win.style.left = x+'px'; win.style.top = y+'px';
}

function dragEnd() {
  dragState = null;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
}

// ══════════════════════════════════════════════════════
// İKON SEÇİMİ
// ══════════════════════════════════════════════════════
function selectIcon(el) {
  document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.desktop-icon'))
    document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
});
document.addEventListener('mousedown', e => {
  const win = e.target.closest('.window');
  if (win) focusWindow(win.id);
}, true);

// ══════════════════════════════════════════════════════
// İLETİŞİM
// ══════════════════════════════════════════════════════
function joinVoice() {
  document.getElementById('daily-iframe').src = DAILY_URL;
  document.getElementById('comm-placeholder').style.display = 'none';
}

// ══════════════════════════════════════════════════════
// YARDIMCILAR
// ══════════════════════════════════════════════════════
function statusLabel(s) {
  return { bekliyor:'BEKLİYOR', yanitlandi:'YANITLANDI', kapatildi:'KAPATILDI' }[s] || s;
}

function formatTime(ts) {
  if (!ts) return '---';
  const d = new Date(ts), p = n => String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDateTime(ts) {
  if (!ts) return '---';
  const d = new Date(ts), p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function escH(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function closeCallModal() {
  document.getElementById('call-modal').style.display = 'none';
}
