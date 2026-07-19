function themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const CHART_COLORS = {
  get teal() { return themeVar('--teal', '#3fd0b0'); },
  get orange() { return themeVar('--orange', '#ff7a33'); },
  get silver() { return themeVar('--silver', '#b7babc'); },
  get dim() { return themeVar('--silver-dim', '#7a8082'); },
  get line() { return themeVar('--line', '#2a3134'); }
};

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function gColor(g, maxG) {
  const t = Math.min(1, g / (maxG || 1));
  const [r0, g0, b0] = hexToRgb(CHART_COLORS.teal);
  const [r1, g1, b1] = hexToRgb(CHART_COLORS.orange);
  return `rgb(${Math.round(r0 + t * (r1 - r0))},${Math.round(g0 + t * (g1 - g0))},${Math.round(b0 + t * (b1 - b0))})`;
}

function drawFrictionCircle(canvas, scatter, maxG) {
  const { ctx, w, h } = setupCanvas(canvas);
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const radius = size / 2 - 34;
  const limit = Math.max(0.4, maxG);

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = CHART_COLORS.line;
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (radius * ring) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  ctx.fillStyle = CHART_COLORS.dim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BRAKE', cx, cy - radius - 10);
  ctx.fillText('THROTTLE', cx, cy + radius + 22);
  ctx.textAlign = 'right';
  ctx.fillText('RIGHT', cx - radius - 4, cy + 4);
  ctx.textAlign = 'left';
  ctx.fillText('LEFT', cx + radius + 4, cy + 4);

  ctx.textAlign = 'center';
  ctx.fillText(`${limit.toFixed(1)}g`, cx + radius * 0.72, cy - 6);

  for (const [lat, lon] of scatter) {
    const mag = Math.hypot(lat, lon);
    const x = cx + (lat / limit) * radius;
    const y = cy - (lon / limit) * radius;
    ctx.fillStyle = gColor(mag, limit);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTimeline(canvas, series) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!series.length) return;

  const peak = Math.max(0.3, ...series.map((s) => s.max));
  const pad = 18;
  const plotH = h - pad;
  const step = w / (series.length - 1 || 1);

  ctx.strokeStyle = CHART_COLORS.line;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = plotH - (plotH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillStyle = CHART_COLORS.dim;
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${((peak * i) / 3).toFixed(1)}g`, 2, y - 3);
  }

  ctx.beginPath();
  ctx.moveTo(0, plotH);
  series.forEach((s, i) => ctx.lineTo(i * step, plotH - (s.max / peak) * plotH));
  ctx.lineTo(w, plotH);
  ctx.closePath();
  ctx.fillStyle = CHART_COLORS.orange + '2b';
  ctx.fill();

  ctx.beginPath();
  series.forEach((s, i) => {
    const x = i * step;
    const y = plotH - (s.max / peak) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = CHART_COLORS.orange;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  series.forEach((s, i) => {
    const x = i * step;
    const y = plotH - (Math.abs(s.lat) / peak) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = CHART_COLORS.teal;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawTrack(canvas, track) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (track.length < 2) {
    ctx.fillStyle = CHART_COLORS.dim;
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No location data in this log', w / 2, h / 2);
    return;
  }

  const lats = track.map((p) => p.lat);
  const lons = track.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const scaleLon = Math.cos(midLat);
  const spanLon = Math.max(1e-7, (maxLon - minLon) * scaleLon);
  const spanLat = Math.max(1e-7, maxLat - minLat);
  const pad = 22;
  const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
  const offX = (w - spanLon * scale) / 2;
  const offY = (h - spanLat * scale) / 2;
  const project = (p) => [
    offX + (p.lon - minLon) * scaleLon * scale,
    h - (offY + (p.lat - minLat) * scale)
  ];

  const maxG = Math.max(0.3, ...track.map((p) => p.g));

  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < track.length; i++) {
    const [x0, y0] = project(track[i - 1]);
    const [x1, y1] = project(track[i]);
    ctx.strokeStyle = gColor(track[i].g, maxG);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  const [sx, sy] = project(track[0]);
  ctx.fillStyle = CHART_COLORS.teal;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createLinearGradient(pad, h - 12, pad + 120, h - 12);
  grad.addColorStop(0, gColor(0, maxG));
  grad.addColorStop(1, gColor(maxG, maxG));
  ctx.fillStyle = grad;
  ctx.fillRect(pad, h - 16, 120, 6);
  ctx.fillStyle = CHART_COLORS.dim;
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('0g', pad, h - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`${maxG.toFixed(2)}g`, pad + 120, h - 20);
}

/* Modular multi-channel plot.
 *
 * Each channel is scaled to its own min/max rather than a shared axis - rpm in
 * the thousands and throttle in percent have no meaningful common scale, and
 * forcing one flattens everything but the largest. Each trace therefore shows
 * shape and correlation over time; the legend carries the real units.
 */
const OBD_CHANNELS = {
  rpm:      { label: 'RPM',          unit: 'rpm',  color: () => CHART_COLORS.orange },
  kph:      { label: 'Speed',        unit: 'km/h', color: () => CHART_COLORS.teal },
  throttle: { label: 'Throttle',     unit: '%',    color: () => '#e8c547' },
  load:     { label: 'Engine Load',  unit: '%',    color: () => '#9b8bd6' },
  coolant:  { label: 'Coolant',      unit: '°C', color: () => '#e2725b' },
  maf:      { label: 'MAF',          unit: 'g/s',  color: () => '#5aa9e6' },
  timing:   { label: 'Timing',       unit: '°', color: () => '#7ec4a0' },
  iat:      { label: 'Intake Air',   unit: '°C', color: () => '#c98bb9' },
  lph:      { label: 'Fuel Rate',    unit: 'L/h',  color: () => '#d4915d' }
};

function drawChannels(canvas, timeline, keys, window) {
  /* window is {startT, endT} in absolute ms; slicing here rather than at the
     call site keeps the caller's full-resolution series intact for reset. */
  if (window && window.startT != null && window.endT != null) {
    const sliced = timeline.filter((p) => p.t >= window.startT && p.t <= window.endT);
    if (sliced.length > 1) timeline = sliced;
  }
  return drawChannelsInner(canvas, timeline, keys);
}

function drawChannelsInner(canvas, timeline, keys) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!timeline || !timeline.length || !keys.length) {
    ctx.fillStyle = CHART_COLORS.dim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Select a channel to plot', w / 2, h / 2);
    return;
  }

  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.strokeStyle = CHART_COLORS.line;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  const t0 = timeline[0].t;
  const tSpan = Math.max(1, timeline[timeline.length - 1].t - t0);

  // elapsed-time ticks along the bottom
  ctx.fillStyle = CHART_COLORS.dim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const secs = Math.round((tSpan / 1000) * (i / 4));
    const x = padL + (plotW * i) / 4;
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    ctx.fillText(`${mm}:${ss}`, x, h - 6);
  }

  for (const key of keys) {
    const spec = OBD_CHANNELS[key];
    if (!spec) continue;
    const vals = timeline.map((p) => (typeof p[key] === 'number' ? p[key] : null));
    const present = vals.filter((v) => v !== null);
    if (!present.length) continue;

    let lo = Math.min(...present);
    let hi = Math.max(...present);
    if (hi - lo < 1e-6) {
      hi += 1;
      lo -= 1;
    }

    ctx.beginPath();
    let started = false;
    vals.forEach((v, i) => {
      if (v === null) return;
      const x = padL + (plotW * (timeline[i].t - t0)) / tSpan;
      const y = padT + plotH - ((v - lo) / (hi - lo)) * plotH;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = spec.color();
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/* Legend lives in the DOM rather than the canvas so the ranges stay readable
   and selectable at a glance on a moving car's screen. */
function channelLegend(timeline, keys) {
  return keys
    .map((key) => {
      const spec = OBD_CHANNELS[key];
      if (!spec) return '';
      const present = timeline.map((p) => p[key]).filter((v) => typeof v === 'number');
      if (!present.length) return '';
      const lo = Math.min(...present);
      const hi = Math.max(...present);
      return `<div class="ch-legend-item"><span class="ch-swatch" style="background:${spec.color()}"></span>
        <span class="ch-name">${spec.label}</span>
        <span class="ch-range">${lo.toFixed(0)}–${hi.toFixed(0)} ${spec.unit}</span></div>`;
    })
    .join('');
}
