const CALIB_STEPS = {
  rest: {
    title: 'Stationary',
    cue: 'Stay still',
    instruction: 'Park the car and keep it still. This finds which axis points down.',
    ms: 3000,
    countdown: 3
  },
  brake: {
    title: 'Braking',
    cue: 'Brake now',
    instruction: 'Get to a steady 20-30 mph in a straight line. Tap start, then brake firmly when the screen says so.',
    ms: 4000,
    countdown: 5
  },
  left: {
    title: 'Left Turn',
    cue: 'Turn left',
    instruction: 'Drive a steady left turn — a roundabout or a parking lot circle is ideal. Tap start, then hold the turn.',
    ms: 4000,
    countdown: 5
  }
};

const MIN_SIGNAL = 0.12;

let calibResults = {};
let calibStep = null;
let calibTimer = null;

function openCalibration() {
  calibResults = {};
  calibStep = null;
  document.getElementById('calib-modal').classList.add('open');
  renderCalibIntro();
}

function closeCalibration() {
  if (calibTimer) clearInterval(calibTimer);
  calibTimer = null;
  calibStep = null;
  document.getElementById('calib-modal').classList.remove('open');
}

function calibBody(html) {
  document.getElementById('calib-body').innerHTML = html;
}

function renderCalibIntro() {
  calibBody(`
    <div class="calib-warning">
      <b>Have a passenger work the screen, or use an empty lot.</b>
      Each step counts down first so you can keep your eyes on the road while driving.
    </div>
    <p class="chart-note">
      EVA needs to learn how the sensor is mounted before it can tell braking from cornering.
      Three short steps, about a minute total.
    </p>
    <ol class="calib-list">
      <li><b>Stationary</b> — finds which axis points down</li>
      <li><b>Braking</b> — finds the forward axis and its direction</li>
      <li><b>Left turn</b> — finds the sideways axis and its direction</li>
    </ol>
    <button class="primary-btn wide" onclick="beginCalibStep('rest')">Start</button>`);
}

function beginCalibStep(step) {
  calibStep = step;
  const cfg = CALIB_STEPS[step];
  let remaining = cfg.countdown;

  const paint = () => {
    calibBody(`
      <div class="calib-stage">
        <div class="calib-label">${cfg.title}</div>
        <div class="calib-count">${remaining}</div>
        <p class="chart-note">${cfg.instruction}</p>
      </div>`);
  };
  paint();

  calibTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      paint();
      return;
    }
    clearInterval(calibTimer);
    calibTimer = null;
    calibBody(`
      <div class="calib-stage active">
        <div class="calib-label">${cfg.title}</div>
        <div class="calib-cue">${cfg.cue}</div>
        <div class="calib-bar"><i style="animation-duration:${cfg.ms}ms"></i></div>
      </div>`);
    socket.emit('calib:capture', { ms: cfg.ms, step });
  }, 1000);
}

function calibError(message, retryStep) {
  calibBody(`
    <div class="calib-warning error"><b>Couldn't read that.</b> ${message}</div>
    <button class="primary-btn wide" onclick="beginCalibStep('${retryStep}')">Try again</button>
    <button class="ghost-btn wide" onclick="closeCalibration()">Cancel</button>`);
}

function handleCalibResult(result) {
  if (result.step !== calibStep) return;
  if (result.error) {
    calibError(result.error, result.step);
    return;
  }

  calibResults[result.step] = result;

  if (result.step === 'rest') {
    renderCalibStepDone('rest', `Down axis is ${axisName(result.vertical)}.`, 'brake');
    return;
  }

  if (result.magnitude < MIN_SIGNAL) {
    calibError(
      `Only ${result.magnitude.toFixed(2)} g was measured — not enough to tell the axes apart. Try a firmer input.`,
      result.step
    );
    return;
  }

  if (result.step === 'brake') {
    renderCalibStepDone(
      'brake',
      `Forward axis is ${axisName(result.axis)}, ${result.magnitude.toFixed(2)} g measured.`,
      'left'
    );
    return;
  }

  if (result.step === 'left') {
    if (result.axis === calibResults.brake.axis) {
      calibError('The turn moved the same axis as braking. Make sure the brake step was a straight-line stop.', 'left');
      return;
    }
    renderCalibReview();
  }
}

function axisName(i) {
  return ['X', 'Y', 'Z'][i] || '?';
}

function renderCalibStepDone(step, detail, next) {
  calibBody(`
    <div class="calib-stage done">
      <div class="calib-label">${CALIB_STEPS[step].title} captured</div>
      <div class="calib-detail">${detail}</div>
    </div>
    <button class="primary-btn wide" onclick="beginCalibStep('${next}')">Next: ${CALIB_STEPS[next].title}</button>`);
}

function computedAxes() {
  const brake = calibResults.brake;
  const left = calibResults.left;
  return {
    longitudinal: brake.axis,
    lateral: left.axis,
    longitudinalInvert: brake.positive,
    lateralInvert: !left.positive
  };
}

function renderCalibReview() {
  const axes = computedAxes();
  calibBody(`
    <div class="calib-stage done">
      <div class="calib-label">Calibration complete</div>
    </div>
    <div class="detail-grid">
      <div><span>Forward axis</span><b>${axisName(axes.longitudinal)}${axes.longitudinalInvert ? ' (inverted)' : ''}</b></div>
      <div><span>Sideways axis</span><b>${axisName(axes.lateral)}${axes.lateralInvert ? ' (inverted)' : ''}</b></div>
      <div><span>Braking measured</span><b>${calibResults.brake.magnitude.toFixed(2)} g</b></div>
      <div><span>Cornering measured</span><b>${calibResults.left.magnitude.toFixed(2)} g</b></div>
    </div>
    <p class="chart-note">
      New recordings use this immediately. Existing logs keep their old numbers until you reopen them and tap Recompute.
    </p>
    <button class="primary-btn wide" onclick="saveCalibration()">Save</button>
    <button class="ghost-btn wide" onclick="beginCalibStep('brake')">Redo driving steps</button>`);
}

function saveCalibration() {
  socket.emit('axes:set', computedAxes());
  const toast = document.getElementById('toast');
  toast.innerText = 'Calibration saved';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
  closeCalibration();
}

socket.on('calib:result', handleCalibResult);
