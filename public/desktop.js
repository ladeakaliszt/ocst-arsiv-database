/* ══════════════════════════════════════════════════════
   OCST BİLGİ SİSTEMLERİ — desktop.js v4.1
══════════════════════════════════════════════════════ */

const SITE_PASSWORD = 'OCSTARŞİV2020';
const DAILY_URL     = 'https://meet.jit.si/ocst-iletisim-2020';

let currentUser  = '';
let zCounter     = 200;
let minimized    = {};
let maximized    = {};
let dragState    = null;

// CAD state
let allCalls       = [];
let selectedCall   = null;
let cadFilter      = 'hepsi';
let wsConn         = null;
let panicCallId    = null;
let pendingDeleteId = null;
let pendingAssignId = null;
let mapInstance    = null;
let mapMarker      = null;

// Personel state
let activePersonnel = [];

// Mobil cihaz state
let mobileDevices = [];
let mapBlips = {};      // leaflet markers: deviceId → marker
let mapLeaflet = null;  // Haritalar app leaflet instance

// ══════════════════════════════════════════════════════
// GİRİŞ
// ══════════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username) { errEl.textContent = '► Kullanıcı adı boş olamaz'; return; }
  if (!password) { errEl.textContent = '► Şifre boş olamaz'; return; }

  try {
    const r = await fetch('/api/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (data.success) {
      currentUser = data.username;
      startDesktop();
    } else {
      errEl.textContent = '► ' + data.message;
    }
  } catch {
    errEl.textContent = '► Sunucu bağlantı hatası';
  }
}

function startDesktop() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('desktop').style.display      = 'block';
  document.getElementById('start-username').textContent  = currentUser.toUpperCase();
  document.getElementById('settings-username').textContent = currentUser;
  startClock();
  connectWebSocket();
  startHeartbeat();
}

async function doLogout() {
  await fetch('/api/logout', { method:'POST' });
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  ['login-username','login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});

// ══════════════════════════════════════════════════════
// HEARTBEAT — Personel aktifliğini sunucuya bildir
// ══════════════════════════════════════════════════════
function startHeartbeat() {
  setInterval(() => {
    fetch('/api/heartbeat', { method:'POST' }).catch(() => {});
  }, 60000);
}

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
  wsConn = new WebSocket(`${proto}://${location.host}`);

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
    try { handleWSMessage(JSON.parse(e.data)); } catch {}
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
      } else {
        playNormalAlert();
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
      cadLog('GÜNCELLEME', `#${msg.call.id.slice(-4)} — ${statusLabel(msg.call.status)}`, 'sys');
      break;
    case 'delete_call':
      allCalls = allCalls.filter(c => c.id !== msg.id);
      if (selectedCall && selectedCall.id === msg.id) {
        selectedCall = null;
        document.getElementById('cad-detail').innerHTML =
          `<div class="cad-detail-empty"><div class="cad-detail-placeholder"><div style="font-size:32px;margin-bottom:10px">📡</div><div>Çağrı seçin</div></div></div>`;
      }
      renderCADList();
      break;
    case 'personnel_update':
      activePersonnel = msg.personnel || [];
      renderPersonnel();
      renderCADPersonnel();
      break;
    case 'mobile_devices_update':
      mobileDevices = msg.devices || [];
      renderMobileDevices();
      renderMapBlips();
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
  if (cadFilter === 'panic')          calls = calls.filter(c => c.type === 'panic');
  else if (cadFilter !== 'hepsi')     calls = calls.filter(c => c.status === cadFilter);

  // Panik sayısı (sadece aktif bekleyenler)
  const panicCount = allCalls.filter(c => c.type === 'panic' && c.status === 'bekliyor').length;
  const badge = document.getElementById('cad-panic-count');
  const tray  = document.getElementById('cad-tray-alert');
  if (badge) { badge.style.display = panicCount ? 'inline' : 'none'; badge.textContent = `${panicCount} PANİK`; }
  if (tray)  { tray.style.display  = panicCount ? 'inline' : 'none'; }

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
    const assigned   = call.assignedTo ? `<span class="call-assigned">👤 ${escH(call.assignedTo)}</span>` : '';
    const meta       = `${escH(call.author)} · ${formatTime(call.createdAt)}`;
    return `
      <div class="cad-call-row ${isPanic?'is-panic':''} ${isSelected?'selected':''}"
           onclick="selectCALLRow('${call.id}')">
        <div class="call-type-icon">${icon}</div>
        <div class="call-info">
          <div class="call-title-row">
            <span class="call-title-text">${escH(call.title)}</span>
            ${badge}
          </div>
          <div class="call-meta">${meta} ${assigned}</div>
        </div>
      </div>`;
  }).join('');
}

function selectCALLRow(id) {
  selectedCall = allCalls.find(c => c.id === id) || null;
  renderCADList();
  if (selectedCall) renderCADDetail(selectedCall);

  // Seçilen panik çağrısı ise tray uyarısını güncelle
  updatePanicTray();
}

function updatePanicTray() {
  const panicCount = allCalls.filter(c => c.type === 'panic' && c.status === 'bekliyor').length;
  const tray = document.getElementById('cad-tray-alert');
  if (tray) tray.style.display = panicCount ? 'inline' : 'none';
  const badge = document.getElementById('cad-panic-count');
  if (badge) { badge.style.display = panicCount ? 'inline' : 'none'; badge.textContent = `${panicCount} PANİK`; }
}

// ══════════════════════════════════════════════════════
// CAD — DETAY
// ══════════════════════════════════════════════════════
function renderCADDetail(call) {
  const el = document.getElementById('cad-detail');
  if (!el) return;

  const isPanic = call.type === 'panic';
  const hasGPS  = call.lat && call.lng;

  const notesHTML = (call.notes && call.notes.length)
    ? call.notes.map(n => `<div class="cd-note"><span class="cd-note-by">${escH(n.by)}</span> <span class="cd-note-time">${formatTime(n.at)}</span><br>${escH(n.text)}</div>`).join('')
    : '<div style="color:#4a6a8a;font-size:10px">Henüz not yok.</div>';

  const assignedHTML = call.assignedTo
    ? `<span class="cd-assigned-badge">👤 ${escH(call.assignedTo)}</span>`
    : `<span style="color:#4a6a8a;font-size:11px">— Atanmamış —</span>`;

  el.innerHTML = `
    <div class="cad-detail-content">
      ${isPanic ? '<div class="cd-type-panic">🚨 PANİK BUTONU BASILDI 🚨</div>' : ''}

      ${hasGPS ? `
      <div class="cd-map-wrap">
        <div id="cad-leaflet-map" style="width:100%;height:160px;"></div>
      </div>` : ''}

      <div class="cd-field">
        <div class="cd-label">BAŞLIK</div>
        <div class="cd-value">${escH(call.title)}</div>
      </div>
      <div class="cd-field">
        <div class="cd-label">PERSONEL</div>
        <div class="cd-value">${escH(call.author)}</div>
      </div>
      <div class="cd-field">
        <div class="cd-label">KONUM</div>
        <div class="cd-value">${escH(call.location || 'Belirtilmedi')}</div>
        ${hasGPS ? `<a class="cd-gps-link" href="https://www.google.com/maps?q=${call.lat},${call.lng}" target="_blank">🗺️ Google Maps'te Aç (${parseFloat(call.lat).toFixed(5)}, ${parseFloat(call.lng).toFixed(5)})</a>` : ''}
      </div>
      ${call.detail ? `<div class="cd-field"><div class="cd-label">DETAY</div><div class="cd-value">${escH(call.detail)}</div></div>` : ''}
      <div class="cd-field">
        <div class="cd-label">ZAMAN</div>
        <div class="cd-value">${formatDateTime(call.createdAt)}</div>
      </div>
      <div class="cd-field">
        <div class="cd-label">ATANAN PERSONEL</div>
        <div class="cd-value" style="display:flex;align-items:center;gap:8px;">
          ${assignedHTML}
          <button class="cd-assign-btn" onclick="openAssignModal('${call.id}')">[ ATAAMA YAP ]</button>
        </div>
      </div>

      <div class="cd-status-btns">
        <button class="cd-status-btn cd-btn-bekliyor ${call.status==='bekliyor'?'active':''}"
          onclick="setCallStatus('${call.id}','bekliyor')">BEKLİYOR</button>
        <button class="cd-status-btn cd-btn-yanitlandi ${call.status==='yanitlandi'?'active':''}"
          onclick="setCallStatus('${call.id}','yanitlandi')">YANITLANDI</button>
        <button class="cd-status-btn cd-btn-kapatildi ${call.status==='kapatildi'?'active':''}"
          onclick="setCallStatus('${call.id}','kapatildi')">KAPATILDI</button>
      </div>

      <button class="cd-delete-btn" onclick="openCADDeleteModal('${call.id}')">[ ÇAĞRIYI SİL ]</button>

      <div class="cd-notes-section">
        <div class="cd-label" style="margin-bottom:6px;">NOTLAR / LOG</div>
        <div class="cd-notes-list">${notesHTML}</div>
      </div>
    </div>`;

  // Leaflet haritası yükle
  if (hasGPS) {
    setTimeout(() => initLeafletMap(call.lat, call.lng), 50);
  }
}

// ══════════════════════════════════════════════════════
// HARİTA (Leaflet — API key gerektirmez)
// ══════════════════════════════════════════════════════
function initLeafletMap(lat, lng) {
  const mapEl = document.getElementById('cad-leaflet-map');
  if (!mapEl) return;

  // Eğer Leaflet yüklü değilse yükle
  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => createMap(lat, lng);
    document.head.appendChild(script);
  } else {
    createMap(lat, lng);
  }
}

function createMap(lat, lng) {
  const mapEl = document.getElementById('cad-leaflet-map');
  if (!mapEl || !window.L) return;

  // Önceki haritayı temizle
  if (mapInstance) {
    try { mapInstance.remove(); } catch {}
    mapInstance = null;
  }
  mapEl.innerHTML = '';

  mapInstance = L.map('cad-leaflet-map', { zoomControl: true, attributionControl: false }).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  // Kırmızı blip marker
  const redIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:#ff2222;
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 0 0 3px rgba(255,30,30,.4), 0 0 12px rgba(255,30,30,.8);
      animation:map-blip 1.2s ease-in-out infinite;
    "></div>
    <style>
      @keyframes map-blip {
        0%,100% { transform:scale(1); box-shadow:0 0 0 3px rgba(255,30,30,.4), 0 0 12px rgba(255,30,30,.8); }
        50%      { transform:scale(1.3); box-shadow:0 0 0 6px rgba(255,30,30,.2), 0 0 20px rgba(255,30,30,.6); }
      }
    </style>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  mapMarker = L.marker([lat, lng], { icon: redIcon }).addTo(mapInstance);
  setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 100);
}

// ══════════════════════════════════════════════════════
// CAD — DURUM GÜNCELLE
// ══════════════════════════════════════════════════════
async function setCallStatus(callId, status) {
  try {
    const r = await fetch(`/api/call/${callId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note: `Durum "${statusLabel(status)}" olarak güncellendi.` })
    });
    const data = await r.json();
    if (!data.success) alert('Güncelleme başarısız: ' + (data.error || ''));
  } catch {
    alert('Sunucu hatası.');
  }
}

// ══════════════════════════════════════════════════════
// CAD — SİLME
// ══════════════════════════════════════════════════════
function openCADDeleteModal(callId) {
  pendingDeleteId = callId;
  document.getElementById('cad-delete-pass').value = '';
  document.getElementById('cad-delete-error').textContent = '';
  document.getElementById('delete-modal-cad').style.display = 'flex';
  setTimeout(() => document.getElementById('cad-delete-pass').focus(), 100);
}

function closeCADDeleteModal() {
  document.getElementById('delete-modal-cad').style.display = 'none';
  pendingDeleteId = null;
}

async function confirmCADDelete() {
  const pass  = document.getElementById('cad-delete-pass').value;
  const errEl = document.getElementById('cad-delete-error');
  if (!pass) { errEl.textContent = '► Şifre girilmedi'; return; }
  try {
    const r = await fetch(`/api/call/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletePassword: pass })
    });
    const data = await r.json();
    if (data.success) {
      closeCADDeleteModal();
    } else {
      errEl.textContent = '► ' + (data.error || 'Hata');
    }
  } catch {
    errEl.textContent = '► Sunucu hatası';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCADDeleteModal();
    closeAssignModal();
  }
});

// ══════════════════════════════════════════════════════
// CAD — ATAMA
// ══════════════════════════════════════════════════════
function openAssignModal(callId) {
  pendingAssignId = callId;
  const listEl = document.getElementById('assign-personnel-list');
  document.getElementById('assign-error').textContent = '';

  if (!activePersonnel.length) {
    listEl.innerHTML = '<div style="color:#4a6a8a;font-size:11px;padding:8px;">Aktif personel bulunamadı.</div>';
  } else {
    const call = allCalls.find(c => c.id === callId);
    listEl.innerHTML = activePersonnel.map(p => `
      <div class="assign-item ${call && call.assignedTo === p.username ? 'assign-selected' : ''}"
           onclick="doAssign('${p.username}')">
        <span class="assign-name">👤 ${escH(p.username)}</span>
        <span class="assign-time">${formatTime(p.loginAt)} giriş</span>
      </div>`).join('');
  }

  document.getElementById('assign-modal').style.display = 'flex';
}

function closeAssignModal() {
  document.getElementById('assign-modal').style.display = 'none';
  pendingAssignId = null;
}

async function doAssign(username) {
  if (!pendingAssignId) return;
  try {
    const r = await fetch(`/api/call/${pendingAssignId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignTo: username })
    });
    const data = await r.json();
    if (data.success) {
      closeAssignModal();
      cadLog('ATAMA', `${username} — Çağrı #${pendingAssignId ? pendingAssignId.slice(-4) : ''}`, 'sys');
    } else {
      document.getElementById('assign-error').textContent = '► ' + (data.error || 'Hata');
    }
  } catch {
    document.getElementById('assign-error').textContent = '► Sunucu hatası';
  }
}

async function removeAssignment() {
  if (!pendingAssignId) return;
  try {
    await fetch(`/api/call/${pendingAssignId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignTo: null })
    });
    closeAssignModal();
  } catch {}
}

// ══════════════════════════════════════════════════════
// CAD — PERSONEL PANEL (sağ taraf)
// ══════════════════════════════════════════════════════
function renderCADPersonnel() {
  const el = document.getElementById('cad-units');
  if (!el) return;
  if (!activePersonnel.length) {
    el.innerHTML = '<div class="cad-empty" style="font-size:10px;padding:8px">Aktif personel yok.</div>';
    return;
  }
  el.innerHTML = activePersonnel.map(p => {
    const assignedCall = allCalls.find(c => c.assignedTo === p.username && c.status !== 'kapatildi');
    const isBusy = !!assignedCall;
    const cls    = isBusy ? 'unit-busy' : 'unit-available';
    const status = isBusy ? 'MEŞGUL' : 'MÜSAİT';
    return `
      <div class="cad-unit ${cls}">
        <span class="unit-id">${escH(p.username)}</span>
        <span class="unit-status">${status}</span>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// PERSONEL UYGULAMASI
// ══════════════════════════════════════════════════════
function renderPersonnel() {
  const listEl   = document.getElementById('pers-list');
  const countEl  = document.getElementById('pers-count');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${activePersonnel.length} AKTİF PERSONEL`;

  if (!activePersonnel.length) {
    listEl.innerHTML = '<div class="pers-empty">Henüz aktif personel yok.</div>';
    return;
  }

  listEl.innerHTML = activePersonnel.map(p => {
    const assignedCall = allCalls.find(c => c.assignedTo === p.username && c.status !== 'kapatildi');
    const isBusy  = !!assignedCall;
    const minsAgo = Math.floor((Date.now() - p.lastSeen) / 60000);
    const seenStr = minsAgo < 1 ? 'Az önce' : `${minsAgo} dk önce`;
    return `
      <div class="pers-row">
        <span class="pr-name">👤 ${escH(p.username)}</span>
        <span class="pr-time">${formatTime(p.loginAt)}</span>
        <span class="pr-seen">${seenStr}</span>
        <span class="pr-status ${isBusy ? 'pr-busy' : 'pr-avail'}">${isBusy ? 'MEŞGUL' : 'MÜSAİT'}</span>
      </div>`;
  }).join('');
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
  // Panik çağrısı okunduysa/seçildiyse tray'i güncelle
  updatePanicTray();
}

function openCADFromPopup() {
  closePanicPopup();
  openApp('cagri');
  setTimeout(() => {
    if (panicCallId) selectCALLRow(panicCallId);
  }, 300);
}

// ══════════════════════════════════════════════════════
// SES UYARILARI
// ══════════════════════════════════════════════════════
function playPanicAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660, 880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.22);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.22);
    });
  } catch {}
}

function playNormalAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 550].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.2);
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
  personel: { winId:'win-personel', label:'👥 Personel' },
  mobil:    { winId:'win-mobil',    label:'📱 Mobil Cihazlar' },
  harita:   { winId:'win-harita',   label:'🗺️ Haritalar' },
  iletisim: { winId:'win-iletisim', label:'🎙️ İletişim' },
  ayarlar:  { winId:'win-ayarlar',  label:'⚙️ Ayarlar' },
};

function openApp(appKey) {
  const app = APP_MAP[appKey]; if (!app) return;
  const win = document.getElementById(app.winId); if (!win) return;

  // Harita açılınca leaflet başlat
  if (appKey === 'harita') {
    setTimeout(() => initMapApp(), 200);
  }

  // Arşiv iframe — sadece ilk açılışta yükle, sonra postMessage ile kullanıcı gönder
  if (appKey === 'arsiv') {
    const iframe = document.getElementById('arsiv-iframe');
    if (iframe && !iframe.src) {
      iframe.src = '/arsiv/';
      iframe.onload = () => {
        try { iframe.contentWindow.postMessage({ type: 'OCST_LOGIN', username: currentUser }, '*'); } catch {}
      };
    } else if (iframe && iframe.src) {
      try { iframe.contentWindow.postMessage({ type: 'OCST_LOGIN', username: currentUser }, '*'); } catch {}
    }
  }

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
  if (m && !m.contains(e.target) && s && !s.contains(e.target)) m.style.display = 'none';
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
// CAD LOG
// ══════════════════════════════════════════════════════
function cadLog(label, text, cls) {
  const logEl = document.getElementById('cad-log');
  if (!logEl) return;
  const now = new Date(), p = n => String(n).padStart(2,'0');
  const time = `${p(now.getHours())}:${p(now.getMinutes())}`;
  const div  = document.createElement('div');
  div.className = `log-entry ${cls==='panic'?'log-panic':cls==='sys'?'log-sys':''}`;
  div.textContent = `[${time}] ${label}: ${text}`;
  logEl.prepend(div);
  while (logEl.children.length > 40) logEl.lastChild.remove();
}

// ══════════════════════════════════════════════════════
// MOBİL CİHAZLAR UYGULAMASI
// ══════════════════════════════════════════════════════
function renderMobileDevices() {
  const el = document.getElementById('mobil-list');
  if (!el) return;

  if (!mobileDevices.length) {
    el.innerHTML = '<div class="cad-empty">► Bağlı mobil cihaz yok.</div>';
    return;
  }

  el.innerHTML = mobileDevices.map(d => {
    const locIcon  = d.locationActive ? '<span style="color:#00cc44">● KONUM AÇIK</span>' : '<span style="color:#6a8aaa">○ KONUM KAPALI</span>';
    const lastSeen = formatDateTime(d.lastSeen);
    const locTime  = d.locUpdatedAt ? formatDateTime(d.locUpdatedAt) : '—';
    return `<div class="mobil-row">
      <div class="mobil-row-top">
        <span class="mobil-username">📱 ${escH(d.username)}</span>
        ${locIcon}
      </div>
      <div class="mobil-meta">ID: ${escH(d.deviceId)} · Son görülme: ${lastSeen}</div>
      ${d.locationActive ? `<div class="mobil-meta">Konum güncellendi: ${locTime}</div>` : ''}
      <div class="mobil-actions">
        <button class="mobil-del-btn" onclick="deleteMobileDevice('${escH(d.deviceId)}')">[ SİL ]</button>
        <button class="mobil-ban-btn" onclick="banMobileDevice('${escH(d.deviceId)}')">[ ENGELLE ]</button>
      </div>
    </div>`;
  }).join('');
}

async function deleteMobileDevice(deviceId) {
  if (!confirm(`"${deviceId}" cihazını silmek istiyor musunuz?`)) return;
  try {
    await fetch(`/api/mobile/device/${encodeURIComponent(deviceId)}`, { method:'DELETE' });
    cadLog('MOBİL', `Cihaz silindi: ${deviceId}`, 'sys');
  } catch { alert('Hata oluştu.'); }
}

async function banMobileDevice(deviceId) {
  if (!confirm(`"${deviceId}" cihazını ENGELLEMEK istiyor musunuz? Tekrar bağlanamaz.`)) return;
  try {
    await fetch(`/api/mobile/ban/${encodeURIComponent(deviceId)}`, { method:'POST' });
    cadLog('MOBİL', `Cihaz engellendi: ${deviceId}`, 'sys');
  } catch { alert('Hata oluştu.'); }
}

// ══════════════════════════════════════════════════════
// HARİTALAR UYGULAMASI (Leaflet + OpenStreetMap)
// ══════════════════════════════════════════════════════
function initMapApp() {
  if (mapLeaflet) {
    mapLeaflet.invalidateSize();
    renderMapBlips();
    return;
  }
  const container = document.getElementById('map-container');
  if (!container) return;

  // Arama çubuğunu pencere gövdesine üstten ekle
  const winBody = container.parentElement;
  winBody.style.cssText += 'display:flex;flex-direction:column;overflow:hidden;';

  const searchBar = document.createElement('div');
  searchBar.id = 'map-search-bar';
  searchBar.style.cssText = [
    'display:flex;align-items:center;gap:6px;',
    'background:#080d14;border-bottom:1px solid #1a3a5a;',
    'padding:6px 10px;flex-shrink:0;position:relative;z-index:500;'
  ].join('');
  searchBar.innerHTML = `
    <span style="color:#4a9eff;font-size:13px;flex-shrink:0;">🔍</span>
    <input id="map-search-input" type="text" placeholder="Konum ara..." autocomplete="off" spellcheck="false"
      style="flex:1;background:rgba(0,20,50,.8);border:1px solid #1a3a5a;color:#c8d8e8;
             font-family:'Share Tech Mono',monospace;font-size:12px;padding:5px 10px;
             outline:none;letter-spacing:.5px;"
      oninput="onMapSearchInput()"
      onkeydown="if(event.key==='Enter')doMapSearch()"
      onfocus="this.style.borderColor='#4a9eff'"
      onblur="this.style.borderColor='#1a3a5a'">
    <button onclick="doMapSearch()"
      style="background:rgba(26,58,110,.5);border:1px solid #2a5a9a;color:#4a9eff;
             font-family:'Share Tech Mono',monospace;font-size:11px;padding:5px 12px;
             cursor:pointer;letter-spacing:1px;flex-shrink:0;">ARA</button>
    <div id="map-search-results"
      style="display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;
             background:#0d1420;border:1px solid #1a3a5a;border-top:none;
             max-height:220px;overflow-y:auto;"></div>
  `;
  winBody.insertBefore(searchBar, container);
  container.style.flex = '1';

  mapLeaflet = L.map('map-container', { zoomControl: true }).setView([39.9, 32.8], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(mapLeaflet);

  // Arama sonuçlarını haritaya tıklanınca kapat
  mapLeaflet.on('click', () => closeMapSearchResults());

  renderMapBlips();
}

// ─── HARİTA ARAMA ─────────────────────────────────────
let _mapSearchTimer  = null;
let _mapSearchMarker = null;

function onMapSearchInput() {
  clearTimeout(_mapSearchTimer);
  const val = document.getElementById('map-search-input')?.value.trim();
  if (!val) { closeMapSearchResults(); return; }
  _mapSearchTimer = setTimeout(doMapSearch, 500);
}

async function doMapSearch() {
  const input = document.getElementById('map-search-input');
  const resEl = document.getElementById('map-search-results');
  if (!input || !resEl) return;
  const q = input.value.trim();
  if (!q) return;

  resEl.style.display = 'block';
  resEl.innerHTML = `<div style="padding:8px 12px;font-size:11px;color:#6a8aaa;
    font-family:'Share Tech Mono',monospace;letter-spacing:1px;">⏳ Aranıyor...</div>`;

  try {
    const url  = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=7&accept-language=tr`;
    const data = await fetch(url, { headers: { 'Accept-Language':'tr', 'User-Agent':'OCST-Desktop/4.1' } }).then(r => r.json());

    if (!data.length) {
      resEl.innerHTML = `<div style="padding:8px 12px;font-size:11px;color:#6a8aaa;
        font-family:'Share Tech Mono',monospace;">► Sonuç bulunamadı.</div>`;
      return;
    }

    resEl.innerHTML = data.map(item => {
      const short = item.display_name.split(',').slice(0, 3).join(', ');
      const coords = `${parseFloat(item.lat).toFixed(5)}, ${parseFloat(item.lon).toFixed(5)}`;
      return `<div
        onclick="selectMapResult(${item.lat},${item.lon},${JSON.stringify(item.display_name)})"
        style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #0f1f30;
               font-family:'Share Tech Mono',monospace;transition:background .1s;"
        onmouseover="this.style.background='rgba(74,158,255,.12)'"
        onmouseout="this.style.background='transparent'">
        <div style="font-size:12px;color:#c8d8e8;">${escH(short)}</div>
        <div style="font-size:10px;color:#4a6a8a;margin-top:2px;">${coords}</div>
      </div>`;
    }).join('');
  } catch {
    resEl.innerHTML = `<div style="padding:8px 12px;font-size:11px;color:#ff4444;
      font-family:'Share Tech Mono',monospace;">► Bağlantı hatası.</div>`;
  }
}

function selectMapResult(lat, lng, displayName) {
  closeMapSearchResults();
  if (!mapLeaflet) return;

  mapLeaflet.setView([lat, lng], 15);

  if (_mapSearchMarker) { mapLeaflet.removeLayer(_mapSearchMarker); }

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:#ffaa00;border:3px solid #fff;
      border-radius:50%;box-shadow:0 0 0 3px rgba(255,170,0,.4),0 0 12px rgba(255,170,0,.8);"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10]
  });

  _mapSearchMarker = L.marker([lat, lng], { icon })
    .addTo(mapLeaflet)
    .bindTooltip(`<div style="font-family:'Share Tech Mono',monospace;font-size:11px;max-width:220px;">${escH(displayName.split(',').slice(0,3).join(', '))}</div>`,
      { permanent: false, direction: 'top', className: 'map-tt' })
    .openTooltip();

  const input = document.getElementById('map-search-input');
  if (input) input.value = displayName.split(',').slice(0, 3).join(', ');
}

function closeMapSearchResults() {
  const el = document.getElementById('map-search-results');
  if (el) el.style.display = 'none';
}

// Arama kutusu dışına tıklanınca kapat
document.addEventListener('click', e => {
  const bar = document.getElementById('map-search-bar');
  if (bar && !bar.contains(e.target)) closeMapSearchResults();
});

function renderMapBlips() {
  if (!mapLeaflet) return;

  const activeIds = new Set();

  mobileDevices.forEach(d => {
    if (!d.locationActive || d.lat == null || d.lng == null) {
      // Blip yoksa veya konum kapalıysa markeri kaldır
      if (mapBlips[d.deviceId]) {
        mapLeaflet.removeLayer(mapBlips[d.deviceId]);
        delete mapBlips[d.deviceId];
      }
      return;
    }

    activeIds.add(d.deviceId);

    // Kırmızı animasyonlu blip ikonu
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-blip-wrap">
               <div class="map-blip-pulse"></div>
               <div class="map-blip-dot"></div>
             </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -12],
    });

    if (mapBlips[d.deviceId]) {
      mapBlips[d.deviceId].setLatLng([d.lat, d.lng]);
    } else {
      const marker = L.marker([d.lat, d.lng], { icon })
        .addTo(mapLeaflet)
        .bindTooltip(`<div class="map-tooltip">${escH(d.username)}</div>`, {
          permanent: false,
          direction: 'top',
          className: 'map-tt',
        });
      mapBlips[d.deviceId] = marker;
    }
  });

  // Artık aktif olmayan markerleri temizle
  Object.keys(mapBlips).forEach(id => {
    if (!activeIds.has(id)) {
      mapLeaflet.removeLayer(mapBlips[id]);
      delete mapBlips[id];
    }
  });
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
