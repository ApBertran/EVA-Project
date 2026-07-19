const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MOUNT_PREFIXES = ['/media/', '/mnt/'];
const SKIP_FS = new Set(['tmpfs', 'devtmpfs', 'proc', 'sysfs', 'squashfs', 'overlay', 'devpts', 'cgroup2']);

function freeBytes(mountPoint) {
  try {
    const out = execFileSync('df', ['-B1', '--output=avail,size', mountPoint], { encoding: 'utf8' });
    const line = out.trim().split('\n').pop().trim().split(/\s+/);
    return { free: Number(line[0]) || 0, total: Number(line[1]) || 0 };
  } catch (e) {
    return { free: 0, total: 0 };
  }
}

function listTargets() {
  let mounts = '';
  try {
    mounts = fs.readFileSync('/proc/mounts', 'utf8');
  } catch (e) {
    return [];
  }

  const targets = [];
  for (const line of mounts.split('\n')) {
    const [device, rawPoint, fstype, opts] = line.split(' ');
    if (!rawPoint || SKIP_FS.has(fstype)) continue;
    const point = rawPoint.replace(/\\040/g, ' ');
    if (!MOUNT_PREFIXES.some((p) => point.startsWith(p))) continue;
    if (!device.startsWith('/dev/')) continue;

    const size = freeBytes(point);
    targets.push({
      device,
      path: point,
      name: path.basename(point),
      fstype,
      readOnly: (opts || '').split(',').includes('ro'),
      free: size.free,
      total: size.total
    });
  }
  return targets;
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let names;
    try {
      names = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of names) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(child);
      else {
        try {
          total += fs.statSync(child).size;
        } catch (e) {
          continue;
        }
      }
    }
  }
  return total;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function exportAll(logRoot, targetPath) {
  const targets = listTargets();
  const target = targets.find((t) => t.path === targetPath);
  if (!target) throw new Error('drive is no longer connected');
  if (target.readOnly) throw new Error('drive is mounted read-only');

  const needed = dirSize(logRoot);
  if (needed > target.free) {
    throw new Error(
      `need ${(needed / 1e6).toFixed(0)} MB but only ${(target.free / 1e6).toFixed(0)} MB free`
    );
  }

  const destination = path.join(targetPath, `EVA-Logs-${stamp()}`);
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(logRoot, destination, { recursive: true });

  try {
    execFileSync('sync', [], { timeout: 30000 });
  } catch (e) {
    /* best effort */
  }

  return { destination, bytes: needed };
}

module.exports = { listTargets, exportAll, dirSize };
