/* ══════════════════════════════════════════════════════
   OCST BİLGİ SİSTEMLERİ — desktop.js
══════════════════════════════════════════════════════ */

const SITE_PASSWORD = 'OCSTARŞİV2020';
const DAILY_URL     = 'https://meet.jit.si/ocst-iletisim-2020';

let currentUser  = '';
let zCounter     = 200;
let minimized    = {};   // { winId: true/false }
let maximized    = {};   // { winId: { w, h, t, l } }
let dragState    = null;

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
}

function doLogout() {
  location.reload();
}

// Enter ile giriş
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
    document.getElementById('taskbar-time').textContent =
      `${p(now.getHours())}:${p(now.getMinutes())}`;
    document.getElementById('cad-clock').textContent =
      `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════
// UYGULAMALAR
// ══════════════════════════════════════════════════════
const APP_MAP = {
  arsiv:    { winId: 'win-arsiv',    label: '📁 Adli Arşiv' },
  cagri:    { winId: 'win-cagri',    label: '📡 Çağrı Yönetim' },
  iletisim: { winId: 'win-iletisim', label: '🎙️ İletişim' },
  ayarlar:  { winId: 'win-ayarlar',  label: '⚙️ Ayarlar' },
};

function openApp(appKey) {
  const app = APP_MAP[appKey];
  if (!app) return;
  const win = document.getElementById(app.winId);
  if (!win) return;

  if (win.style.display !== 'none' && !minimized[app.winId]) {
    focusWindow(app.winId);
    return;
  }

  minimized[app.winId] = false;
  win.style.display = 'flex';
  win.style.flexDirection = 'column';
  focusWindow(app.winId);
  updateTaskbar();
}

function closeWin(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  // Daily.co iframe'i durdur
  if (winId === 'win-iletisim') {
    document.getElementById('daily-iframe').src = '';
    document.getElementById('comm-placeholder').style.display = 'flex';
  }
  win.style.display = 'none';
  minimized[winId] = false;
  updateTaskbar();
}

function minimizeWin(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.style.display = 'none';
  minimized[winId] = true;
  updateTaskbar();
}

function maximizeWin(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  if (maximized[winId]) {
    // Geri al
    const s = maximized[winId];
    win.style.width  = s.w;
    win.style.height = s.h;
    win.style.top    = s.t;
    win.style.left   = s.l;
    delete maximized[winId];
  } else {
    maximized[winId] = {
      w: win.style.width, h: win.style.height,
      t: win.style.top,   l: win.style.left
    };
    win.style.width  = '100%';
    win.style.height = 'calc(100vh - 40px)';
    win.style.top    = '0';
    win.style.left   = '0';
  }
  focusWindow(winId);
}

function focusWindow(winId) {
  document.querySelectorAll('.window').forEach(w => {
    w.classList.remove('active');
    w.style.zIndex = 100;
  });
  const win = document.getElementById(winId);
  if (win) {
    win.style.zIndex = ++zCounter;
    win.classList.add('active');
  }
  updateTaskbar();
}

// ══════════════════════════════════════════════════════
// GÖREV ÇUBUĞU
// ══════════════════════════════════════════════════════
function updateTaskbar() {
  const bar = document.getElementById('taskbar-windows');
  bar.innerHTML = '';
  Object.entries(APP_MAP).forEach(([key, app]) => {
    const win = document.getElementById(app.winId);
    if (!win) return;
    const isOpen = win.style.display !== 'none' || minimized[app.winId];
    if (!isOpen) return;
    const isActive = win.classList.contains('active') && !minimized[app.winId];
    const btn = document.createElement('button');
    btn.className = 'taskbar-btn' + (isActive ? ' active' : '');
    btn.textContent = app.label;
    btn.onclick = () => {
      if (minimized[app.winId]) {
        minimized[app.winId] = false;
        win.style.display = 'flex';
        win.style.flexDirection = 'column';
        focusWindow(app.winId);
      } else if (win.classList.contains('active')) {
        minimizeWin(app.winId);
      } else {
        focusWindow(app.winId);
      }
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
  const menu  = document.getElementById('start-menu');
  const start = document.getElementById('taskbar-start');
  if (menu && !menu.contains(e.target) && !start.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ══════════════════════════════════════════════════════
// SÜRÜKLEME
// ══════════════════════════════════════════════════════
function dragStart(e, winId) {
  if (maximized[winId]) return;
  const win = document.getElementById(winId);
  focusWindow(winId);
  const rect = win.getBoundingClientRect();
  dragState = {
    winId,
    offX: e.clientX - rect.left,
    offY: e.clientY - rect.top
  };
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup',   dragEnd);
}

function dragMove(e) {
  if (!dragState) return;
  const win = document.getElementById(dragState.winId);
  let x = e.clientX - dragState.offX;
  let y = e.clientY - dragState.offY;
  // Sınırlar
  x = Math.max(0, Math.min(window.innerWidth - 100, x));
  y = Math.max(0, Math.min(window.innerHeight - 80, y));
  win.style.left = x + 'px';
  win.style.top  = y + 'px';
}

function dragEnd() {
  dragState = null;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup',   dragEnd);
}

// ══════════════════════════════════════════════════════
// İKON SEÇİMİ
// ══════════════════════════════════════════════════════
function selectIcon(el) {
  document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.desktop-icon')) {
    document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
  }
});

// ══════════════════════════════════════════════════════
// İLETİŞİM — Daily.co
// ══════════════════════════════════════════════════════
function joinVoice() {
  const iframe      = document.getElementById('daily-iframe');
  const placeholder = document.getElementById('comm-placeholder');
  iframe.src        = DAILY_URL;
  placeholder.style.display = 'none';
}

// ══════════════════════════════════════════════════════
// CAD — İşlevsiz submit
// ══════════════════════════════════════════════════════
function cadSubmit() {
  alert('[ CAD SİSTEMİ ]\n\nBu özellik henüz aktif değil.\nYakında güncellenecek.');
}

// Pencereye tıklanınca öne getir
document.addEventListener('mousedown', e => {
  const win = e.target.closest('.window');
  if (win) focusWindow(win.id);
}, true);
