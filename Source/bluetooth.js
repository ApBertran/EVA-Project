/* Bluetooth AVRCP control via BlueZ over D-Bus.
 *
 * The head unit is the CONTROLLER, not the audio source: the phone stays
 * connected to the car speakers, and EVA drives it over AVRCP. That means
 * transport control and now-playing metadata work with no Spotify account and
 * no internet. Album art and library browsing are not carried over AVRCP -
 * spotify.js layers those on when a network is available.
 *
 * Uses busctl rather than a native D-Bus binding on purpose: no npm dependency
 * to build for aarch64, and busctl is already present on the Pi.
 */
const { execFile } = require('child_process');

const BLUEZ = 'org.bluez';
const ADAPTER = '/org/bluez/hci0';
const IFACE_ADAPTER = 'org.bluez.Adapter1';
const IFACE_DEVICE = 'org.bluez.Device1';
const IFACE_PLAYER = 'org.bluez.MediaPlayer1';
const IFACE_TRANSPORT = 'org.bluez.MediaTransport1';

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('busctl', args, { timeout: timeoutMs || 8000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim()));
      resolve(stdout.trim());
    });
  });
}

/* busctl --json=short wraps values as {"type":"s","data":"..."}; unwrap to a
   plain JS value so callers never deal with the variant encoding. */
function unwrap(json) {
  try {
    const parsed = JSON.parse(json);
    const walk = (node) => {
      if (node && typeof node === 'object' && 'data' in node && 'type' in node) return walk(node.data);
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(node)) out[k] = walk(v);
        return out;
      }
      return node;
    };
    return walk(parsed);
  } catch (e) {
    return null;
  }
}

async function getProp(path, iface, prop) {
  try {
    const out = await run(['--system', '--json=short', 'get-property', BLUEZ, path, iface, prop]);
    return unwrap(out);
  } catch (e) {
    return null;
  }
}

async function setProp(path, iface, prop, sig, value) {
  return run(['--system', 'set-property', BLUEZ, path, iface, prop, sig, String(value)]);
}

async function callMethod(path, iface, method, timeoutMs) {
  return run(['--system', 'call', BLUEZ, path, iface, method], timeoutMs);
}

/* Enumerate object paths from the tree rather than parsing GetManagedObjects,
   whose nested variant structure is far more fragile to decode. */
async function paths() {
  try {
    const out = await run(['--system', 'tree', BLUEZ]);
    return out
      .split('\n')
      .map((l) => l.replace(/[^\x20-\x7e]/g, '').trim())
      .filter((l) => l.startsWith('/org/bluez'));
  } catch (e) {
    return [];
  }
}

function macFromPath(p) {
  const m = p.match(/dev_([0-9A-F_]{17})/i);
  return m ? m[1].replace(/_/g, ':') : null;
}

function pathFromMac(mac) {
  return `${ADAPTER}/dev_${String(mac).toUpperCase().replace(/:/g, '_')}`;
}

function isValidMac(mac) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(String(mac || '').trim());
}

async function listDevices() {
  const all = await paths();
  const devicePaths = [...new Set(all.filter((p) => /dev_[0-9A-F_]{17}$/i.test(p)))];
  const devices = [];
  for (const p of devicePaths) {
    const [name, connected, paired, trusted] = await Promise.all([
      getProp(p, IFACE_DEVICE, 'Alias'),
      getProp(p, IFACE_DEVICE, 'Connected'),
      getProp(p, IFACE_DEVICE, 'Paired'),
      getProp(p, IFACE_DEVICE, 'Trusted')
    ]);
    devices.push({
      mac: macFromPath(p),
      name: name || macFromPath(p),
      connected: !!connected,
      paired: !!paired,
      trusted: !!trusted
    });
  }
  devices.sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  return devices;
}

/* Discovery is owned by the D-Bus client that started it. A one-shot
   `busctl call StartDiscovery` therefore scans for nothing: busctl exits, the
   client disconnects, and BlueZ cancels the scan immediately - Discovering
   reads false a moment later. Hold a bluetoothctl process open for the
   duration instead. */
let scanProc = null;

function setDiscovery(on) {
  const { spawn } = require('child_process');
  if (on) {
    if (scanProc) return Promise.resolve(true);
    scanProc = spawn('bluetoothctl', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    scanProc.on('close', () => { scanProc = null; });
    scanProc.stdin.write('scan on\n');
    return Promise.resolve(true);
  }
  if (scanProc) {
    try {
      scanProc.stdin.write('scan off\n');
      scanProc.stdin.end();
    } catch (e) { /* already gone */ }
    scanProc.kill();
    scanProc = null;
  }
  return Promise.resolve(true);
}

/* Let the PHONE initiate pairing. More reliable than scanning for a handset,
   which only advertises while its Bluetooth settings screen is open.
   Discoverable/Pairable are plain properties and persist, but accepting a
   pairing request needs a live agent, so a bluetoothctl process is held open
   for the pairing window. NoInputNoOutput means no PIN prompt on a head unit
   that has no keyboard at boot. */
let agentProc = null;

function setDiscoverable(on, windowSeconds) {
  const { spawn } = require('child_process');
  if (!on) {
    if (agentProc) { try { agentProc.stdin.end(); } catch (e) {} agentProc.kill(); agentProc = null; }
    return Promise.all([
      setProp(ADAPTER, IFACE_ADAPTER, 'Discoverable', 'b', 'false').catch(() => {}),
      setProp(ADAPTER, IFACE_ADAPTER, 'Pairable', 'b', 'false').catch(() => {})
    ]).then(() => true);
  }
  if (!agentProc) {
    agentProc = spawn('bluetoothctl', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    agentProc.on('close', () => { agentProc = null; });
    agentProc.stdin.write('agent NoInputNoOutput\ndefault-agent\n');
  }
  const secs = Number(windowSeconds) || 180;
  return Promise.all([
    setProp(ADAPTER, IFACE_ADAPTER, 'DiscoverableTimeout', 'u', secs).catch(() => {}),
    setProp(ADAPTER, IFACE_ADAPTER, 'PairableTimeout', 'u', secs).catch(() => {}),
    setProp(ADAPTER, IFACE_ADAPTER, 'Discoverable', 'b', 'true'),
    setProp(ADAPTER, IFACE_ADAPTER, 'Pairable', 'b', 'true')
  ]).then(() => true);
}

async function discoverableState() {
  const [d, p, alias] = await Promise.all([
    getProp(ADAPTER, IFACE_ADAPTER, 'Discoverable'),
    getProp(ADAPTER, IFACE_ADAPTER, 'Pairable'),
    getProp(ADAPTER, IFACE_ADAPTER, 'Alias')
  ]);
  return { discoverable: !!d, pairable: !!p, name: alias || 'EVA' };
}

async function isDiscovering() {
  return !!(await getProp(ADAPTER, IFACE_ADAPTER, 'Discovering'));
}

/* Pairing needs the phone present and may require confirmation on the handset,
   so it is kept separate from connect(). A device that is already paired and
   trusted reconnects with connect() alone. */
async function pair(mac) {
  if (!isValidMac(mac)) throw new Error('Invalid MAC address');
  const p = pathFromMac(mac);
  await callMethod(p, IFACE_DEVICE, 'Pair', 30000);
  await setProp(p, IFACE_DEVICE, 'Trusted', 'b', 'true').catch(() => {});
  return true;
}

async function connect(mac) {
  if (!isValidMac(mac)) throw new Error('Invalid MAC address');
  const p = pathFromMac(mac);
  /* trust first so the phone reconnects on its own after an ignition cycle */
  await setProp(p, IFACE_DEVICE, 'Trusted', 'b', 'true').catch(() => {});
  await callMethod(p, IFACE_DEVICE, 'Connect', 20000);
  return true;
}

async function disconnect(mac) {
  const p = pathFromMac(mac);
  await callMethod(p, IFACE_DEVICE, 'Disconnect', 10000);
  return true;
}

async function remove(mac) {
  await run(['--system', 'call', BLUEZ, ADAPTER, IFACE_ADAPTER, 'RemoveDevice', 'o', pathFromMac(mac)]);
  return true;
}

async function playerPath() {
  const all = await paths();
  return all.find((p) => /\/player\d+$/.test(p)) || null;
}

async function transportPath() {
  const all = await paths();
  return all.find((p) => /\/fd\d+$/.test(p)) || null;
}

/* AVRCP metadata arrives as a Track dict. Fields are optional and vary by
   source app, so every one is treated as absent-by-default. */
async function nowPlaying() {
  const p = await playerPath();
  if (!p) return { available: false };
  const [track, status, position] = await Promise.all([
    getProp(p, IFACE_PLAYER, 'Track'),
    getProp(p, IFACE_PLAYER, 'Status'),
    getProp(p, IFACE_PLAYER, 'Position')
  ]);
  const t = track || {};
  return {
    available: true,
    status: status || 'stopped',
    positionMs: typeof position === 'number' ? position : null,
    title: t.Title || null,
    artist: t.Artist || null,
    album: t.Album || null,
    durationMs: typeof t.Duration === 'number' ? t.Duration : null,
    trackNumber: typeof t.TrackNumber === 'number' ? t.TrackNumber : null
  };
}

const COMMANDS = { play: 'Play', pause: 'Pause', next: 'Next', previous: 'Previous', stop: 'Stop' };

async function control(cmd) {
  const method = COMMANDS[cmd];
  if (!method) throw new Error(`Unknown command: ${cmd}`);
  const p = await playerPath();
  if (!p) throw new Error('No media player connected');
  await callMethod(p, IFACE_PLAYER, method);
  return true;
}

/* AVRCP absolute volume is 0-127, not a percentage. */
async function getVolume() {
  const p = await transportPath();
  if (!p) return null;
  const v = await getProp(p, IFACE_TRANSPORT, 'Volume');
  return typeof v === 'number' ? Math.round((v / 127) * 100) : null;
}

async function setVolume(percent) {
  const p = await transportPath();
  if (!p) throw new Error('No audio transport connected');
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  await setProp(p, IFACE_TRANSPORT, 'Volume', 'q', Math.round((clamped / 100) * 127));
  return clamped;
}

async function available() {
  try {
    const powered = await getProp(ADAPTER, IFACE_ADAPTER, 'Powered');
    return powered !== null;
  } catch (e) {
    return false;
  }
}

module.exports = {
  available,
  listDevices,
  setDiscovery,
  isDiscovering,
  setDiscoverable,
  discoverableState,
  pair,
  connect,
  disconnect,
  remove,
  nowPlaying,
  control,
  getVolume,
  setVolume,
  isValidMac
};
