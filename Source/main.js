const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { spawn, execFileSync } = require('child_process');

const recorder = require('./recorder');
const { GpsSource } = require('./gps');
const analysis = require('./analysis');
const exporter = require('./exporter');
const { ObdLink, PIDS: OBD_PIDS, DEFAULT_PIDS: obdDefaults } = require('./obd');
const daylight = require('./daylight');

function obdPidTable() {
  return Object.fromEntries(
    Object.entries(OBD_PIDS).map(([k, v]) => [k, { name: v.name, unit: v.unit, group: v.group, unlikely: !!v.unlikely }])
  );
}
const dtcLib = require('./dtc');

const expressApp = express();
const server = http.createServer(expressApp);
const io = socketIO(server);

const sourceDir = __dirname;
expressApp.use(express.static(sourceDir));

const CONFIG_PATH = path.join(os.homedir(), '.eva-config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

const DEFAULT_SETTINGS = {
  maxG: 1.5,
  peakHold: 5,
  damping: 16
};

const SETTING_LIMITS = {
  maxG: { min: 0.5, max: 5 },
  peakHold: { min: 1, max: 10 },
  damping: { min: 1, max: 32 }
};

function clampSetting(key, value) {
  const limit = SETTING_LIMITS[key];
  const num = Number(value);
  if (!limit || !isFinite(num)) return null;
  return Math.min(limit.max, Math.max(limit.min, num));
}

function saveConfig(config) {
  const tmp = `${CONFIG_PATH}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    const fd = fs.openSync(tmp, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, CONFIG_PATH);
  } catch (e) {
    console.error('Could not persist config:', e.message);
  }
}

function settingsPayload() {
  return {
    gps: config.gps || { mode: 'off' },
    axes: config.axes || analysis.DEFAULT_AXES,
    settings: { ...DEFAULT_SETTINGS, ...(config.settings || {}) },
    theme: config.theme || { mode: 'auto' },
    vehicle: config.vehicle || { tireFactor: 1 }
  };
}

let config = loadConfig();
if (!config.settings) {
  config.settings = { ...DEFAULT_SETTINGS };
  saveConfig(config);
}

const obd = new ObdLink();
let obdStatus = obd.state();
obd.on('status', (st) => {
  obdStatus = st;
  io.emit('obd:status', st);
});

const gps = new GpsSource();
let gpsStatus = { status: 'unavailable', detail: null, lastFix: null };

gps.on('status', (payload) => {
  gpsStatus = payload;
  io.emit('gps:status', payload);
});

gps.on('fix', (fix) => {
  gpsStatus = { status: 'live', detail: null, lastFix: fix };
  recorder.sampleGps(fix);
  io.emit('gps:fix', fix);
});

if (config.gps && config.gps.mode && config.gps.mode !== 'off') {
  gps.connect(config.gps);
}

if (config.obd && config.obd.autoConnect) {
  setTimeout(() => obd.connect(config.obd.port, config.obd.baud), 2000);
}

const interrupted = recorder.reconcileInterrupted();
if (interrupted.length) {
  console.log(`Marked ${interrupted.length} interrupted recording(s):`, interrupted.join(', '));
}

function resolvePython() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch (e) {
      continue;
    }
  }
  return 'python3';
}

const pythonScriptPath = path.join(sourceDir, 'BerryIMU/python-BerryIMU-measure-G/imu-logger.py');
const pythonProcess = spawn(resolvePython(), [pythonScriptPath]);

let buffer = '';

pythonProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  let lines = buffer.split('\n');
  buffer = lines.pop();

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;
    try {
      const sample = JSON.parse(trimmed);
      if (!Array.isArray(sample.a)) return;
      recorder.sampleImu(sample);
      if (calibration) calibration.samples.push(sample.a);
      io.emit('gforce-update', sample.a);
    } catch (e) {
      console.error('Error parsing IMU sample:', e.message);
    }
  });
});

pythonProcess.stderr.on('data', (data) => {
  console.error('Error from Python script:', data.toString());
});

pythonProcess.on('close', (code) => {
  console.log(`Python script exited with code ${code}`);
});


let calibration = null;

function startCalibrationCapture(socket, ms, step) {
  calibration = { samples: [], step };
  setTimeout(() => {
    const captured = calibration ? calibration.samples : [];
    calibration = null;
    if (!captured.length) {
      socket.emit('calib:result', { step, error: 'no sensor data captured' });
      return;
    }
    const means = [0, 1, 2].map((i) => captured.reduce((a, s) => a + s[i], 0) / captured.length);
    const rest = [0, 1, 2].map((i) => {
      const m = means[i];
      return Math.sqrt(captured.reduce((a, s) => a + (s[i] - m) ** 2, 0) / captured.length);
    });
    const vertical = means.map((m, i) => ({ i, d: Math.abs(Math.abs(m) - 1) })).sort((a, b) => a.d - b.d)[0].i;
    const horizontal = [0, 1, 2].filter((i) => i !== vertical);
    const dominant = horizontal.sort((a, b) => Math.abs(means[b]) - Math.abs(means[a]))[0];
    socket.emit('calib:result', {
      step,
      samples: captured.length,
      means: means.map((m) => +m.toFixed(3)),
      noise: rest.map((r) => +r.toFixed(3)),
      vertical,
      axis: dominant,
      magnitude: +Math.abs(means[dominant]).toFixed(3),
      positive: means[dominant] > 0
    });
  }, Math.min(15000, Math.max(1000, ms)));
}


function buildHealthTrends() {
  const points = [];
  const walk = (dir) => {
    let names;
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of names) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      const summaryPath = path.join(child, 'summary.json');
      const metaPath = path.join(child, 'meta.json');
      if (fs.existsSync(summaryPath) && fs.existsSync(metaPath)) {
        try {
          const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (summary.obd && summary.obd.health && Object.keys(summary.obd.health).length) {
            points.push({
              t: meta.startedAt,
              name: meta.name,
              ...summary.obd.health,
              distanceKm: summary.obd.derived ? summary.obd.derived.distanceKm : null,
              avgMpg: summary.obd.derived ? summary.obd.derived.avgMpg : null
            });
          }
        } catch (e) {
          /* skip */
        }
      } else {
        walk(child);
      }
    }
  };
  walk(recorder.LOG_ROOT);
  points.sort((a, b) => a.t - b.t);

  const withLtft = points.filter((p) => typeof p.ltftAvg === 'number');
  let verdict = null;
  if (withLtft.length >= 2) {
    const first = withLtft[0].ltftAvg;
    const last = withLtft[withLtft.length - 1].ltftAvg;
    const drift = last - first;
    const spread = withLtft[withLtft.length - 1].bankSpread;
    if (last > 12) verdict = { level: 'warn', text: `Long-term fuel trim is ${last.toFixed(1)}% - the engine is compensating for a significant lean condition. Check intake gaskets and vacuum lines.` };
    else if (drift > 5) verdict = { level: 'watch', text: `Fuel trim has drifted ${drift.toFixed(1)}% higher since your first logged drive. Worth watching - a slow climb is how an intake gasket leak begins.` };
    else if (spread > 8) verdict = { level: 'watch', text: `Banks disagree by ${spread.toFixed(1)}%. A one-sided lean reading points at that bank rather than a shared leak.` };
    else verdict = { level: 'ok', text: 'Fuel trims look stable across your logged drives.' };
  }
  return { points, verdict };
}

function broadcastState() {
  io.emit('logs:state', recorder.state());
}

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.emit('gps:status', gpsStatus);
  socket.emit('obd:status', obdStatus);
  socket.emit('logs:state', recorder.state());
  socket.emit('config', settingsPayload());

  const guard = (handler) => async (payload) => {
    try {
      await handler(payload || {});
    } catch (e) {
      socket.emit('logs:error', { message: e.message });
    }
  };

  socket.on('logs:list', guard((payload) => {
    socket.emit('logs:listing', recorder.list(payload.path || ''));
  }));

  socket.on('logs:mkdir', guard((payload) => {
    recorder.mkdir(payload.path || '', payload.name);
    socket.emit('logs:listing', recorder.list(payload.path || ''));
  }));

  socket.on('logs:rename', guard((payload) => {
    recorder.rename(payload.path, payload.name);
    socket.emit('logs:listing', recorder.list(payload.parent || ''));
  }));

  socket.on('logs:delete', guard((payload) => {
    recorder.remove(payload.path);
    socket.emit('logs:listing', recorder.list(payload.parent || ''));
  }));

  socket.on('logs:start', guard((payload) => {
    recorder.start(payload);
    if (payload.sources && payload.sources.obd && obd.status === 'ready') {
      obd.startPolling(payload.obdPids && payload.obdPids.length ? payload.obdPids : undefined,
        (sample) => recorder.sampleObd(sample));
    }
    broadcastState();
  }));

  socket.on('logs:stop', guard(() => {
    obd.stopPolling();
    recorder.stop().then(async (meta) => {
      broadcastState();
      if (!meta) return;
      try {
        await analysis.analyze(meta.dir, config.axes, { tireFactor: (config.vehicle && config.vehicle.tireFactor) || 1 });
      } catch (e) {
        console.error('Analysis failed:', e.message);
      }
      io.emit('logs:finished', meta);
    });
  }));

  socket.on('logs:move', guard((payload) => {
    recorder.move(payload.path, payload.dest);
    socket.emit('logs:listing', recorder.list(payload.parent || ''));
  }));

  socket.on('logs:folders', guard(() => {
    socket.emit('logs:folders', recorder.allFolders());
  }));

  socket.on('obd:ports', guard(() => {
    socket.emit('obd:ports', { ports: ObdLink.listPorts(), config: config.obd || {} });
  }));

  socket.on('obd:connect', guard((payload) => {
    config = { ...config, obd: { port: payload.port, baud: payload.baud || 115200, autoConnect: true } };
    saveConfig(config);
    obd.connect(config.obd.port, config.obd.baud);
  }));

  socket.on('obd:disconnect', guard(() => {
    config = { ...config, obd: { ...(config.obd || {}), autoConnect: false } };
    saveConfig(config);
    obd.disconnect();
    obd.setStatus('disconnected');
  }));

  socket.on('obd:supported', guard(async () => {
    const supported = obd.status === 'ready' ? await obd.readSupportedPids() : [];
    socket.emit('obd:supported', { supported, pids: obdPidTable(), defaults: obdDefaults });
  }));

  socket.on('obd:read', guard(async () => {
    const result = await obd.readTroubleCodes();
    socket.emit('obd:codes', result);
  }));

  socket.on('obd:clear', guard(async () => {
    const result = await obd.clearTroubleCodes();
    const after = await obd.readTroubleCodes();
    socket.emit('obd:cleared', { ...result, after });
  }));

  socket.on('obd:define', guard((payload) => {
    dtcLib.saveUserDefinition(payload.code, payload.text);
    socket.emit('obd:defined', dtcLib.lookup(payload.code));
  }));

  socket.on('settings:theme', guard((payload) => {
    const mode = ['auto', 'day', 'night'].includes(payload.mode) ? payload.mode : 'auto';
    config = { ...config, theme: { mode } };
    saveConfig(config);
    socket.broadcast.emit('config', settingsPayload());
  }));

  socket.on('health:trends', guard(() => {
    socket.emit('health:trends', buildHealthTrends());
  }));

  socket.on('vehicle:tire', guard((payload) => {
    const factor = Number(payload.factor);
    if (!isFinite(factor) || factor < 0.8 || factor > 1.25) throw new Error('implausible tire factor');
    config = { ...config, vehicle: { ...(config.vehicle || {}), tireFactor: +factor.toFixed(4) } };
    saveConfig(config);
    socket.emit('vehicle:tire', config.vehicle);
  }));

  socket.on('export:targets', guard(() => {
    socket.emit('export:targets', {
      targets: exporter.listTargets(),
      bytes: exporter.dirSize(recorder.LOG_ROOT)
    });
  }));

  socket.on('export:run', guard((payload) => {
    const result = exporter.exportAll(recorder.LOG_ROOT, payload.path);
    socket.emit('export:done', result);
  }));

  socket.on('logs:purgePreview', guard((payload) => {
    socket.emit('logs:purgePreview', recorder.purgePreview(Number(payload.days) || 30));
  }));

  socket.on('logs:purge', guard((payload) => {
    const result = recorder.purge(Number(payload.days) || 30);
    socket.emit('logs:purged', result);
    socket.emit('logs:listing', recorder.list(payload.parent || ''));
  }));

  socket.on('logs:analysis', guard(async (payload) => {
    const dir = recorder.dirFor(payload.path);
    const summaryPath = path.join(dir, 'summary.json');
    const seriesPath = path.join(dir, 'series.json');
    if (!fs.existsSync(summaryPath) || !fs.existsSync(seriesPath)) {
      await analysis.analyze(dir, config.axes, { tireFactor: (config.vehicle && config.vehicle.tireFactor) || 1 });
    }
    const read = (f) => {
      try {
        return JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch (e) {
        return null;
      }
    };
    socket.emit('logs:analysis', {
      path: payload.path,
      summary: read(summaryPath),
      series: read(seriesPath)
    });
  }));

  socket.on('logs:reanalyze', guard(async (payload) => {
    const dir = recorder.dirFor(payload.path);
    const summary = await analysis.analyze(dir, config.axes, { tireFactor: (config.vehicle && config.vehicle.tireFactor) || 1 });
    socket.emit('logs:reanalyzed', { path: payload.path, summary });
  }));

  socket.on('calib:capture', guard((payload) => {
    startCalibrationCapture(socket, Number(payload.ms) || 4000, payload.step);
  }));

  socket.on('settings:set', guard((payload) => {
    const key = String(payload.key || '');
    const value = clampSetting(key, payload.value);
    if (value === null) throw new Error(`unknown or invalid setting: ${key}`);
    config = { ...config, settings: { ...DEFAULT_SETTINGS, ...(config.settings || {}), [key]: value } };
    saveConfig(config);
    socket.broadcast.emit('config', settingsPayload());
    if (key === 'damping') console.log(`Damping click position persisted: ${value}`);
  }));

  socket.on('axes:set', guard((payload) => {
    config = { ...config, axes: payload };
    saveConfig(config);
    io.emit('config', settingsPayload());
  }));

  socket.on('logs:state', guard(() => {
    socket.emit('logs:state', recorder.state());
  }));

  socket.on('gps:configure', guard((payload) => {
    config = { ...config, gps: payload };
    saveConfig(config);
    gps.connect(payload);
    io.emit('config', settingsPayload());
  }));

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

setInterval(() => {
  if (recorder.state().recording) broadcastState();
}, 1000);

/* The renderer cannot work this out before first paint on its own: localStorage
   is blocked on file:// URLs, and the socket config arrives well after the boot
   screen has already painted. The main process knows the answer synchronously,
   so hand it over in the URL and let themeBoot.js stamp it before first paint. */
function bootTheme() {
  const mode = (config.theme && config.theme.mode) || 'auto';
  if (mode === 'day' || mode === 'night') return mode;
  const opts = { now: new Date() };
  const fix = gpsStatus.lastFix;
  if (fix && typeof fix.lat === 'number' && typeof fix.lon === 'number') {
    opts.lat = fix.lat;
    opts.lon = fix.lon;
  }
  return daylight.resolve(opts).mode;
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    fullscreen: true
  });

  mainWindow.loadFile(path.join(sourceDir, 'welcomeMessage.html'), {
    query: { theme: bootTheme() }
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', (event) => {
  if (!recorder.state().recording) return;
  event.preventDefault();
  recorder.stop().then(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
  console.log('Log root:', recorder.LOG_ROOT);
});
