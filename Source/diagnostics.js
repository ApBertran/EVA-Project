let obdState = { status: 'disconnected' };
let obdPorts = [];
let lastCodes = null;
let defineTarget = null;

function openDiagnostics() {
  document.getElementById('obd-modal').classList.add('open');
  socket.emit('obd:ports');
  renderDiagnostics();
}

function closeDiagnostics() {
  document.getElementById('obd-modal').classList.remove('open');
}

function obdStatusLabel() {
  const map = {
    disconnected: 'Not connected',
    connecting: 'Connecting',
    unavailable: 'Adapter not found',
    'no-vehicle': 'Adapter ready, car off',
    ready: 'Connected to vehicle',
    error: 'Error'
  };
  return map[obdState.status] || obdState.status;
}

function codeCard(entry) {
  const known = !!entry.definition;
  return `
    <div class="dtc-card ${known ? '' : 'unknown'}">
      <div class="dtc-code">${entry.code}</div>
      <div class="dtc-body">
        <div class="dtc-def">${known ? entry.definition : 'Not in local database'}</div>
        <div class="dtc-meta">${entry.system}${entry.subsystem ? ' &middot; ' + entry.subsystem : ''} &middot; ${
    entry.manufacturerSpecific ? 'Ford-specific' : 'SAE standard'
  }${entry.source === 'user' ? ' &middot; your definition' : ''}</div>
      </div>
      ${known ? '' : `<button class="ghost-btn" onclick="openDefine('${entry.code}')">Define</button>`}
    </div>`;
}

function renderDiagnostics() {
  const body = document.getElementById('obd-body');
  if (!body) return;

  const connected = obdState.status === 'ready' || obdState.status === 'no-vehicle';
  const portOptions = obdPorts.length
    ? obdPorts.map((p) => `<option value="${p}" ${obdState.port === p ? 'selected' : ''}>${p}</option>`).join('')
    : '<option value="">no serial adapter detected</option>';

  const codesHtml = !lastCodes
    ? '<div class="dim">No scan yet.</div>'
    : (() => {
        const stored = lastCodes.stored || [];
        const pending = lastCodes.pending || [];
        if (!stored.length && !pending.length) {
          return '<div class="obd-clean">No trouble codes stored.</div>';
        }
        let html = '';
        if (stored.length) {
          html += `<div class="dtc-group"><span>Stored &middot; ${stored.length}</span>${stored.map(codeCard).join('')}</div>`;
        }
        if (pending.length) {
          html += `<div class="dtc-group"><span>Pending &middot; ${pending.length}</span>${pending.map(codeCard).join('')}</div>`;
        }
        return html;
      })();

  body.innerHTML = `
    <div class="obd-status ${obdState.status}">
      <div>
        <div class="obd-state">${obdStatusLabel()}</div>
        <div class="dim">${obdState.detail || ''}${obdState.adapter ? ' &middot; ' + obdState.adapter : ''}</div>
      </div>
      ${obdState.voltage ? `<div class="obd-volts">${obdState.voltage.toFixed(1)}<i>V</i></div>` : ''}
    </div>

    <div class="setting-row">
      <label for="obd-port">Adapter port</label>
      <select id="obd-port" class="select">${portOptions}</select>
    </div>

    <div class="obd-actions">
      ${connected
        ? '<button class="ghost-btn" onclick="obdDisconnect()">Disconnect</button>'
        : '<button class="primary-btn" onclick="obdConnect()">Connect</button>'}
      <button class="primary-btn" onclick="obdRead()" ${connected ? '' : 'disabled'}>Read Codes</button>
      <button class="danger-btn" onclick="obdClear()" ${connected && lastCodes ? '' : 'disabled'}>Clear</button>
    </div>
    <p class="chart-note">Clearing also resets emissions readiness monitors and erases freeze-frame data.</p>

    <div class="dtc-list">${codesHtml}</div>`;
}

function obdConnect() {
  const port = document.getElementById('obd-port').value;
  if (!port) return;
  socket.emit('obd:connect', { port, baud: 115200 });
}

function obdDisconnect() {
  socket.emit('obd:disconnect');
}

function obdRead() {
  document.getElementById('obd-body').querySelector('.dtc-list').innerHTML =
    '<div class="dim">Scanning…</div>';
  socket.emit('obd:read');
}

function obdClear() {
  socket.emit('obd:clear');
}

async function openDefine(code) {
  defineTarget = code;
  const text = await askText(`Definition for ${code}`, '');
  if (text) socket.emit('obd:define', { code, text });
}

socket.on('obd:status', (st) => {
  obdState = st;
  const pill = document.getElementById('obd-pill');
  if (pill) pill.classList.toggle('off', st.status !== 'ready');
  renderDiagnostics();
});

socket.on('obd:ports', (payload) => {
  obdPorts = payload.ports || [];
  renderDiagnostics();
});

socket.on('obd:codes', (result) => {
  lastCodes = result;
  renderDiagnostics();
});

socket.on('obd:cleared', (result) => {
  lastCodes = result.after;
  renderDiagnostics();
  const toast = document.getElementById('toast');
  toast.innerText = result.ok ? 'Codes cleared' : 'Clear may have failed - rescan';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
});

socket.on('obd:defined', () => {
  socket.emit('obd:read');
});
