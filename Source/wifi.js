/* WiFi control via nmcli.
 *
 * Terse mode (-t) with explicit fields is used everywhere rather than the
 * human-readable output, which is localised and reflows between versions.
 * Fields are colon-separated and nmcli escapes literal colons as \: - SSIDs
 * containing colons would otherwise split into bogus columns.
 */
const { execFile } = require('child_process');

function nmcli(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('nmcli', args, { timeout: timeoutMs || 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim()));
      resolve(stdout);
    });
  });
}

function splitEscaped(line) {
  const out = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === ':') {
      cur += ':';
      i++;
    } else if (line[i] === ':') {
      out.push(cur);
      cur = '';
    } else cur += line[i];
  }
  out.push(cur);
  return out;
}

async function available() {
  try {
    await nmcli(['--version'], 5000);
    return true;
  } catch (e) {
    return false;
  }
}

async function status() {
  try {
    const out = await nmcli(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status']);
    const wifi = out
      .split('\n')
      .map(splitEscaped)
      .find((f) => f[1] === 'wifi');
    if (!wifi) return { available: false, connected: false };
    return {
      available: true,
      device: wifi[0],
      connected: wifi[2] === 'connected',
      ssid: wifi[2] === 'connected' ? wifi[3] : null
    };
  } catch (e) {
    return { available: false, connected: false, error: e.message };
  }
}

/* rescan can fail if one ran very recently; the cached list is still returned
   rather than surfacing an error the user cannot act on. */
async function scan(force) {
  if (force) await nmcli(['device', 'wifi', 'rescan'], 25000).catch(() => {});
  const out = await nmcli(['-t', '-f', 'SSID,SIGNAL,SECURITY,IN-USE', 'device', 'wifi', 'list']);
  const seen = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const f = splitEscaped(line);
    const ssid = f[0];
    if (!ssid) continue;
    const signal = parseInt(f[1], 10) || 0;
    /* the same SSID appears once per band/AP - keep the strongest */
    const prev = seen.get(ssid);
    if (prev && prev.signal >= signal) continue;
    seen.set(ssid, {
      ssid,
      signal,
      secured: !!(f[2] && f[2] !== '--' && f[2].trim()),
      active: f[3] === '*'
    });
  }
  return [...seen.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.signal - a.signal);
}

async function known() {
  const out = await nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show']);
  return out
    .split('\n')
    .map(splitEscaped)
    .filter((f) => f[1] === '802-11-wireless')
    .map((f) => f[0]);
}

/* A saved profile is reused when present so a known hotspot reconnects without
   the password being re-entered. */
async function connect(ssid, password) {
  if (!ssid) throw new Error('SSID required');
  const saved = await known().catch(() => []);
  if (saved.includes(ssid) && !password) {
    await nmcli(['connection', 'up', 'id', ssid], 45000);
    return status();
  }
  const args = ['device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  await nmcli(args, 45000);
  return status();
}

async function disconnect() {
  const s = await status();
  if (s.device) await nmcli(['device', 'disconnect', s.device], 20000);
  return status();
}

async function forget(ssid) {
  await nmcli(['connection', 'delete', 'id', ssid], 15000);
  return true;
}

module.exports = { available, status, scan, known, connect, disconnect, forget };
