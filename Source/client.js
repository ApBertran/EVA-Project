const SMOOTHING = 0.35;
const SPIKE_WINDOW = 19;

const LATERAL_INDEX = 1;
const LONGITUDINAL_INDEX = 0;
const LATERAL_INVERTED = false;
const LONGITUDINAL_INVERTED = false;
const SHOW_FELT_DIRECTION = true;

let peak = {
    magnitude: 0,
    angle: 0,
    timer: null,
    hideTimer: null,
    showAfter: 1500,
    disappearAfter: 5000
};

let maxG = 1.5;

function createFilter() {
  return { window: [], value: null };
}

function applyFilter(filter, sample) {
  filter.window.push(sample);
  if (filter.window.length > SPIKE_WINDOW) filter.window.shift();

  const despiked = filter.window.length === SPIKE_WINDOW
    ? [...filter.window].sort((a, b) => a - b)[(SPIKE_WINDOW - 1) >> 1]
    : sample;

  filter.value = filter.value === null
    ? despiked
    : filter.value + SMOOTHING * (despiked - filter.value);

  return filter.value;
}

const lateralFilter = createFilter();
const longitudinalFilter = createFilter();

const socket = io.connect('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gforce-update', (gForceArray) => {
  const vector = document.getElementById('vector');
  const gForceText = document.getElementById('g-force-text');
  const peakVector = document.getElementById('peak-vector');
  const peakText = document.getElementById('peak-text');

  const lateral = applyFilter(
    lateralFilter,
    gForceArray[LATERAL_INDEX] * (LATERAL_INVERTED ? -1 : 1)
  );
  const longitudinal = applyFilter(
    longitudinalFilter,
    gForceArray[LONGITUDINAL_INDEX] * (LONGITUDINAL_INVERTED ? -1 : 1)
  );

  const sign = SHOW_FELT_DIRECTION ? -1 : 1;
  const right = lateral * sign;
  const up = longitudinal * sign;

  const angle = Math.atan2(right, up) * (180 / Math.PI);
  const magnitude = Math.hypot(right, up);
  const needleLength = Math.min(magnitude / maxG, 1);

  vector.style.transform = `translateX(-50%) translateY(-100%) rotate(${angle}deg) scaleY(${needleLength})`;
  gForceText.innerText = `${magnitude.toFixed(2)} G`;

  if (magnitude > peak.magnitude) {
    if (peak.timer) clearTimeout(peak.timer);
    if (peak.hideTimer) clearTimeout(peak.hideTimer);
    peak.magnitude = magnitude;
    peak.angle = angle;

    peak.timer = setTimeout(() => {
      const peakLength = Math.min(peak.magnitude / maxG, 1);
      peakVector.style.transform = `translateX(-50%) translateY(-100%) rotate(${peak.angle}deg) scaleY(${peakLength})`;
      peakVector.style.display = 'block';
      peakText.innerText = `${peak.magnitude.toFixed(2)} G`;

      peak.hideTimer = setTimeout(() => {
        peakVector.style.display = 'none';
        peak.magnitude = 0;
      }, peak.disappearAfter);
    }, peak.showAfter);
  }
});

document.getElementById('maxG-slider').addEventListener('input', (event) => {
  maxG = parseFloat(event.target.value);
  document.getElementById('maxG-value').innerText = maxG.toFixed(1);
});

document.getElementById('disappearAfter-slider').addEventListener('input', (event) => {
  peak.disappearAfter = parseFloat(event.target.value) * 1000;
  document.getElementById('disappearAfter-value').innerText = parseFloat(event.target.value).toFixed(1);
});
