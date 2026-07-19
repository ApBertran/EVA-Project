const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_ROOT = process.env.EVA_LOG_ROOT || path.join(os.homedir(), 'EVA-Logs');
const FLUSH_INTERVAL_MS = 5000;

let active = null;

function ensureRoot() {
  fs.mkdirSync(LOG_ROOT, { recursive: true });
}

function safeSegment(name) {
  const cleaned = String(name || '')
    .replace(/[\0-\x1f<>:\"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'untitled';
  return cleaned;
}

function dirFor(relPath) {
  return resolveIn(relPath).full;
}

function resolveIn(relPath) {
  const segments = String(relPath || '')
    .split('/')
    .filter(Boolean)
    .map(safeSegment);
  const full = path.join(LOG_ROOT, ...segments);
  const rootReal = path.resolve(LOG_ROOT);
  const fullReal = path.resolve(full);
  if (fullReal !== rootReal && !fullReal.startsWith(rootReal + path.sep)) {
    throw new Error('path escapes log root');
  }
  return { full: fullReal, rel: segments.join('/') };
}

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'entry';
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function readMeta(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeMeta(dir, meta) {
  const target = path.join(dir, 'meta.json');
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, target);
}

function countLines(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw) return 0;
    return raw.split('\n').filter((l) => l.trim()).length;
  } catch (e) {
    return 0;
  }
}

function lastTimestamp(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed.t === 'number') return parsed.t;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function list(relPath) {
  ensureRoot();
  const { full, rel } = resolveIn(relPath);
  if (!fs.existsSync(full)) return { path: rel, folders: [], entries: [] };

  const folders = [];
  const entries = [];

  for (const name of fs.readdirSync(full)) {
    const child = path.join(full, name);
    let stat;
    try {
      stat = fs.statSync(child);
    } catch (e) {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const meta = readMeta(child);
    if (meta) {
      entries.push({ ...meta, dirName: name, path: rel ? `${rel}/${name}` : name });
    } else {
      folders.push({ name, path: rel ? `${rel}/${name}` : name });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  entries.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return { path: rel, folders, entries };
}

function mkdir(relPath, name) {
  const parent = resolveIn(relPath);
  const target = path.join(parent.full, safeSegment(name));
  resolveIn(parent.rel ? `${parent.rel}/${name}` : name);
  fs.mkdirSync(target, { recursive: true });
}

function rename(relPath, newName) {
  const target = resolveIn(relPath);
  if (target.rel === '') throw new Error('cannot rename root');
  const meta = readMeta(target.full);
  if (meta) {
    meta.name = String(newName || '').slice(0, 80) || 'Untitled';
    writeMeta(target.full, meta);
    return;
  }
  const parentRel = target.rel.split('/').slice(0, -1).join('/');
  const parent = resolveIn(parentRel);
  fs.renameSync(target.full, path.join(parent.full, safeSegment(newName)));
}

function remove(relPath) {
  const target = resolveIn(relPath);
  if (target.rel === '') throw new Error('cannot delete root');
  if (active && active.dir === target.full) throw new Error('cannot delete an active recording');
  fs.rmSync(target.full, { recursive: true, force: true });
}



function move(srcRel, destRel) {
  const src = resolveIn(srcRel);
  const dest = resolveIn(destRel || '');
  if (src.rel === '') throw new Error('cannot move root');
  if (active && active.dir === src.full) throw new Error('cannot move an active recording');
  if (dest.full === src.full || dest.full.startsWith(src.full + path.sep)) {
    throw new Error('cannot move a folder into itself');
  }
  const target = path.join(dest.full, path.basename(src.full));
  if (target === src.full) return;
  if (fs.existsSync(target)) throw new Error('an item with that name already exists there');
  fs.mkdirSync(dest.full, { recursive: true });
  fs.renameSync(src.full, target);
}

function allFolders() {
  ensureRoot();
  const out = [];
  const walk = (current, rel) => {
    let names;
    try {
      names = fs.readdirSync(current);
    } catch (e) {
      return;
    }
    for (const name of names) {
      const child = path.join(current, name);
      try {
        if (!fs.statSync(child).isDirectory()) continue;
      } catch (e) {
        continue;
      }
      if (readMeta(child)) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      out.push({ name, path: childRel, depth: childRel.split('/').length });
      walk(child, childRel);
    }
  };
  walk(LOG_ROOT, '');
  return out;
}

function walkEntries(current, rel, out) {
  let names;
  try {
    names = fs.readdirSync(current);
  } catch (e) {
    return;
  }
  for (const name of names) {
    const child = path.join(current, name);
    let stat;
    try {
      stat = fs.statSync(child);
    } catch (e) {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const meta = readMeta(child);
    const childRel = rel ? `${rel}/${name}` : name;
    if (meta) out.push({ dir: child, rel: childRel, meta });
    else walkEntries(child, childRel, out);
  }
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let names;
    try {
      names = fs.readdirSync(current);
    } catch (e) {
      continue;
    }
    for (const name of names) {
      const child = path.join(current, name);
      try {
        const stat = fs.statSync(child);
        if (stat.isDirectory()) stack.push(child);
        else total += stat.size;
      } catch (e) {
        continue;
      }
    }
  }
  return total;
}

function collectOlderThan(days) {
  ensureRoot();
  const cutoff = Date.now() - days * 86400000;
  const all = [];
  walkEntries(LOG_ROOT, '', all);
  return all.filter((e) => (e.meta.startedAt || 0) < cutoff);
}

function purgePreview(days) {
  const doomed = collectOlderThan(days);
  const bytes = doomed.reduce((a, e) => a + dirSize(e.dir), 0);
  const oldest = doomed.reduce((a, e) => Math.min(a, e.meta.startedAt || Infinity), Infinity);
  return {
    days,
    count: doomed.length,
    bytes,
    names: doomed.slice(0, 6).map((e) => e.meta.name),
    oldest: isFinite(oldest) ? oldest : null
  };
}

function purge(days) {
  const doomed = collectOlderThan(days);
  let removed = 0;
  let bytes = 0;
  for (const entry of doomed) {
    if (active && active.dir === entry.dir) continue;
    bytes += dirSize(entry.dir);
    fs.rmSync(entry.dir, { recursive: true, force: true });
    removed++;
  }
  return { removed, bytes };
}

function start(options) {
  if (active) throw new Error('a recording is already running');
  ensureRoot();

  const now = new Date();
  const name = String(options.name || '').slice(0, 80) || 'Untitled Drive';
  const parent = resolveIn(options.folder || '');
  const dirName = `${stamp(now)}-${slug(name)}`;
  const dir = path.join(parent.full, dirName);
  fs.mkdirSync(dir, { recursive: true });

  const sources = {
    gforce: options.sources ? options.sources.gforce !== false : true,
    gps: !!(options.sources && options.sources.gps),
    obd: !!(options.sources && options.sources.obd)
  };

  const meta = {
    name,
    thumbnail: options.thumbnail || 'cruising',
    roadTypes: Array.isArray(options.roadTypes) ? options.roadTypes.slice(0, 8) : [],
    notes: String(options.notes || '').slice(0, 2000),
    sources,
    status: 'recording',
    startedAt: now.getTime(),
    startedAtISO: now.toISOString(),
    endedAt: null,
    durationMs: 0,
    obdPids: Array.isArray(options.obdPids) ? options.obdPids : [],
    counts: { gforce: 0, gps: 0, obd: 0 }
  };
  writeMeta(dir, meta);

  active = {
    dir,
    rel: parent.rel ? `${parent.rel}/${dirName}` : dirName,
    meta,
    streams: {},
    counts: { gforce: 0, gps: 0, obd: 0 },
    flushTimer: null
  };

  active.files = {};
  if (sources.gforce) {
    active.files.gforce = path.join(dir, 'gforce.jsonl');
    active.streams.gforce = fs.createWriteStream(active.files.gforce, { flags: 'a' });
  }
  if (sources.gps) {
    active.files.gps = path.join(dir, 'gps.jsonl');
    active.streams.gps = fs.createWriteStream(active.files.gps, { flags: 'a' });
  }
  if (sources.obd) {
    active.files.obd = path.join(dir, 'obd.jsonl');
    active.streams.obd = fs.createWriteStream(active.files.obd, { flags: 'a' });
  }

  active.flushTimer = setInterval(() => {
    for (const stream of Object.values(active.streams)) {
      if (stream && typeof stream.fd === 'number') {
        try {
          fs.fsyncSync(stream.fd);
        } catch (e) {
          /* fd not ready yet */
        }
      }
    }
  }, FLUSH_INTERVAL_MS);

  return state();
}

function sampleImu(sample) {
  if (!active || !active.streams.gforce) return;
  const row = { t: sample.t || Date.now(), a: sample.a, g: sample.g };
  if (sample.m) row.m = sample.m;
  active.streams.gforce.write(JSON.stringify(row) + '\n');
  active.counts.gforce++;
}

function sampleGps(fix) {
  if (!active || !active.streams.gps) return;
  active.streams.gps.write(JSON.stringify({ t: Date.now(), ...fix }) + '\n');
  active.counts.gps++;
}

function syncFile(file) {
  try {
    const fd = fs.openSync(file, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (e) {
    /* nothing was written */
  }
}

function sampleObd(row) {
  if (!active || !active.streams.obd) return;
  active.streams.obd.write(JSON.stringify(row) + '\n');
  active.counts.obd++;
}

function stop() {
  if (!active) return Promise.resolve(null);

  clearInterval(active.flushTimer);
  const finished = active;
  active = null;

  const closed = Object.values(finished.streams)
    .filter(Boolean)
    .map((stream) => new Promise((resolve) => stream.end(resolve)));

  return Promise.all(closed).then(() => {
    for (const file of Object.values(finished.files || {})) syncFile(file);

    const endedAt = Date.now();
    const meta = {
      ...finished.meta,
      status: 'complete',
      endedAt,
      durationMs: endedAt - finished.meta.startedAt,
      counts: finished.counts
    };
    writeMeta(finished.dir, meta);
    syncFile(path.join(finished.dir, 'meta.json'));
    return { ...meta, path: finished.rel, dir: finished.dir };
  });
}

function state() {
  if (!active) return { recording: false };
  return {
    recording: true,
    path: active.rel,
    name: active.meta.name,
    thumbnail: active.meta.thumbnail,
    sources: active.meta.sources,
    startedAt: active.meta.startedAt,
    elapsedMs: Date.now() - active.meta.startedAt,
    counts: active.counts
  };
}

function reconcileInterrupted(dir) {
  const found = [];
  const walk = (current, rel) => {
    let names;
    try {
      names = fs.readdirSync(current);
    } catch (e) {
      return;
    }
    for (const name of names) {
      const child = path.join(current, name);
      let stat;
      try {
        stat = fs.statSync(child);
      } catch (e) {
        continue;
      }
      if (!stat.isDirectory()) continue;
      const meta = readMeta(child);
      const childRel = rel ? `${rel}/${name}` : name;
      if (!meta) {
        walk(child, childRel);
        continue;
      }
      if (meta.status !== 'recording') continue;

      const gforceFile = path.join(child, 'gforce.jsonl');
      const gpsFile = path.join(child, 'gps.jsonl');
      const lastT = Math.max(lastTimestamp(gforceFile) || 0, lastTimestamp(gpsFile) || 0);
      meta.status = 'interrupted';
      meta.endedAt = lastT || meta.startedAt;
      meta.durationMs = Math.max(0, meta.endedAt - meta.startedAt);
      meta.counts = { gforce: countLines(gforceFile), gps: countLines(gpsFile) };
      writeMeta(child, meta);
      found.push(childRel);
    }
  };
  ensureRoot();
  walk(dir || LOG_ROOT, '');
  return found;
}

/* Storage headroom for the logs view. Uses df/du rather than fs.statfsSync,
   which is unavailable on the Node bundled with Electron 22. logsBytes is
   reported separately because that is the portion purge can actually reclaim. */
function storage() {
  const { execFileSync } = require('child_process');
  try {
    ensureRoot();
    const out = execFileSync('df', ['-kP', LOG_ROOT], { encoding: 'utf8', timeout: 5000 });
    const cols = out.trim().split('\n').pop().split(/\s+/);
    const totalKb = parseInt(cols[1], 10);
    const usedKb = parseInt(cols[2], 10);
    const freeKb = parseInt(cols[3], 10);
    if (!Number.isFinite(totalKb) || !totalKb) return null;
    let logsKb = 0;
    try {
      logsKb = parseInt(execFileSync('du', ['-skx', LOG_ROOT], { encoding: 'utf8', timeout: 20000 })
        .trim().split(/\s+/)[0], 10) || 0;
    } catch (e) {
      logsKb = 0;
    }
    return {
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      freeBytes: freeKb * 1024,
      logsBytes: logsKb * 1024,
      usedPercent: +((usedKb / totalKb) * 100).toFixed(1)
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  LOG_ROOT,
  storage,
  dirFor,
  purge,
  purgePreview,
  move,
  allFolders,
  list,
  mkdir,
  rename,
  remove,
  start,
  stop,
  state,
  sampleImu,
  sampleGps,
  sampleObd,
  reconcileInterrupted
};
