/* Games portal: profiles, persistence, leaderboards, and the safety gate.
 *
 * The individual games live in gamesArcade.js and register themselves here.
 * This file owns everything they share, so a new game only needs a render
 * function and a metadata entry.
 *
 * The touchscreen reports as a single-pointer mouse, not a multi-touch device,
 * so no two-player game can require both players touching at once. Every
 * two-player entry here is turn-based or sequential by necessity.
 */
let gamesData = { profiles: [], activeProfile: null, scores: {}, saves: {}, colors: {} };
let gamesReady = false;
let activeGame = null;
let portalMode = null;          // 'solo' | 'duo' | null while choosing
let vehicleMoving = false;
let parkedOverride = false;
let duoPlayers = [null, null];       // both seats in a two-player session

/* Games render whoever is in each seat rather than "Player 1/2", so scores can
   be attributed and the screen reads like the people playing it. */
function duoName(i) {
  return duoPlayers[i] || `Player ${i + 1}`;
}

/* Each player picks a color once. Two-player games use it for pieces and
   turn indicators, so you can tell whose move it is without reading a name. */
const PLAYER_COLORS = [
  '#e8503a', '#b52d1c',   // red
  '#f0a06b', '#d97020',   // orange
  '#f2d06b', '#c9a227',   // gold
  '#7fe0a4', '#3f9e63',   // green
  '#a8c0a0', '#6e8a66',   // sage
  '#5fe0d0', '#2a9d8f',   // teal
  '#8fc7e8', '#3d7fb8',   // blue
  '#c9a8f0', '#7d4fc2',   // purple
  '#f0a8c8', '#cc5c8f',   // pink
  '#e8e6e0', '#8f9499'    // neutral
];

function colorOf(name, fallbackIndex) {
  const c = gamesData.colors && gamesData.colors[name];
  return c || PLAYER_COLORS[(fallbackIndex || 0) % PLAYER_COLORS.length];
}

function duoColor(i) {
  return colorOf(duoPlayers[i], i);
}

/* If both seats picked the same or near-identical colors, nudge the second one
   to a clearly distinct hue for the duration of the game. Two players whose
   pieces look alike makes a board unreadable. */
function hexToRgb(h) {
  const v = String(h).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function tooSimilar(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  /* weighted RGB distance, roughly perceptual and cheap */
  const d = Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
  return d < 120;
}

function duoColorsDistinct() {
  const a = duoColor(0);
  let b = duoColor(1);
  if (!tooSimilar(a, b)) return [a, b];
  const alt = PLAYER_COLORS.find((c) => !tooSimilar(c, a) && !tooSimilar(c, b));
  return [a, alt || '#e8e6e0'];
}

function setColor(name, hex) {
  if (!gamesData.colors) gamesData.colors = {};
  gamesData.colors[name] = hex;
  persist();
}

const GAMES = {};               // filled by gamesArcade.js

function registerGame(id, def) {
  GAMES[id] = { id, ...def };
}

/* ---------- persistence ---------- */

function persist() {
  socket.emit('games:save', gamesData);
}

function profile() {
  return gamesData.activeProfile;
}

function scoreFor(gameId, name) {
  const g = gamesData.scores[gameId] || {};
  return g[name || profile()] || null;
}

/* Returns whether this run beat the player's own previous best, so games can
   celebrate it. metric+lowerIsBetter describe what "best" means for that game.
   Passing a name records for a specific player, which is how two-player games
   attribute results to each seat. */
function recordScore(gameId, mutate, opts) {
  const o = opts || {};
  const name = o.name || profile();
  if (!name) return { improved: false };
  if (!gamesData.scores[gameId]) gamesData.scores[gameId] = {};
  const cur = gamesData.scores[gameId][name] || {};
  const prev = o.metric && Object.keys(cur).length ? o.metric(cur) : null;
  const next = mutate({ plays: 0, ...cur });
  gamesData.scores[gameId][name] = next;
  persist();
  if (!o.metric) return { improved: false };
  const now = o.metric(next);
  const improved = !isFinite(prev) || prev === null
    ? isFinite(now)
    : (o.lowerIsBetter ? now < prev : now > prev);
  /* compared against the pre-update table, so the player's own new value does
     not count as one of the scores it has to beat */
  const global = improved && isTableRecord(gameId, name, now, o.lowerIsBetter, o.metric);
  return { improved, global, prev, now, name };
}

/* Did this beat everyone, not just the player themselves? Checked against the
   other profiles' stored bests for the same game. */
function isTableRecord(gameId, playerName, value, lowerIsBetter, metric) {
  const table = gamesData.scores[gameId] || {};
  const others = Object.entries(table)
    .filter(([n]) => n !== playerName)
    .map(([, st]) => metric(st))
    .filter((v) => isFinite(v));
  if (!others.length) return false;      // nobody to beat yet
  return lowerIsBetter ? value < Math.min(...others) : value > Math.max(...others);
}

/* Full-stage celebration. Deliberately blocking rather than a toast - a record
   is the payoff, and on a car screen a 3-second toast is easy to miss. */
function showRecord(playerName, headline, detail, onContinue, isGlobal) {
  const stage = document.getElementById('game-stage');
  if (!stage) return;
  const color = colorOf(playerName, 0);
  window.__recordContinue = onContinue || (() => {});
  stage.innerHTML = `
    <div class="record-wrap ${isGlobal ? 'global' : ''}" onclick="window.__recordContinue()">
      <div class="record-burst" style="--rc:${color}">
        ${isGlobal
          ? `<svg viewBox="0 0 24 24"><path d="M5 20h14M6.5 20l-1.6-9.4 4.4 2.6L12 6l2.7 7.2 4.4-2.6L17.5 20z"/></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/></svg>`}
      </div>
      <div class="record-title">${isGlobal ? 'New leaderboard record' : 'New personal best'}</div>
      <div class="record-value" style="color:${color}">${headline}</div>
      <div class="record-who" style="color:${color}">${esc(playerName)}</div>
      <div class="record-detail">${detail || ''}</div>
      <div class="tree-sub">tap to continue</div>
    </div>`;
}

/* Saves are per player. A single shared slot meant whoever opened 2048 next
   resumed someone else's board and inherited their score. */
function saveKey(gameId) {
  return `${gameId}::${profile() || 'guest'}`;
}

function saveGameState(gameId, state) {
  gamesData.saves[saveKey(gameId)] = state;
  persist();
}

function loadGameState(gameId) {
  return gamesData.saves[saveKey(gameId)] || null;
}

function clearGameState(gameId) {
  delete gamesData.saves[saveKey(gameId)];
  persist();
}

/* ---------- safety ---------- */

/* Games unlock only when the car is stopped. OBD speed is authoritative when
   present; without it the user confirms once per session, since a head unit on
   a bench has no way to know. */
socket.on('obd:sample', (s) => {
  if (s && s.pid === '0D' && typeof s.v === 'number') {
    const moving = s.v > 2;
    if (moving !== vehicleMoving) {
      vehicleMoving = moving;
      if (moving && activeGame) suspendForMotion();
      renderPortal();
    }
  }
});

function canPlay() {
  return !vehicleMoving && (parkedOverride || obdConnectedForGames());
}

function obdConnectedForGames() {
  const pill = document.getElementById('obd-pill');
  return pill ? !pill.classList.contains('off') : false;
}

function suspendForMotion() {
  if (activeGame && GAMES[activeGame] && GAMES[activeGame].pause) GAMES[activeGame].pause();
  document.getElementById('games-body').innerHTML =
    `<div class="games-blocked">
       <div class="gb-title">Paused &mdash; car is moving</div>
       <div class="gb-sub">Your game is saved. It will still be here when you stop.</div>
     </div>`;
  activeGame = null;
}

function confirmParked() {
  parkedOverride = true;
  renderPortal();
}

/* ---------- portal ---------- */

function openGames() {
  document.getElementById('games-overlay').classList.add('open');
  if (!gamesReady) socket.emit('games:load');
  portalMode = null;
  activeGame = null;
  renderPortal();
}

function closeGames() {
  if (activeGame && GAMES[activeGame] && GAMES[activeGame].pause) GAMES[activeGame].pause();
  activeGame = null;
  document.getElementById('games-overlay').classList.remove('open');
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function renderPortal() {
  const body = document.getElementById('games-body');
  if (!body) return;

  if (!canPlay()) {
    body.innerHTML = `
      <div class="games-blocked">
        <div class="gb-title">${vehicleMoving ? 'Car is moving' : 'Confirm you are parked'}</div>
        <div class="gb-sub">${vehicleMoving
          ? 'Games unlock when the car comes to a stop.'
          : 'No engine data, so EVA cannot tell whether you are stopped.'}</div>
        ${vehicleMoving ? '' : '<button class="primary-btn" onclick="confirmParked()">We are parked</button>'}
      </div>`;
    return;
  }

  if (!profile()) return renderProfiles();
  if (!portalMode) return renderModeChoice();
  renderGameList();
}

function renderModeChoice() {
  document.getElementById('games-body').innerHTML = `
    <div class="portal">
      <div class="portal-who">Playing as <b>${esc(profile())}</b>
        <button class="ghost-btn small" onclick="renderProfiles()">Switch</button></div>
      ${duoPlayers[0] && duoPlayers[1]
        ? `<div class="dim">2P: ${esc(duoPlayers[0])} vs ${esc(duoPlayers[1])}
           <button class="ghost-btn small" onclick="portalMode='duo';renderDuoPick()">Change</button></div>` : ''}
      <div class="portal-choices">
        <button class="portal-card" onclick="chooseMode('solo')">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
          <span>Solo</span><em>Play on your own</em>
        </button>
        <button class="portal-card" onclick="chooseMode('duo')">
          <svg viewBox="0 0 24 24"><circle cx="8.5" cy="8" r="3.4"/><circle cx="17" cy="9.5" r="2.8"/><path d="M2 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 20a5.5 5.5 0 0 1 6.5-5.4"/></svg>
          <span>2 Player</span><em>Take turns on one screen</em>
        </button>
      </div>
      <button class="ghost-btn" onclick="renderLeaderboards()">Leaderboards</button>
    </div>`;
}

function chooseMode(mode) {
  portalMode = mode;
  if (mode === 'duo' && (!duoPlayers[0] || !duoPlayers[1])) {
    duoPlayers = [profile(), duoPlayers[1]];
    return renderDuoPick();
  }
  renderGameList();
}

/* Two-player needs a second name; previously it silently reused the single
   active profile for both seats. */
function renderDuoPick() {
  const seat = (i) => {
    const chosen = duoPlayers[i];
    const opts = gamesData.profiles
      .filter((p) => p !== duoPlayers[1 - i])
      .map((p) => `<button class="prof-pick ${p === chosen ? 'on' : ''}"
        onclick="setSeat(${i}, '${esc(p)}')">${esc(p)}</button>`).join('');
    const swatches = chosen ? PLAYER_COLORS.map((c) => `<button class="col-sw ${
      colorOf(chosen, i) === c ? 'on' : ''}" style="background:${c}"
      onclick="setColor('${esc(chosen)}','${c}');renderDuoPick()"></button>`).join('') : '';
    return `<div class="seat">
      <div class="seat-label">Player ${i + 1}${chosen
        ? `: <b style="color:${colorOf(chosen, i)}">${esc(chosen)}</b>` : ''}</div>
      <div class="seat-opts">${opts || '<div class="dim">No other players yet</div>'}</div>
      ${chosen ? `<div class="col-row">${swatches}</div>` : ''}
    </div>`;
  };
  document.getElementById('games-body').innerHTML = `
    <div class="games-head">
      <button class="ghost-btn" onclick="portalMode=null;renderPortal()">&larr; Back</button>
      <span class="games-mode">Who is playing?</span>
      <button class="ghost-btn" onclick="startDuo()" ${duoPlayers[0] && duoPlayers[1] ? '' : 'disabled'}>Start</button>
    </div>
    <div class="seats">${seat(0)}${seat(1)}</div>
    <div class="bt-manual">
      <input type="text" id="duo-input" class="text-input" placeholder="Add another player" onfocus="showKeyboard(this)">
      <button class="primary-btn" onclick="addDuoPlayer()">Add</button>
    </div>`;
}

function setSeat(i, name) {
  duoPlayers[i] = name;
  if (duoPlayers[1 - i] === name) duoPlayers[1 - i] = null;
  renderDuoPick();
}

function addDuoPlayer() {
  const input = document.getElementById('duo-input');
  const name = (input.value || '').trim().slice(0, 16);
  if (!name) return;
  if (!gamesData.profiles.includes(name)) gamesData.profiles.push(name);
  persist();
  if (!duoPlayers[0]) duoPlayers[0] = name;
  else if (!duoPlayers[1]) duoPlayers[1] = name;
  renderDuoPick();
}

function startDuo() {
  if (!duoPlayers[0] || !duoPlayers[1]) return;
  renderGameList();
}

function renderGameList() {
  const list = Object.values(GAMES).filter((g) => g.modes.includes(portalMode));
  const cards = list.map((g) => {
    const s = scoreFor(g.id);
    const resumable = g.resumable && loadGameState(g.id);
    return `<button class="game-card" onclick="launchGame('${g.id}')">
      <div class="game-art">${g.art}</div>
      <div class="game-name">${g.name}</div>
      <div class="game-meta">${resumable ? '<span class="resume">Resume</span> ' : ''}${
        s && g.summary ? esc(g.summary(s)) : esc(g.blurb)}</div>
    </button>`;
  }).join('');

  document.getElementById('games-body').innerHTML = `
    <div class="games-head">
      <button class="ghost-btn" onclick="portalMode=null;renderPortal()">&larr; Back</button>
      <span class="games-mode">${portalMode === 'solo' ? 'Solo' : '2 Player'}</span>
      <button class="ghost-btn" onclick="renderLeaderboards()">Leaderboards</button>
    </div>
    <div class="game-grid">${cards}</div>`;
}

function launchGame(id) {
  const g = GAMES[id];
  if (!g) return;
  activeGame = id;
  document.getElementById('games-body').innerHTML =
    `<div class="games-head">
       <button class="ghost-btn" onclick="exitGame()">&larr; Games</button>
       <span class="games-mode">${g.name}</span>
       <span id="game-status" class="game-status"></span>
     </div>
     <div id="game-stage" class="game-stage"></div>`;
  g.start(document.getElementById('game-stage'), portalMode);
}

function exitGame() {
  const g = GAMES[activeGame];
  if (g && g.pause) g.pause();
  activeGame = null;
  renderGameList();
}

function setStatus(html) {
  const el = document.getElementById('game-status');
  if (el) el.innerHTML = html;
}

/* ---------- profiles ---------- */

function renderProfiles() {
  const rows = gamesData.profiles.map((p, i) => `
    <div class="prof-row ${p === profile() ? 'on' : ''}">
      <span class="prof-dot" style="background:${colorOf(p, i)}"></span>
      <button class="prof-pick" onclick="pickProfile('${esc(p)}')">${esc(p)}</button>
      <button class="ghost-btn small" onclick="editColor('${esc(p)}')">Color</button>
      <button class="ghost-btn danger small" onclick="removeProfile('${esc(p)}')">Remove</button>
    </div>
    <div class="col-row" id="col-${esc(p)}" style="display:none">${
      PLAYER_COLORS.map((c) => `<button class="col-sw ${colorOf(p, i) === c ? 'on' : ''}"
        style="background:${c}" onclick="setColor('${esc(p)}','${c}');renderProfiles()"></button>`).join('')
    }</div>`).join('');
  document.getElementById('games-body').innerHTML = `
    <div class="portal">
      <div class="portal-who">Who is playing?</div>
      <div class="prof-list">${rows || '<div class="dim">No players yet.</div>'}</div>
      <div class="bt-manual">
        <input type="text" id="prof-input" class="text-input" placeholder="New player name" onfocus="showKeyboard(this)">
        <button class="primary-btn" onclick="addProfile()">Add</button>
      </div>
    </div>`;
}

function editColor(name) {
  const el = document.getElementById(`col-${name}`);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function addProfile() {
  const input = document.getElementById('prof-input');
  const name = (input.value || '').trim().slice(0, 16);
  if (!name) return;
  if (!gamesData.profiles.includes(name)) gamesData.profiles.push(name);
  gamesData.activeProfile = name;
  persist();
  portalMode = null;
  renderPortal();
}

function pickProfile(name) {
  gamesData.activeProfile = name;
  persist();
  portalMode = null;
  renderPortal();
}

function removeProfile(name) {
  gamesData.profiles = gamesData.profiles.filter((p) => p !== name);
  if (gamesData.activeProfile === name) gamesData.activeProfile = gamesData.profiles[0] || null;
  /* scores are deliberately kept - removing a player from the picker should
     not silently destroy their history */
  persist();
  renderProfiles();
}

/* ---------- leaderboards ---------- */

function renderLeaderboards() {
  const boards = Object.values(GAMES).filter((g) => g.leaderboard).map((g) => {
    const table = gamesData.scores[g.id] || {};
    const rows = Object.entries(table)
      .map(([name, s]) => ({ name, s, sort: g.leaderboard.sort(s) }))
      .filter((r) => isFinite(r.sort))
      .sort((a, b) => (g.leaderboard.lowerIsBetter ? a.sort - b.sort : b.sort - a.sort))
      .slice(0, 6);
    if (!rows.length) return '';
    return `<div class="lb-card">
      <div class="lb-title">${g.name}<span>${esc(g.leaderboard.label)}</span></div>
      ${rows.map((r, i) => `<div class="lb-row ${r.name === profile() ? 'me' : ''}">
        <b>${i + 1}</b>
        <span class="lb-dot" style="background:${colorOf(r.name, i)}"></span>
        <span>${esc(r.name)}</span><em>${esc(g.leaderboard.format(r.s))}</em>
      </div>`).join('')}
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('games-body').innerHTML = `
    <div class="games-head">
      <button class="ghost-btn" onclick="renderPortal()">&larr; Back</button>
      <span class="games-mode">Leaderboards</span>
    </div>
    <div class="lb-grid">${boards || '<div class="dim">Play a few games and they will show up here.</div>'}</div>`;
}

/* ---------- wiring ---------- */

socket.on('games:data', (data) => {
  if (!data) return;
  gamesData = { profiles: [], activeProfile: null, scores: {}, saves: {}, colors: {}, ...data };
  /* carry over anything saved under the earlier British spelling */
  if (data.colors && !Object.keys(gamesData.colors).length) gamesData.colors = data.colors;
  gamesReady = true;
  if (document.getElementById('games-overlay').classList.contains('open') && !activeGame) renderPortal();
});

document.addEventListener('DOMContentLoaded', () => {
  socket.emit('games:load');
});
