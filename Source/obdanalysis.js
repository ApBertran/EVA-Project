const STOICH_AFR = 14.7;
const GASOLINE_G_PER_L = 745;
const KPH_TO_MPH = 0.621371;
const L_PER_GAL = 3.785411784;

const MIN_GEAR_SPEED_KPH = 15;
const MIN_GEAR_RPM = 900;
const GEAR_TOLERANCE = 0.06;
/* 3% cleanly separates real gears from shift transients: in a 12 minute log
   the five real gears held 4.0-51.1% each, while every fabricated cluster sat
   under 2.2%. */
const MIN_GEAR_SHARE = 0.03;
const MIN_GEAR_SAMPLES = 20;
/* reject a ratio if it moved more than this between consecutive measured
   samples - that means the clutch is out and we are mid-shift */
const GEAR_STABLE_TOLERANCE = 0.04;
const GEAR_PAIR_WINDOW_MS = 500;

function seriesFor(rows, pid) {
  return rows.filter((r) => r.pid === pid).map((r) => ({ t: r.t, v: r.v }));
}

function sampleAt(series, t) {
  if (!series.length) return null;
  if (t <= series[0].t) return series[0].v;
  if (t >= series[series.length - 1].t) return series[series.length - 1].v;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  if (b.t === a.t) return a.v;
  const f = (t - a.t) / (b.t - a.t);
  return a.v + (b.v - a.v) * f;
}

function stats(series) {
  if (!series.length) return null;
  const values = series.map((s) => s.v);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    samples: values.length,
    min: +Math.min(...values).toFixed(2),
    max: +Math.max(...values).toFixed(2),
    mean: +(sum / values.length).toFixed(2)
  };
}

/* Gear ratios must come from MEASURED samples, never the 250ms interpolated
   timeline. Interpolating across a shift sweeps smoothly through every
   intermediate ratio, and those intermediates cluster into convincing but
   entirely fictional gears - a 5 speed manual was reported as 10 gears.
   Pair each measured RPM reading with a nearby measured speed reading, then
   keep only ratios that are stable against their neighbour. */
function measuredGearRatios(rpmSeries, speedSeries, tireFactor) {
  if (!rpmSeries.length || !speedSeries.length) return [];
  const raw = [];
  let si = 0;
  for (const r of rpmSeries) {
    while (si < speedSeries.length - 1 && speedSeries[si + 1].t <= r.t) si++;
    let best = speedSeries[si];
    if (si + 1 < speedSeries.length && Math.abs(speedSeries[si + 1].t - r.t) < Math.abs(best.t - r.t)) {
      best = speedSeries[si + 1];
    }
    if (Math.abs(best.t - r.t) > GEAR_PAIR_WINDOW_MS) continue;
    const v = best.v * tireFactor;
    if (v <= MIN_GEAR_SPEED_KPH || r.v <= MIN_GEAR_RPM) continue;
    raw.push({ t: r.t, ratio: r.v / v });
  }

  const stable = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[i - 1];
    const next = raw[i + 1];
    const close = (a, b) => a && b && Math.abs(a.ratio - b.ratio) / b.ratio <= GEAR_STABLE_TOLERANCE;
    if (close(prev, raw[i]) || close(next, raw[i])) stable.push(raw[i].ratio);
  }
  return stable;
}

function clusterGears(ratios) {
  if (ratios.length < 20) return [];
  const sorted = [...ratios].sort((a, b) => a - b);
  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const mean = current.reduce((a, b) => a + b, 0) / current.length;
    if (Math.abs(sorted[i] - mean) / mean <= GEAR_TOLERANCE) current.push(sorted[i]);
    else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  const total = ratios.length;
  return clusters
    .filter((c) => c.length >= MIN_GEAR_SAMPLES && c.length / total >= MIN_GEAR_SHARE)
    .map((c) => ({
      ratio: +(c.reduce((a, b) => a + b, 0) / c.length).toFixed(3),
      samples: c.length,
      share: +((c.length / total) * 100).toFixed(1)
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .map((c, i) => ({ gear: i + 1, ...c }));
}

function analyseObd(rows, options) {
  if (!rows || !rows.length) return null;
  const tireFactor = (options && options.tireFactor) || 1;

  const pids = [...new Set(rows.map((r) => r.pid))];
  const channels = {};
  for (const pid of pids) {
    const series = seriesFor(rows, pid);
    const meta = rows.find((r) => r.pid === pid);
    channels[pid] = { name: meta.name, unit: meta.unit, ...stats(series) };
  }

  const rpm = seriesFor(rows, '0C');
  const speed = seriesFor(rows, '0D');
  const maf = seriesFor(rows, '10');
  const throttle = seriesFor(rows, '11');
  /* extra channels for the graph view - sampled far slower than rpm/speed on
     J1850, so they interpolate into flatter traces, which is expected */
  const load = seriesFor(rows, '04');
  const coolant = seriesFor(rows, '05');
  const timing = seriesFor(rows, '0E');
  const iat = seriesFor(rows, '0F');

  const start = rows[0].t;
  const end = rows[rows.length - 1].t;
  const stepMs = 250;

  let distanceKm = 0;
  let fuelL = 0;
  let movingSeconds = 0;
  const timeline = [];

  for (let t = start; t <= end; t += stepMs) {
    const dt = stepMs / 1000;
    const v = speed.length ? sampleAt(speed, t) * tireFactor : null;
    const r = rpm.length ? sampleAt(rpm, t) : null;
    const m = maf.length ? sampleAt(maf, t) : null;
    const th = throttle.length ? sampleAt(throttle, t) : null;

    if (v !== null) {
      distanceKm += (v * dt) / 3600;
      if (v > 3) movingSeconds += dt;
    }
    let lph = null;
    if (m !== null) {
      lph = (m / STOICH_AFR / GASOLINE_G_PER_L) * 3600;
      fuelL += (lph * dt) / 3600;
    }
    const pick = (series) => (series.length ? +sampleAt(series, t).toFixed(1) : null);
    timeline.push({
      t,
      rpm: r === null ? null : Math.round(r),
      kph: v === null ? null : +v.toFixed(1),
      throttle: th === null ? null : +th.toFixed(1),
      lph: lph === null ? null : +lph.toFixed(2),
      maf: m === null ? null : +m.toFixed(1),
      load: pick(load),
      coolant: pick(coolant),
      timing: pick(timing),
      iat: pick(iat)
    });
  }

  const gears = clusterGears(measuredGearRatios(rpm, speed, tireFactor));
  for (const g of gears) {
    g.mphPer1000 = +((1000 / g.ratio) * KPH_TO_MPH).toFixed(1);
  }

  const distanceMi = distanceKm * KPH_TO_MPH;
  const fuelGal = fuelL / L_PER_GAL;
  const avgMpg = fuelGal > 0.001 ? +(distanceMi / fuelGal).toFixed(1) : null;

  const trimKey = { '06': 'stftB1', '07': 'ltftB1', '08': 'stftB2', '09': 'ltftB2' };
  const health = {};
  for (const [pid, key] of Object.entries(trimKey)) {
    if (channels[pid]) health[key] = channels[pid].mean;
  }
  if (health.ltftB1 !== undefined && health.ltftB2 !== undefined) {
    health.ltftAvg = +((health.ltftB1 + health.ltftB2) / 2).toFixed(2);
    health.bankSpread = +Math.abs(health.ltftB1 - health.ltftB2).toFixed(2);
  }

  const decimated = [];
  const stride = Math.max(1, Math.floor(timeline.length / 1200));
  for (let i = 0; i < timeline.length; i += stride) decimated.push(timeline[i]);

  return {
    channels,
    tireFactor,
    derived: {
      distanceKm: +distanceKm.toFixed(3),
      distanceMi: +distanceMi.toFixed(3),
      fuelL: +fuelL.toFixed(3),
      fuelGal: +fuelGal.toFixed(3),
      avgMpg,
      movingSeconds: +movingSeconds.toFixed(0),
      maxRpm: channels['0C'] ? channels['0C'].max : null,
      maxKph: channels['0D'] ? +(channels['0D'].max * tireFactor).toFixed(1) : null
    },
    gears,
    health,
    timeline: decimated
  };
}

function calibrateTireFactor(obdRows, gpsFixes) {
  const speed = seriesFor(obdRows, '0D');
  if (speed.length < 10 || !gpsFixes || gpsFixes.length < 10) return null;
  const pairs = [];
  for (const fix of gpsFixes) {
    if (typeof fix.speedKph !== 'number' || fix.speedKph < 30) continue;
    const obdKph = sampleAt(speed, fix.t);
    if (obdKph === null || obdKph < 30) continue;
    pairs.push(fix.speedKph / obdKph);
  }
  if (pairs.length < 20) return null;
  pairs.sort((a, b) => a - b);
  const median = pairs[Math.floor(pairs.length / 2)];
  const spread = pairs[Math.floor(pairs.length * 0.9)] - pairs[Math.floor(pairs.length * 0.1)];
  return {
    factor: +median.toFixed(4),
    samples: pairs.length,
    spread: +spread.toFixed(4),
    confident: spread < 0.06
  };
}

module.exports = { analyseObd, calibrateTireFactor, sampleAt };
