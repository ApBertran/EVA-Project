/* Lights tab: RGB sliders driving the strip over GPIO PWM.
 *
 * The previous version updated a CSS preview swatch and called updateData(),
 * which was an empty stub - the sliders were not connected to anything.
 */

const rSlider = document.getElementById('redRange');
const rOutput = document.getElementById('redVal');
const gSlider = document.getElementById('greenRange');
const gOutput = document.getElementById('greenVal');
const bSlider = document.getElementById('blueRange');
const bOutput = document.getElementById('blueVal');

/* A drag fires oninput continuously. Sending every event would flood the
   socket and the helper's stdin, so coalesce to one write per frame and always
   send the final position. */
let pendingLights = null;
let lightsFrame = null;

function pushLights() {
  lightsFrame = null;
  if (!pendingLights) return;
  socket.emit('lights:set', pendingLights);
  pendingLights = null;
}

function queueLights(patch) {
  pendingLights = { ...(pendingLights || {}), ...patch };
  if (lightsFrame === null) lightsFrame = requestAnimationFrame(pushLights);
}

function paintSwatch() {
  const root = document.documentElement.style;
  root.setProperty('--redVal', rSlider.value);
  root.setProperty('--greenVal', gSlider.value);
  root.setProperty('--blueVal', bSlider.value);
}

function bindChannel(slider, output, key) {
  if (!slider || !output) return;
  output.innerHTML = slider.value;
  slider.oninput = function () {
    output.innerHTML = this.value;
    paintSwatch();
    queueLights({ [key]: Number(this.value) });
  };
}

bindChannel(rSlider, rOutput, 'r');
bindChannel(gSlider, gOutput, 'g');
bindChannel(bSlider, bOutput, 'b');

/* Reflect whatever the strip is actually set to, including the colour restored
   from config at boot - the sliders should never disagree with the hardware. */
socket.on('lights:state', (state) => {
  if (!state) return;
  const set = (slider, output, value) => {
    if (!slider || document.activeElement === slider) return;
    slider.value = value;
    if (output) output.innerHTML = value;
  };
  set(rSlider, rOutput, state.r);
  set(gSlider, gOutput, state.g);
  set(bSlider, bOutput, state.b);
  paintSwatch();

  const badge = document.getElementById('lights-backend');
  if (badge) {
    badge.innerText = state.backend ? state.backend : 'no GPIO';
    badge.classList.toggle('warn', !state.backend);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  paintSwatch();
  socket.emit('lights:get');
});
