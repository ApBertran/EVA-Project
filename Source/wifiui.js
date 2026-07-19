/* Wi-Fi status pill and connect modal. */
let wifiState = { available: false, connected: false };
let wifiNetworks = [];
let wifiBusy = false;

function renderWifiPill() {
  const pill = document.getElementById('wifi-pill');
  if (!pill) return;
  pill.classList.toggle('off', !wifiState.connected);
  pill.title = wifiState.connected ? `Connected to ${wifiState.ssid}` : 'Not connected';
}

function renderWifiModal() {
  const badge = document.getElementById('wifi-state');
  if (badge) badge.innerText = wifiState.connected ? wifiState.ssid || 'Connected' : 'Not connected';

  const list = document.getElementById('wifi-list');
  if (!list) return;
  if (wifiBusy) {
    list.innerHTML = '<div class="dim">Scanning…</div>';
    return;
  }
  if (!wifiNetworks.length) {
    list.innerHTML = '<div class="dim">No networks found. Tap Scan to search again.</div>';
    return;
  }
  list.innerHTML = wifiNetworks
    .map((n) => {
      const ssid = String(n.ssid).replace(/'/g, "\\'");
      /* signal is 0-100 from nmcli; four bars keeps it glanceable */
      const bars = Math.max(1, Math.ceil(n.signal / 25));
      return `<div class="bt-row ${n.active ? 'on' : ''}">
        <div class="bt-info">
          <div class="bt-name">${n.ssid} ${n.secured ? '&#128274;' : ''}</div>
          <div class="bt-mac">${'|'.repeat(bars)}${'.'.repeat(4 - bars)} ${n.signal}%${n.active ? ' &middot; connected' : ''}</div>
        </div>
        <div class="bt-actions">
          ${n.active
            ? '<button class="ghost-btn" onclick="wifiDisconnect()">Disconnect</button>'
            : `<button class="ghost-btn" onclick="wifiConnect('${ssid}', ${n.secured})">Connect</button>`}
        </div>
      </div>`;
    })
    .join('');
}

function openWifi() {
  document.getElementById('wifi-modal').classList.add('open');
  socket.emit('wifi:state');
  wifiScan();
}

function closeWifi() {
  document.getElementById('wifi-modal').classList.remove('open');
}

function wifiScan() {
  wifiBusy = true;
  renderWifiModal();
  socket.emit('wifi:scan', { force: true });
}

/* A saved profile reconnects without a password, so only prompt when the
   network is secured AND unknown to NetworkManager. */
async function wifiConnect(ssid, secured) {
  if (secured) {
    const pw = await askText(`Password for ${ssid}`, '');
    if (pw === null) return;
    socket.emit('wifi:connect', { ssid, password: pw || undefined });
  } else {
    socket.emit('wifi:connect', { ssid });
  }
  wifiBusy = true;
  renderWifiModal();
}

function wifiDisconnect() {
  socket.emit('wifi:disconnect');
}

socket.on('wifi:state', (state) => {
  if (!state) return;
  wifiState = state;
  renderWifiPill();
  renderWifiModal();
});

socket.on('wifi:networks', (payload) => {
  wifiBusy = false;
  wifiNetworks = (payload && payload.networks) || [];
  renderWifiModal();
});

/* GPS has no dedicated module on the client, and its pill was hardcoded to
   look connected. Drive it from the same status the rest of the app uses. */
socket.on('gps:status', (payload) => {
  const pill = document.getElementById('gps-pill');
  if (!pill || !payload) return;
  const live = payload.status === 'live';
  pill.classList.toggle('off', !live);
  pill.title = live ? 'GPS fix acquired' : `GPS ${payload.status || 'unavailable'}`;
});

document.addEventListener('DOMContentLoaded', () => {
  socket.emit('wifi:state');
  setInterval(() => socket.emit('wifi:state'), 15000);
});
