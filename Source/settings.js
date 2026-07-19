function openSettings() {
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

document.getElementById('settings-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'settings-overlay') closeSettings();
});

function persistSetting(key, value) {
  socket.emit('settings:set', { key, value: Number(value) });
}

/* Damping is a stepper, not a slider. A slider can jump many clicks from one
   stray touch; the servos track their own click position and driving them past
   the 1-32 range damages the shock. One tap can only ever move one click, and
   there is deliberately no press-and-hold repeat. */
const DAMPING_MIN = 1;
const DAMPING_MAX = 32;
let dampingValue = 16;

function renderDamping() {
  document.getElementById('damping-value').innerText = String(dampingValue);
  const span = DAMPING_MAX - DAMPING_MIN;
  const pct = ((dampingValue - DAMPING_MIN) / span) * 100;
  document.getElementById('damping-fill').style.width = `${pct}%`;
  document.getElementById('damping-down').disabled = dampingValue <= DAMPING_MIN;
  document.getElementById('damping-up').disabled = dampingValue >= DAMPING_MAX;
}

function nudgeDamping(delta) {
  const next = Math.min(DAMPING_MAX, Math.max(DAMPING_MIN, dampingValue + delta));
  if (next === dampingValue) return;
  dampingValue = next;
  renderDamping();
  persistSetting('damping', dampingValue);
}

document.getElementById('damping-down').addEventListener('click', () => nudgeDamping(-1));
document.getElementById('damping-up').addEventListener('click', () => nudgeDamping(1));

document.getElementById('maxG-slider').addEventListener('input', (event) => {
  persistSetting('maxG', event.target.value);
});

document.getElementById('disappearAfter-slider').addEventListener('input', (event) => {
  persistSetting('peakHold', event.target.value);
});

socket.on('config', (payload) => {
  if (!payload || !payload.settings) return;
  const s = payload.settings;
  const apply = (id, valueId, value, digits) => {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return;
    el.value = value;
    const label = document.getElementById(valueId);
    if (label) label.innerText = digits === null ? String(value) : Number(value).toFixed(digits);
  };
  apply('maxG-slider', 'maxG-value', s.maxG, 1);
  apply('disappearAfter-slider', 'disappearAfter-value', s.peakHold, 1);
  if (typeof s.damping === 'number') {
    dampingValue = Math.min(DAMPING_MAX, Math.max(DAMPING_MIN, Math.round(s.damping)));
    renderDamping();
  }
});

/* A scroll gesture that starts on a slider must scroll the panel, not drag the
   slider. touch-action:pan-y handles touch; this handles the wheel.
   preventDefault alone would also kill the scroll, so forward the delta to the
   nearest scrollable ancestor by hand. */
function scrollableAncestor(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

document.querySelectorAll('.slider').forEach((el) => {
  el.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const target = scrollableAncestor(el);
      if (target) target.scrollTop += event.deltaY;
    },
    { passive: false }
  );
});

renderDamping();
