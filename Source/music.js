/* Music tab: AVRCP control of the paired phone.
 *
 * The phone is the source of truth for playback - EVA sends commands and then
 * reports whatever the phone actually did. State is never assumed locally,
 * because the user can also skip a track on the handset itself.
 */
let btDevices = [];
let btPlaying = { available: false };
let btVolume = null;
let btDiscoverable = false;
let scanning = false;

function fmtTime(ms) {
  if (typeof ms !== 'number' || ms < 0) return '--:--';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function renderNowPlaying() {
  const wrap = document.getElementById('music-now');
  if (!wrap) return;
  const p = btPlaying || {};
  const connected = btDevices.some((d) => d.connected);

  if (!connected) {
    wrap.innerHTML = `<div class="music-idle">
      <svg class="music-idle-icon" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      <div class="music-idle-title">No phone connected</div>
      <div class="music-idle-sub">Open <b>BT</b> in the status bar to pair your phone.</div>
      <button class="primary-btn" onclick="openBluetooth()">Bluetooth Settings</button>
    </div>`;
    return;
  }
  if (!p.available) {
    wrap.innerHTML = `<div class="music-idle">
      <svg class="music-idle-icon" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      <div class="music-idle-title">Connected</div>
      <div class="music-idle-sub">Start playing on your phone and it will appear here.</div>
    </div>`;
    return;
  }

  const playing = String(p.status).toLowerCase() === 'playing';
  const pct = p.durationMs ? Math.min(100, ((p.positionMs || 0) / p.durationMs) * 100) : 0;

  /* Album art is not carried over AVRCP, so the artwork slot shows a glyph
     until the Spotify Web API layer can fill it in when online. */
  /* Album art is not carried over AVRCP. Rather than a dead grey box, the
     placeholder is a record that turns while playing - it doubles as a
     play/pause indicator readable from the driver's seat. */
  wrap.innerHTML = `
    <div class="album-art ${playing ? 'spinning' : ''}" id="album-art">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="27"/>
        <circle cx="32" cy="32" r="19"/>
        <circle cx="32" cy="32" r="12"/>
        <circle cx="32" cy="32" r="3.4" class="hub"/>
      </svg>
    </div>
    <div class="track-title">${p.title || 'Unknown track'}</div>
    <div class="track-artist">${p.artist || ''}${p.album ? ' &middot; ' + p.album : ''}</div>
    <div class="track-bar"><i style="width:${pct}%"></i></div>
    <div class="track-times"><span>${fmtTime(p.positionMs)}</span><span>${fmtTime(p.durationMs)}</span></div>
    <div class="transport">
      <button class="tbtn" onclick="btControl('previous')" aria-label="Previous">
        <svg viewBox="0 0 24 24"><path d="M18 5v14L8 12z"/><rect x="5" y="5" width="2.2" height="14" rx="1"/></svg>
      </button>
      <button class="tbtn primary" onclick="btControl('${playing ? 'pause' : 'play'}')" aria-label="${playing ? 'Pause' : 'Play'}">
        ${playing
          ? '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M7 4v16l14-8z"/></svg>'}
      </button>
      <button class="tbtn" onclick="btControl('next')" aria-label="Next">
        <svg viewBox="0 0 24 24"><path d="M6 5v14l10-7z"/><rect x="16.8" y="5" width="2.2" height="14" rx="1"/></svg>
      </button>
    </div>
    <div class="vol-row">
      <span class="vol-label">VOL</span>
      <input type="range" class="slider" id="vol-slider" min="0" max="100" step="1"
             value="${btVolume === null ? 50 : btVolume}" oninput="btSetVolume(this.value)">
      <span class="vol-val" id="vol-val">${btVolume === null ? '--' : btVolume}</span>
    </div>`;
}

function renderDevices() {
  const el = document.getElementById('music-devices');
  if (!el) return;
  if (!btDevices.length) {
    el.innerHTML = '<div class="dim">No devices yet. Make EVA visible, then pair from your phone.</div>';
    return;
  }
  el.innerHTML = btDevices
    .map((d) => {
      const mac = d.mac.replace(/'/g, '');
      return `<div class="bt-row ${d.connected ? 'on' : ''}">
        <div class="bt-info">
          <div class="bt-name">${d.name}</div>
          <div class="bt-mac">${d.mac}${d.paired ? ' &middot; paired' : ''}</div>
        </div>
        <div class="bt-actions">
          ${d.connected
            ? `<button class="ghost-btn" onclick="btDisconnect('${mac}')">Disconnect</button>`
            : `<button class="ghost-btn" onclick="btConnect('${mac}')">Connect</button>`}
          <button class="ghost-btn danger" onclick="btForget('${mac}')">Forget</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderBtHeader() {
  const badge = document.getElementById('bt-visible-state');
  if (badge) badge.innerText = btDiscoverable ? 'Visible' : 'Hidden';
  const scanBtn = document.getElementById('bt-scan-btn');
  if (scanBtn) scanBtn.innerText = scanning ? 'Stop Scan' : 'Scan';
}

function btControl(cmd) {
  socket.emit('bt:control', { cmd });
}

function btSetVolume(v) {
  const label = document.getElementById('vol-val');
  if (label) label.innerText = v;
  socket.emit('bt:volume', { percent: Number(v) });
}

function btConnect(mac) {
  socket.emit('bt:connect', { mac });
}

function btDisconnect(mac) {
  socket.emit('bt:disconnect', { mac });
}

function btForget(mac) {
  socket.emit('bt:forget', { mac });
}

/* Making EVA visible is the reliable direction: a phone only advertises while
   its Bluetooth settings screen is open, so scanning for one usually fails. */
function btToggleVisible() {
  socket.emit('bt:discoverable', { on: !btDiscoverable, seconds: 300 });
}

function btToggleScan() {
  scanning = !scanning;
  socket.emit('bt:scan', { on: scanning });
  renderBtHeader();
  if (scanning) setTimeout(() => socket.emit('bt:state'), 8000);
}

function btManualConnect() {
  const input = document.getElementById('bt-mac-input');
  const mac = (input.value || '').trim().toUpperCase();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
    const toast = document.getElementById('toast');
    toast.innerText = 'Enter a MAC like AA:BB:CC:DD:EE:FF';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
    return;
  }
  socket.emit('bt:connect', { mac });
  input.value = '';
}

function openBluetooth() {
  document.getElementById('bt-modal').classList.add('open');
  socket.emit('bt:state');
}

function closeBluetooth() {
  document.getElementById('bt-modal').classList.remove('open');
  /* stop advertising when the user walks away from the pairing screen */
  if (btDiscoverable) socket.emit('bt:discoverable', { on: false });
  if (scanning) { scanning = false; socket.emit('bt:scan', { on: false }); }
}

function renderBtPill() {
  const pill = document.getElementById('bt-pill');
  if (!pill) return;
  const dev = btDevices.find((d) => d.connected);
  pill.classList.toggle('off', !dev);
  pill.innerText = dev ? 'BT' : 'BT';
  pill.title = dev ? `Connected to ${dev.name}` : 'No device connected';
}

socket.on('bt:state', (state) => {
  if (!state) return;
  btDevices = state.devices || [];
  btDiscoverable = !!state.discoverable;
  if (typeof state.volume === 'number') btVolume = state.volume;
  if (state.playing) btPlaying = state.playing;
  renderBtHeader();
  renderDevices();
  renderNowPlaying();
  renderBtPill();
});

socket.on('bt:playing', (playing) => {
  btPlaying = playing || { available: false };
  /* don't fight the user's finger while they are dragging the volume slider */
  if (document.activeElement && document.activeElement.id === 'vol-slider') return;
  renderNowPlaying();
});

socket.on('bt:volume', (payload) => {
  if (payload && typeof payload.percent === 'number') btVolume = payload.percent;
});

document.addEventListener('DOMContentLoaded', () => {
  socket.emit('bt:state');
  setInterval(() => socket.emit('bt:state'), 10000);
});
