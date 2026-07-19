let themeMode = 'auto';
let themeFix = null;
let appliedTheme = null;

function applyTheme(mode) {
  if (mode === appliedTheme) return;
  appliedTheme = mode;
  document.documentElement.setAttribute('data-theme', mode);
  if (typeof detailSeries !== 'undefined' && detailSeries) {
    const active = document.querySelector('.dtab.active');
    if (active) active.click();
  }
}

function resolveTheme() {
  if (themeMode === 'day' || themeMode === 'night') return { mode: themeMode, source: 'manual' };
  const opts = { now: new Date() };
  if (themeFix) {
    opts.lat = themeFix.lat;
    opts.lon = themeFix.lon;
  }
  return DaylightClient.resolve(opts);
}

function refreshTheme() {
  const result = resolveTheme();
  applyTheme(result.mode);
  const label = document.getElementById('theme-status');
  if (label) {
    if (result.source === 'manual') label.innerText = `manual ${result.mode}`;
    else if (result.source === 'solar')
      label.innerText = `${result.mode} - sunset ${DaylightClient.formatMinutes(result.sunsetMin)}`;
    else label.innerText = `${result.mode} - no GPS, using 7am/7pm`;
  }
  return result;
}

function setThemeMode(mode) {
  themeMode = mode;
  cacheThemeHint('eva.theme.mode', mode);
  socket.emit('settings:theme', { mode });
  refreshTheme();
  document.querySelectorAll('.theme-option').forEach((b) => {
    b.classList.toggle('selected', b.dataset.mode === mode);
  });
}

/* Cache what themeBoot.js needs to get the next boot right before first paint. */
function cacheThemeHint(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* non-fatal: we just lose the pre-paint hint */
  }
}

socket.on('config', (payload) => {
  if (!payload) return;
  if (payload.theme && payload.theme.mode && payload.theme.mode !== themeMode) {
    themeMode = payload.theme.mode;
    cacheThemeHint('eva.theme.mode', themeMode);
    document.querySelectorAll('.theme-option').forEach((b) => {
      b.classList.toggle('selected', b.dataset.mode === themeMode);
    });
  }
  refreshTheme();
});

socket.on('gps:fix', (fix) => {
  if (typeof fix.lat === 'number' && typeof fix.lon === 'number') {
    const moved = !themeFix || Math.abs(themeFix.lat - fix.lat) > 0.5 || Math.abs(themeFix.lon - fix.lon) > 0.5;
    themeFix = { lat: fix.lat, lon: fix.lon };
    cacheThemeHint('eva.theme.fix', JSON.stringify(themeFix));
    if (moved) refreshTheme();
  }
});

refreshTheme();
setInterval(refreshTheme, 60000);
