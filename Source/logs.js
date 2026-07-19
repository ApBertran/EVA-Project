const THUMBS = {
  testing: {
    label: 'Testing',
    accent: '#3fd0b0',
    svg: '<path d="M26 6v12L14 34h36L38 18V6"/><path d="M22 6h20"/><path d="M20 26h24"/><circle cx="28" cy="29" r="1.6"/><circle cx="37" cy="30" r="1.2"/>'
  },
  cruising: {
    label: 'Cruising',
    accent: '#b7babc',
    svg: '<path d="M4 32h56"/><path d="M24 32 30 10h4l6 22"/><path d="M31 14v3M31 21v3M31 28v2"/><circle cx="48" cy="14" r="6"/>'
  },
  performance: {
    label: 'Performance',
    accent: '#ff7a33',
    svg: '<circle cx="32" cy="22" r="13"/><path d="M32 22 40 15"/><path d="M32 5v4"/><path d="M26 5h12"/><path d="M19 12l-3-3M45 12l3-3"/>'
  },
  canyon: {
    label: 'Canyon',
    accent: '#2a8c78',
    svg: '<path d="M2 34 20 10l10 13 8-9 22 20z"/><path d="M22 34c4-6 12-4 12-10s8-6 10-2"/>'
  },
  track: {
    label: 'Track Day',
    accent: '#e9edee',
    svg: '<path d="M14 34V6"/><path d="M14 8h34v16H14z"/><path d="M14 8h8.5v5.3H14zM31 8h8.5v5.3H31zM22.5 13.3H31v5.3h-8.5zM39.5 13.3H48v5.3h-8.5zM14 18.6h8.5V24H14zM31 18.6h8.5V24H31z" fill="currentColor" stroke="none" opacity="0.55"/>'
  },
  night: {
    label: 'Night Run',
    accent: '#6fa8c5',
    svg: '<path d="M38 8a14 14 0 1 0 12 21A15 15 0 0 1 38 8z"/><path d="M16 12l1.2 3.2L20.4 16l-3.2 1.2L16 20l-1.2-2.8L11.6 16l3.2-.8z"/><path d="M22 26l.8 2 2 .8-2 .8L22 32l-.8-2.4-2-.8 2-.8z"/>'
  }
};

const ROAD_TYPES = ['Highway', 'Canyon', 'City', 'Backroad', 'Track', 'Parking Lot', 'Gravel', 'Rough'];

let currentPath = '';
let recState = { recording: false };
let gpsState = { status: 'unavailable' };
let selectedPath = null;
let entriesByPath = {};
let detailPath = null;
let detailSeries = null;
let folderList = [];
let moveTarget = null;
let pendingThumb = 'cruising';
let pendingRoads = new Set();
let pendingPids = new Set();
let obdPidTable = {};
let obdSupported = null;
let elapsedTimer = null;
let textModalResolve = null;

function thumbMarkup(key) {
  const t = THUMBS[key] || THUMBS.cruising;
  return `<div class="thumb" style="color:${t.accent}"><svg viewBox="0 0 64 40">${t.svg}</svg></div>`;
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const month = d.toLocaleString(undefined, { month: 'short' });
  const hours = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${month} ${d.getDate()}, ${hours}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

function askText(title, initial) {
  document.getElementById('text-modal-title').innerText = title;
  const input = document.getElementById('text-modal-input');
  input.value = initial || '';
  document.getElementById('text-modal').classList.add('open');
  setTimeout(() => input.focus(), 50);
  return new Promise((resolve) => {
    textModalResolve = resolve;
  });
}

function textModalConfirm() {
  const value = document.getElementById('text-modal-input').value.trim();
  document.getElementById('text-modal').classList.remove('open');
  if (textModalResolve) textModalResolve(value || null);
  textModalResolve = null;
}

function textModalCancel() {
  document.getElementById('text-modal').classList.remove('open');
  if (textModalResolve) textModalResolve(null);
  textModalResolve = null;
}

function refresh() {
  socket.emit('logs:list', { path: currentPath });
}

function openFolder(path) {
  currentPath = path;
  refresh();
}

function goUp() {
  currentPath = currentPath.split('/').slice(0, -1).join('/');
  refresh();
}

async function newFolder() {
  const name = await askText('New Folder', '');
  if (name) socket.emit('logs:mkdir', { path: currentPath, name });
}

async function renameItem(path) {
  const name = await askText('Rename', '');
  if (name) socket.emit('logs:rename', { path, name, parent: currentPath });
}

function deleteItem(path, label) {
  document.getElementById('confirm-text').innerText = `Delete "${label}"? This cannot be undone.`;
  const modal = document.getElementById('confirm-modal');
  modal.classList.add('open');
  document.getElementById('confirm-yes').onclick = () => {
    socket.emit('logs:delete', { path, parent: currentPath });
    modal.classList.remove('open');
  };
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
}

function renderBreadcrumb() {
  const el = document.getElementById('logs-breadcrumb');
  const parts = currentPath ? currentPath.split('/') : [];
  let html = `<button class="crumb" onclick="openFolder('')">Logs</button>`;
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    html += `<span class="crumb-sep">/</span><button class="crumb" onclick="openFolder('${acc.replace(/'/g, "\\'")}')">${part}</button>`;
  }
  el.innerHTML = html;
  document.getElementById('logs-up').style.visibility = parts.length ? 'visible' : 'hidden';
}

function renderListing(data) {
  renderBreadcrumb();
  entriesByPath = {};

  const folderHtml = data.folders.map((folder) => {
    const p = folder.path.replace(/'/g, "\\'");
    const sel = selectedPath === folder.path ? 'selected' : '';
    return `
      <div class="folder-tile ${sel}">
        <button class="folder-open" onclick="openFolder('${p}')">
          <svg viewBox="0 0 64 40"><path d="M6 34V8h16l5 6h31v20z"/></svg>
          <span>${folder.name}</span>
        </button>
        <button class="folder-more" onclick="selectEntry('${p}')">&#8943;</button>
        <div class="folder-actions">
          <button onclick="renameItem('${p}')">Rename</button>
          <button class="danger" onclick="deleteItem('${p}','${folder.name.replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
  document.getElementById('logs-folders').innerHTML = folderHtml;

  const cards = data.entries.map((entry) => {
    entriesByPath[entry.path] = entry;
    const p = entry.path.replace(/'/g, "\\'");
    const flag = entry.status === 'interrupted' ? '<span class="chip warn">Interrupted</span>' : '';
    return `
      <div class="log-card entry ${selectedPath === entry.path ? 'selected' : ''}" onclick="selectEntry('${p}')">
        ${thumbMarkup(entry.thumbnail)}
        <div class="card-body">
          <div class="card-name">${entry.name}</div>
          <div class="card-meta">${fmtDate(entry.startedAt)}</div>
          <div class="card-meta strong">${fmtDuration(entry.durationMs)}${flag ? ' ' + flag : ''}</div>
        </div>
        <div class="card-actions" onclick="event.stopPropagation()">
          <button class="view" onclick="openDetail('${p}')">View</button>
          <button onclick="renameItem('${p}')">Rename</button>
          <button onclick="openMove('${p}')">Move</button>
          <button class="danger" onclick="deleteItem('${p}','${entry.name.replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('logs-grid').innerHTML = cards ||
    (data.folders.length ? '' : '<div class="empty"><span>No entries here</span></div>');
}

function selectEntry(path) {
  selectedPath = selectedPath === path ? null : path;
  refresh();
}

function openDetail(path) {
  const e = entriesByPath[path];
  if (!e) return;
  detailPath = path;
  document.getElementById('detail-title').innerText = e.name;
  document.getElementById('detail-body').innerHTML = '<div class="detail-loading">Analysing\u2026</div>';
  document.getElementById('detail-modal').classList.add('open');
  socket.emit('logs:analysis', { path });
}

function renderDetail(payload) {
  if (payload.path !== detailPath) return;
  const e = entriesByPath[payload.path];
  const s = payload.summary;
  const series = payload.series;
  if (!e) return;

  if (!s) {
    document.getElementById('detail-body').innerHTML = '<div class="detail-loading">No analysable data in this log.</div>';
    return;
  }

  const counts = e.counts || {};
  const hasGps = s.gps && series && series.track && series.track.length > 1;

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-tabs">
      <button class="dtab active" onclick="showDetailTab(event,'overview')">Overview</button>
      <button class="dtab" onclick="showDetailTab(event,'grip')">Grip</button>
      <button class="dtab" onclick="showDetailTab(event,'map')">Map</button>
      ${s.obd ? `<button class="dtab" onclick="showDetailTab(event,'engine')">Engine</button>` : ''}
    </div>

    <div class="dpane" id="dpane-overview">
      <div class="stat-row">
        <div class="stat"><span>Hardest brake</span><b>${s.events.hardestBrake.toFixed(2)}<i>g</i></b></div>
        <div class="stat"><span>Hardest corner</span><b>${s.events.hardestCorner.toFixed(2)}<i>g</i></b></div>
        <div class="stat"><span>Sustained</span><b>${s.combined.sustained.toFixed(2)}<i>g</i></b></div>
        <div class="stat"><span>Smoothness</span><b>${s.smoothness.toFixed(2)}<i>g/s</i></b></div>
      </div>
      <canvas class="chart tall" id="chart-timeline"></canvas>
      <div class="chart-legend"><i style="background:#ff7a33"></i> combined g <i style="background:#3fd0b0"></i> lateral</div>
      <div class="detail-grid">
        <div><span>Started</span><b>${fmtDate(e.startedAt)}</b></div>
        <div><span>Duration</span><b>${fmtDuration(e.durationMs)}</b></div>
        <div><span>Braking events</span><b>${s.events.braking}</b></div>
        <div><span>Corners L / R</span><b>${s.events.cornersLeft} / ${s.events.cornersRight}</b></div>
        <div><span>Road roughness</span><b>${s.roughness.toFixed(3)} g rms</b></div>
        <div><span>Samples</span><b>${counts.gforce || s.samples}</b></div>
        ${hasGps ? `<div><span>Distance</span><b>${s.gps.distanceKm.toFixed(2)} km</b></div><div><span>Max speed</span><b>${s.gps.maxSpeedKph.toFixed(0)} km/h</b></div>` : ''}
      </div>
      ${(e.roadTypes || []).length ? `<div class="detail-section"><span>Road</span><div class="card-chips">${e.roadTypes.map((r) => `<span class="chip soft">${r}</span>`).join('')}</div></div>` : ''}
      ${e.notes ? `<div class="detail-section"><span>Notes</span><p class="detail-notes">${e.notes}</p></div>` : ''}
    </div>

    <div class="dpane" id="dpane-grip" style="display:none">
      <canvas class="chart square" id="chart-gg"></canvas>
      <p class="chart-note">Each dot is a moment in the drive. A round, filled shape means you blend braking into cornering; a cross means you brake, then turn.</p>
      <div class="detail-grid">
        <div><span>Peak lateral</span><b>${s.lateral.peak.toFixed(2)} g</b></div>
        <div><span>Sustained lateral</span><b>${s.lateral.sustained.toFixed(2)} g</b></div>
        <div><span>Peak braking</span><b>${s.longitudinal.peakBraking.toFixed(2)} g</b></div>
        <div><span>Peak accel</span><b>${s.longitudinal.peakAccel.toFixed(2)} g</b></div>
      </div>
      <div class="detail-section"><span>Time at g</span>
        <div class="hist">${s.histogram.map((b) => `<div class="hist-bar"><i style="height:${Math.min(100, (b.seconds / Math.max(1, ...s.histogram.map((x) => x.seconds))) * 100)}%"></i><em>${b.to}</em></div>`).join('')}</div>
      </div>
    </div>

    ${s.obd ? `<div class="dpane" id="dpane-engine" style="display:none">
      <div class="stat-row">
        <div class="stat"><span>Distance</span><b>${s.obd.derived.distanceMi.toFixed(1)}<i>mi</i></b></div>
        <div class="stat"><span>Fuel used</span><b>${s.obd.derived.fuelGal.toFixed(2)}<i>gal</i></b></div>
        <div class="stat"><span>Average</span><b>${s.obd.derived.avgMpg || '-'}<i>mpg</i></b></div>
        <div class="stat"><span>Max RPM</span><b>${s.obd.derived.maxRpm || '-'}</b></div>
      </div>
      ${s.obd.gears && s.obd.gears.length ? `<div class="detail-section"><span>Gears used</span>
        <div class="gear-table">${s.obd.gears.map((g) => `<div class="gear-row"><b>${g.gear}</b><span>${g.mphPer1000} mph / 1000 rpm</span><i style="width:${g.share}%"></i><em>${g.share}%</em></div>`).join('')}</div></div>` : ''}
      ${Object.keys(s.obd.health).length ? `<div class="detail-section"><span>Fuel trim</span><div class="detail-grid">
        ${s.obd.health.ltftB1 !== undefined ? `<div><span>Long term B1</span><b>${s.obd.health.ltftB1}%</b></div>` : ''}
        ${s.obd.health.ltftB2 !== undefined ? `<div><span>Long term B2</span><b>${s.obd.health.ltftB2}%</b></div>` : ''}
        ${s.obd.health.bankSpread !== undefined ? `<div><span>Bank spread</span><b>${s.obd.health.bankSpread}%</b></div>` : ''}
      </div></div>` : ''}
      ${s.tireCal ? `<div class="detail-section"><span>Tire calibration</span><p class="chart-note">GPS suggests a speed factor of <b>${s.tireCal.factor}</b> from ${s.tireCal.samples} samples${s.tireCal.confident ? '' : ' (low confidence - needs steadier cruising)'}.${s.tireCal.confident ? ` <button class="ghost-btn" onclick="applyTireFactor(${s.tireCal.factor})">Apply</button>` : ''}</p></div>` : ''}
      <div class="detail-section"><span>Channels recorded</span><div class="card-chips">${Object.values(s.obd.channels).map((c) => `<span class="chip soft">${c.name} ${c.min}-${c.max}${c.unit}</span>`).join('')}</div></div>
    </div>` : ''}

    <div class="dpane" id="dpane-map" style="display:none">
      <canvas class="chart tall" id="chart-track"></canvas>
      <p class="chart-note">${hasGps ? 'Route coloured by combined g-force. Teal dot marks the start.' : 'No location source was recorded for this drive. Connect GPS in Settings to build heat maps.'}</p>
    </div>`;

  requestAnimationFrame(() => {
    if (series) {
      drawTimeline(document.getElementById('chart-timeline'), series.series || []);
      detailSeries = series;
    }
  });
}

function showDetailTab(event, name) {
  document.querySelectorAll('.dtab').forEach((t) => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  ['overview', 'grip', 'map', 'engine'].forEach((n) => {
    const pane = document.getElementById(`dpane-${n}`);
    if (pane) pane.style.display = n === name ? 'block' : 'none';
  });
  requestAnimationFrame(() => {
    if (!detailSeries) return;
    if (name === 'grip') drawFrictionCircle(document.getElementById('chart-gg'), detailSeries.scatter || [], Math.max(...(detailSeries.scatter || [[0, 0]]).map((p) => Math.hypot(p[0], p[1]))));
    if (name === 'map') drawTrack(document.getElementById('chart-track'), detailSeries.track || []);
    if (name === 'overview') drawTimeline(document.getElementById('chart-timeline'), detailSeries.series || []);
  });
}

function closeDetail() {
  document.getElementById('detail-modal').classList.remove('open');
}

function renderBanner() {
  const banner = document.getElementById('rec-banner');
  if (!recState.recording) {
    banner.classList.remove('active');
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    return;
  }
  banner.classList.add('active');
  document.getElementById('rec-name').innerText = recState.name;
  const tick = () => {
    document.getElementById('rec-elapsed').innerText = fmtDuration(Date.now() - recState.startedAt);
    const c = recState.counts || {};
    document.getElementById('rec-counts').innerText = `${c.gforce || 0} samples`;
  };
  tick();
  if (!elapsedTimer) elapsedTimer = setInterval(tick, 1000);
}

function openNewEntry() {
  pendingThumb = 'cruising';
  pendingRoads = new Set();
  document.getElementById('entry-name').value = '';
  document.getElementById('entry-notes').value = '';
  document.getElementById('src-gforce').checked = true;
  const gpsBox = document.getElementById('src-gps');
  const gpsAvailable = gpsState.status === 'live';
  gpsBox.checked = gpsAvailable;
  gpsBox.disabled = !gpsAvailable;
  document.getElementById('gps-hint').innerText = gpsAvailable
    ? 'Location source live'
    : 'No location source — configure it in Settings';
  const obdBox = document.getElementById('src-obd');
  const obdReady = obdState && obdState.status === 'ready';
  obdBox.checked = false;
  obdBox.disabled = !obdReady;
  document.getElementById('obd-hint').innerText = obdReady
    ? 'Engine connected'
    : 'Car not connected - see Diagnostics';
  if (obdReady) socket.emit('obd:supported');
  renderThumbPicker();
  renderRoadPicker();
  renderPidPicker();
  document.getElementById('entry-modal').classList.add('open');
}

function closeNewEntry() {
  document.getElementById('entry-modal').classList.remove('open');
}

function renderThumbPicker() {
  document.getElementById('thumb-picker').innerHTML = Object.entries(THUMBS)
    .map(
      ([key, t]) => `
      <button class="thumb-option ${key === pendingThumb ? 'selected' : ''}" onclick="pickThumb('${key}')">
        <div class="thumb" style="color:${t.accent}"><svg viewBox="0 0 64 40">${t.svg}</svg></div>
        <span>${t.label}</span>
      </button>`
    )
    .join('');
}

function pickThumb(key) {
  pendingThumb = key;
  renderThumbPicker();
}

function renderRoadPicker() {
  document.getElementById('road-picker').innerHTML = ROAD_TYPES.map(
    (road) => `<button class="road-chip ${pendingRoads.has(road) ? 'selected' : ''}" onclick="toggleRoad('${road}')">${road}</button>`
  ).join('');
}

function toggleRoad(road) {
  if (pendingRoads.has(road)) pendingRoads.delete(road);
  else pendingRoads.add(road);
  renderRoadPicker();
}

function startRecording() {
  socket.emit('logs:start', {
    folder: currentPath,
    name: document.getElementById('entry-name').value.trim() || 'Untitled Drive',
    thumbnail: pendingThumb,
    roadTypes: Array.from(pendingRoads),
    notes: document.getElementById('entry-notes').value.trim(),
    sources: {
      gforce: document.getElementById('src-gforce').checked,
      gps: document.getElementById('src-gps').checked,
      obd: document.getElementById('src-obd').checked
    },
    obdPids: Array.from(pendingPids)
  });
  closeNewEntry();
}

function stopRecording() {
  socket.emit('logs:stop');
}

function applyGpsConfig() {
  const mode = document.getElementById('gps-mode').value;
  socket.emit('gps:configure', {
    mode,
    host: document.getElementById('gps-host').value.trim(),
    port: document.getElementById('gps-port').value.trim(),
    device: document.getElementById('gps-device').value.trim(),
    baud: document.getElementById('gps-baud').value.trim()
  });
}

function renderGpsFields() {
  const mode = document.getElementById('gps-mode').value;
  document.getElementById('gps-tcp-fields').style.display = mode === 'tcp' ? 'block' : 'none';
  document.getElementById('gps-serial-fields').style.display = mode === 'serial' ? 'block' : 'none';
}

socket.on('logs:listing', renderListing);

socket.on('logs:state', (state) => {
  recState = state;
  renderBanner();
});

socket.on('logs:finished', () => refresh());

socket.on('gps:status', (payload) => {
  gpsState = payload;
  const pill = document.getElementById('gps-pill');
  if (pill) pill.classList.toggle('off', payload.status !== 'live');
  const label = document.getElementById('gps-status-label');
  if (label) {
    label.innerText = payload.detail ? `${payload.status} — ${payload.detail}` : payload.status;
  }
});

socket.on('config', (payload) => {
  if (!payload.gps) return;
  const mode = document.getElementById('gps-mode');
  if (!mode) return;
  mode.value = payload.gps.mode || 'off';
  document.getElementById('gps-host').value = payload.gps.host || '';
  document.getElementById('gps-port').value = payload.gps.port || '11123';
  document.getElementById('gps-device').value = payload.gps.device || '/dev/ttyACM0';
  document.getElementById('gps-baud').value = payload.gps.baud || '9600';
  renderGpsFields();
});

socket.on('logs:error', (payload) => {
  const toast = document.getElementById('toast');
  toast.innerText = payload.message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
});

document.addEventListener('DOMContentLoaded', () => {
  refresh();
  socket.emit('logs:state');
});

refresh();

function openMove(path) {
  moveTarget = path;
  socket.emit('logs:folders');
  document.getElementById('move-modal').classList.add('open');
}

function closeMove() {
  document.getElementById('move-modal').classList.remove('open');
  moveTarget = null;
}

function renderFolderChoices() {
  const rows = [`<button class="move-row" onclick="doMove('')"><svg viewBox="0 0 64 40"><path d="M6 34V8h16l5 6h31v20z"/></svg><span>Logs (root)</span></button>`]
    .concat(folderList.map((f) => `<button class="move-row" style="padding-left:${0.8 + (f.depth - 1) * 1.2}rem" onclick="doMove('${f.path.replace(/'/g, "\\'")}')"><svg viewBox="0 0 64 40"><path d="M6 34V8h16l5 6h31v20z"/></svg><span>${f.name}</span></button>`));
  document.getElementById('move-list').innerHTML = rows.join('');
}

function doMove(dest) {
  if (moveTarget === null) return;
  socket.emit('logs:move', { path: moveTarget, dest, parent: currentPath });
  closeMove();
  selectedPath = null;
}

function openPurge() {
  document.getElementById('purge-modal').classList.add('open');
  updatePurgePreview();
}

function closePurge() {
  document.getElementById('purge-modal').classList.remove('open');
}

function purgeDays() {
  return Number(document.getElementById('purge-slider').value);
}

function updatePurgePreview() {
  const days = purgeDays();
  document.getElementById('purge-days').innerText = days >= 365 ? '1 year' : `${days} days`;
  socket.emit('logs:purgePreview', { days });
}

function confirmPurge() {
  socket.emit('logs:purge', { days: purgeDays(), parent: currentPath });
  closePurge();
}

function fmtBytes(b) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

socket.on('logs:folders', (list) => {
  folderList = list;
  renderFolderChoices();
});

socket.on('logs:analysis', renderDetail);

socket.on('logs:purgePreview', (p) => {
  const el = document.getElementById('purge-preview');
  if (!el) return;
  el.innerHTML = p.count
    ? `<b>${p.count}</b> log${p.count === 1 ? '' : 's'} &middot; <b>${fmtBytes(p.bytes)}</b> freed<div class="dim">${p.names.join(', ')}${p.count > p.names.length ? ' and more' : ''}</div>`
    : '<span class="dim">Nothing older than this</span>';
  const btn = document.getElementById('purge-confirm');
  btn.disabled = !p.count;
  btn.classList.toggle('disabled', !p.count);
});

socket.on('logs:purged', (r) => {
  const toast = document.getElementById('toast');
  toast.innerText = `Deleted ${r.removed} log${r.removed === 1 ? '' : 's'}, freed ${fmtBytes(r.bytes)}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
});

function openExport() {
  document.getElementById('export-modal').classList.add('open');
  document.getElementById('export-list').innerHTML = '<div class="dim">Looking for drives\u2026</div>';
  socket.emit('export:targets');
}

function closeExport() {
  document.getElementById('export-modal').classList.remove('open');
}

function runExport(path) {
  document.getElementById('export-list').innerHTML = '<div class="dim">Copying\u2026 do not remove the drive</div>';
  socket.emit('export:run', { path });
}

socket.on('export:targets', (payload) => {
  const el = document.getElementById('export-list');
  if (!el) return;
  if (!payload.targets.length) {
    el.innerHTML = '<div class="dim">No USB drive detected. Plug one in and reopen this.</div>';
    return;
  }
  el.innerHTML =
    `<div class="dim">Logs to copy: ${fmtBytes(payload.bytes)}</div>` +
    payload.targets
      .map((t) => {
        const tight = t.free < payload.bytes;
        return `<button class="move-row" ${tight || t.readOnly ? 'disabled' : ''} onclick="runExport('${t.path.replace(/'/g, "\\'")}')">
          <svg viewBox="0 0 64 40"><rect x="14" y="6" width="26" height="28" rx="3"/><path d="M40 14h10v12H40"/></svg>
          <span>${t.name}<em class="dim"> ${fmtBytes(t.free)} free${t.readOnly ? ' - read only' : ''}${tight && !t.readOnly ? ' - not enough space' : ''}</em></span>
        </button>`;
      })
      .join('');
});

socket.on('export:done', (r) => {
  document.getElementById('export-list').innerHTML =
    `<div class="export-ok">Copied ${fmtBytes(r.bytes)} to<br><code>${r.destination}</code><br><span class="dim">Safe to remove the drive.</span></div>`;
});

const PID_GROUPS = { core: 'Core', engine: 'Engine', fuel: 'Fuel Trim', o2: 'Oxygen Sensors', misc: 'Other' };

function renderPidPicker() {
  const el = document.getElementById('pid-picker');
  if (!el) return;
  const entries = Object.entries(obdPidTable);
  if (!entries.length) {
    el.innerHTML = '<div class="dim">Connect to the car to see which channels it supports.</div>';
    updatePidBudget();
    return;
  }
  const byGroup = {};
  for (const [pid, spec] of entries) {
    if (obdSupported && !obdSupported.includes(pid)) continue;
    (byGroup[spec.group] = byGroup[spec.group] || []).push([pid, spec]);
  }
  el.innerHTML = Object.entries(byGroup)
    .map(
      ([group, list]) => `<div class="pid-group"><span>${PID_GROUPS[group] || group}</span><div class="pid-chips">${list
        .map(
          ([pid, spec]) =>
            `<button class="pid-chip ${pendingPids.has(pid) ? 'selected' : ''}" onclick="togglePid('${pid}')">${spec.name}<em>${spec.unit}</em></button>`
        )
        .join('')}</div></div>`
    )
    .join('');
  updatePidBudget();
}

function togglePid(pid) {
  if (pendingPids.has(pid)) pendingPids.delete(pid);
  else pendingPids.add(pid);
  renderPidPicker();
}

function updatePidBudget() {
  const el = document.getElementById('pid-budget');
  if (!el) return;
  const n = pendingPids.size;
  if (!n) {
    el.innerHTML = '<span class="dim">No engine channels selected.</span>';
    return;
  }
  const perPid = 10 / n;
  const warn = perPid < 1;
  el.innerHTML = `<b>${n}</b> channel${n === 1 ? '' : 's'} &middot; about <b class="${warn ? 'warn-text' : ''}">${perPid.toFixed(1)} Hz</b> each
    <div class="dim">Your car's bus allows roughly 10 readings per second in total.${warn ? ' Fewer channels means faster updates.' : ''}</div>`;
}

socket.on('obd:supported', (payload) => {
  obdPidTable = payload.pids || {};
  obdSupported = payload.supported && payload.supported.length ? payload.supported : null;
  if (!pendingPids.size && payload.defaults) {
    payload.defaults.forEach((p) => {
      if (!obdSupported || obdSupported.includes(p)) pendingPids.add(p);
    });
  }
  renderPidPicker();
});

function applyTireFactor(factor) {
  socket.emit('vehicle:tire', { factor });
  const toast = document.getElementById('toast');
  toast.innerText = `Tire factor set to ${factor}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function openHealth() {
  document.getElementById('health-modal').classList.add('open');
  document.getElementById('health-body').innerHTML = '<div class="dim">Reading logs…</div>';
  socket.emit('health:trends');
}

function closeHealth() {
  document.getElementById('health-modal').classList.remove('open');
}

socket.on('health:trends', (payload) => {
  const el = document.getElementById('health-body');
  if (!el) return;
  const pts = payload.points || [];
  if (!pts.length) {
    el.innerHTML = '<div class="dim">No drives with engine data yet. Record with Engine data enabled and trends will build up here.</div>';
    return;
  }
  const v = payload.verdict;
  const withLtft = pts.filter((p) => typeof p.ltftAvg === 'number');
  const max = Math.max(12, ...withLtft.map((p) => Math.abs(p.ltftAvg)));
  el.innerHTML = `
    ${v ? `<div class="verdict ${v.level}">${v.text}</div>` : ''}
    <div class="detail-section"><span>Long-term fuel trim by drive</span>
      <div class="trend">${withLtft
        .map(
          (p) => `<div class="trend-bar" title="${p.name}">
            <i style="height:${Math.max(2, (Math.abs(p.ltftAvg) / max) * 100)}%; background:${p.ltftAvg > 10 ? '#ff7a33' : '#3fd0b0'}"></i>
            <em>${p.ltftAvg.toFixed(1)}</em>
          </div>`
        )
        .join('')}</div>
      <p class="chart-note">Positive trim means the engine is adding fuel to correct a lean reading. A steady climb across drives is the signature of a developing intake leak.</p>
    </div>`;
});
