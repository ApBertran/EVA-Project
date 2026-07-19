const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { analyseObd, calibrateTireFactor } = require('./obdanalysis');

const DEFAULT_AXES = {
  lateral: 1,
  longitudinal: 0,
  lateralInvert: false,
  longitudinalInvert: false
};

const CORNER_THRESHOLD = 0.15;
const BRAKE_THRESHOLD = 0.15;
const MIN_EVENT_MS = 300;
const SERIES_POINTS = 2000;
const SCATTER_POINTS = 1500;
const HIST_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function readJsonl(file, onRow) {
  if (!fs.existsSync(file)) return 0;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      onRow(JSON.parse(trimmed));
      count++;
    } catch (e) {
      continue;
    }
  }
  return count;
}

function detectEvents(samples, pick, threshold, sign) {
  const events = [];
  let current = null;
  for (const s of samples) {
    const value = pick(s);
    const active = sign > 0 ? value > threshold : value < -threshold;
    if (active) {
      if (!current) current = { startT: s.t, endT: s.t, peak: Math.abs(value) };
      else {
        current.endT = s.t;
        current.peak = Math.max(current.peak, Math.abs(value));
      }
    } else if (current) {
      if (current.endT - current.startT >= MIN_EVENT_MS) events.push(current);
      current = null;
    }
  }
  if (current && current.endT - current.startT >= MIN_EVENT_MS) events.push(current);
  return events;
}

function bucketSeries(samples, count) {
  if (samples.length <= count) return samples;
  const out = [];
  const size = samples.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * size);
    const end = Math.min(samples.length, Math.floor((i + 1) * size));
    if (end <= start) continue;
    let minC = Infinity;
    let maxC = -Infinity;
    let latSum = 0;
    let lonSum = 0;
    let n = 0;
    let rep = samples[start];
    for (let k = start; k < end; k++) {
      const s = samples[k];
      if (s.c < minC) minC = s.c;
      if (s.c > maxC) {
        maxC = s.c;
        rep = s;
      }
      latSum += s.lat;
      lonSum += s.lon;
      n++;
    }
    out.push({
      t: rep.t,
      lat: +(latSum / n).toFixed(4),
      lon: +(lonSum / n).toFixed(4),
      min: +minC.toFixed(4),
      max: +maxC.toFixed(4)
    });
  }
  return out;
}

function sparklineSvg(series) {
  if (!series.length) return null;
  const w = 240;
  const h = 60;
  const peak = Math.max(0.2, ...series.map((s) => s.max));
  const step = w / (series.length - 1 || 1);
  const pts = series.map((s, i) => `${(i * step).toFixed(1)},${(h - (s.max / peak) * h).toFixed(1)}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M0,${h} L${pts.join(' L')} L${w},${h} Z" fill="rgba(255,122,51,0.18)"/><polyline points="${pts.join(' ')}" fill="none" stroke="#ff7a33" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

function traceSvg(fixes) {
  if (fixes.length < 2) return null;
  const lats = fixes.map((f) => f.lat);
  const lons = fixes.map((f) => f.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const scaleLon = Math.cos((midLat * Math.PI) / 180);

  const spanLon = Math.max(1e-6, (maxLon - minLon) * scaleLon);
  const spanLat = Math.max(1e-6, maxLat - minLat);
  const w = 240;
  const h = 120;
  const pad = 8;
  const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
  const offsetX = (w - spanLon * scale) / 2;
  const offsetY = (h - spanLat * scale) / 2;

  const pts = fixes.map((f) => {
    const x = offsetX + (f.lon - minLon) * scaleLon * scale;
    const y = h - (offsetY + (f.lat - minLat) * scale);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="#3fd0b0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function analyze(dir, axesConfig, options) {
  const axes = { ...DEFAULT_AXES, ...(axesConfig || {}) };
  const vertIndex = 3 - axes.lateral - axes.longitudinal;
  const latSign = axes.lateralInvert ? -1 : 1;
  const lonSign = axes.longitudinalInvert ? -1 : 1;

  const samples = [];
  const absLat = [];
  const absLon = [];
  const combined = [];
  const vert = [];
  let jerkSum = 0;
  let jerkCount = 0;
  let prev = null;

  await readJsonl(path.join(dir, 'gforce.jsonl'), (row) => {
    const acc = row && (Array.isArray(row.a) ? row.a : row.g);
    if (!Array.isArray(acc)) return;
    const lat = acc[axes.lateral] * latSign;
    const lon = acc[axes.longitudinal] * lonSign;
    const v = acc[vertIndex];
    const c = Math.hypot(lat, lon);
    samples.push({ t: row.t, lat, lon, c });
    absLat.push(Math.abs(lat));
    absLon.push(Math.abs(lon));
    combined.push(c);
    vert.push(v);
    if (prev) {
      const dt = (row.t - prev.t) / 1000;
      if (dt > 0 && dt < 1) {
        jerkSum += ((lat - prev.lat) ** 2 + (lon - prev.lon) ** 2) / (dt * dt);
        jerkCount++;
      }
    }
    prev = { t: row.t, lat, lon };
  });

  const fixes = [];
  await readJsonl(path.join(dir, 'gps.jsonl'), (row) => {
    if (typeof row.lat === 'number' && typeof row.lon === 'number') fixes.push(row);
  });

  const obdRows = [];
  await readJsonl(path.join(dir, 'obd.jsonl'), (row) => {
    if (row && row.pid && typeof row.v === 'number') obdRows.push(row);
  });

  if (!samples.length && !fixes.length && !obdRows.length) return null;

  const sortedLat = [...absLat].sort((a, b) => a - b);
  const sortedLon = [...absLon].sort((a, b) => a - b);
  const sortedC = [...combined].sort((a, b) => a - b);

  const vertMean = vert.length ? vert.reduce((a, b) => a + b, 0) / vert.length : 0;
  const roughness = vert.length
    ? Math.sqrt(vert.reduce((a, b) => a + (b - vertMean) ** 2, 0) / vert.length)
    : 0;

  const brakes = detectEvents(samples, (s) => s.lon, BRAKE_THRESHOLD, -1);
  const accels = detectEvents(samples, (s) => s.lon, BRAKE_THRESHOLD, 1);
  const cornersL = detectEvents(samples, (s) => s.lat, CORNER_THRESHOLD, 1);
  const cornersR = detectEvents(samples, (s) => s.lat, CORNER_THRESHOLD, -1);

  const durationMs = samples.length ? samples[samples.length - 1].t - samples[0].t : 0;
  const histogram = HIST_BUCKETS.map((edge, i) => {
    const lower = i === 0 ? 0 : HIST_BUCKETS[i - 1];
    const n = combined.filter((c) => c >= lower && c < edge).length;
    return { from: lower, to: edge, seconds: +(n * (durationMs / 1000) / (combined.length || 1)).toFixed(1) };
  });

  let distanceKm = 0;
  let maxSpeedKph = 0;
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    const x = dLon * Math.cos(midLat);
    distanceKm += Math.sqrt(dLat * dLat + x * x) * 6371;
    if (typeof b.speedKph === 'number') maxSpeedKph = Math.max(maxSpeedKph, b.speedKph);
  }

  const step = Math.max(1, Math.floor(samples.length / SCATTER_POINTS));
  const scatter = [];
  for (let i = 0; i < samples.length; i += step) {
    scatter.push([+samples[i].lat.toFixed(3), +samples[i].lon.toFixed(3)]);
  }

  const series = bucketSeries(samples, SERIES_POINTS);

  const fixStep = Math.max(1, Math.floor(fixes.length / SERIES_POINTS));
  const track = [];
  for (let i = 0; i < fixes.length; i += fixStep) {
    const f = fixes[i];
    const nearest = samples.length
      ? samples[Math.min(samples.length - 1, Math.round(((f.t - samples[0].t) / (durationMs || 1)) * (samples.length - 1)))]
      : null;
    track.push({
      lat: +f.lat.toFixed(6),
      lon: +f.lon.toFixed(6),
      g: nearest ? +nearest.c.toFixed(3) : 0,
      speed: typeof f.speedKph === 'number' ? +f.speedKph.toFixed(1) : null
    });
  }

  const summary = {
    version: 1,
    computedAt: Date.now(),
    axes,
    samples: samples.length,
    fixes: fixes.length,
    lateral: {
      peak: +percentile(sortedLat, 100).toFixed(3),
      sustained: +percentile(sortedLat, 95).toFixed(3)
    },
    longitudinal: {
      peakBraking: +Math.abs(Math.min(0, ...samples.map((s) => s.lon))).toFixed(3),
      peakAccel: +Math.max(0, ...samples.map((s) => s.lon)).toFixed(3),
      sustained: +percentile(sortedLon, 95).toFixed(3)
    },
    combined: {
      peak: +percentile(sortedC, 100).toFixed(3),
      sustained: +percentile(sortedC, 95).toFixed(3)
    },
    events: {
      braking: brakes.length,
      acceleration: accels.length,
      cornersLeft: cornersL.length,
      cornersRight: cornersR.length,
      hardestBrake: brakes.length ? +Math.max(...brakes.map((b) => b.peak)).toFixed(3) : 0,
      hardestCorner: +Math.max(0, ...cornersL.concat(cornersR).map((c) => c.peak)).toFixed(3)
    },
    smoothness: jerkCount ? +Math.sqrt(jerkSum / jerkCount).toFixed(3) : 0,
    roughness: +roughness.toFixed(4),
    histogram,
    gps: fixes.length
      ? { distanceKm: +distanceKm.toFixed(2), maxSpeedKph: +maxSpeedKph.toFixed(1) }
      : null,
    obd: obd ? { channels: obd.channels, derived: obd.derived, gears: obd.gears, health: obd.health } : null,
    tireCal
  };

  const obd = obdRows.length
    ? analyseObd(obdRows, { tireFactor: (axesConfig && axesConfig.tireFactor) || (options && options.tireFactor) || 1 })
    : null;
  const tireCal = obdRows.length && fixes.length ? calibrateTireFactor(obdRows, fixes) : null;

  const signature = fixes.length >= 2 ? traceSvg(fixes) : sparklineSvg(series);

  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary));
  fs.writeFileSync(
    path.join(dir, 'series.json'),
    JSON.stringify({ series, scatter, track, obd: obd ? obd.timeline : null })
  );
  if (signature) fs.writeFileSync(path.join(dir, 'signature.svg'), signature);

  return summary;
}

module.exports = { analyze, DEFAULT_AXES };
