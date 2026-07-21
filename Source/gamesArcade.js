/* The games. Each registers itself with games.js, which owns profiles,
 * persistence, leaderboards and the parked-only safety gate.
 *
 * Constraint shaping every two-player entry: the panel reports as a single
 * pointer, so nothing can require two simultaneous touches. All duo games are
 * turn-based.
 */

/* ========================== START LIGHTS ==========================
   F1 gantry rather than a drag tree: five columns of two lamps illuminate
   left to right, hold for a random interval, then ALL extinguish - and lights
   out is the signal. Reacting to an absence is the real procedure, and it
   cannot be anticipated by watching for a colour change.

   Anything under ~100ms is anticipation rather than reaction, so those are
   called as jump starts. */
(function () {
  let timer = null, state = 'idle', outAt = 0, duo = null;

  function gantry(lit, out) {
    return `<div class="f1-gantry">${[0, 1, 2, 3, 4].map((i) =>
      `<div class="f1-col">
         <i class="f1-lamp ${!out && lit > i ? 'on' : ''}"></i>
         <i class="f1-lamp ${!out && lit > i ? 'on' : ''}"></i>
       </div>`).join('')}</div>`;
  }

  function paint(lit, msg, sub, out) {
    document.getElementById('game-stage').innerHTML = `
      <div class="tree-wrap" onclick="dragTreeTap()">
        ${gantry(lit, out)}
        <div class="tree-msg">${msg}</div>
        <div class="tree-sub">${sub || ''}</div>
      </div>`;
  }

  function sequence() {
    state = 'staging';
    let lit = 0;
    paint(0, 'Stand by', 'wait for lights out');
    const step = () => {
      lit++;
      if (lit <= 5) {
        paint(lit, 'Stand by', 'wait for lights out');
        timer = setTimeout(step, 620);
      } else {
        timer = setTimeout(() => {
          state = 'go';
          outAt = performance.now();
          paint(5, 'GO', '', true);
        }, 700 + Math.floor(Math.random() * 2600));
      }
    };
    timer = setTimeout(step, 700);
  }

  window.dragTreeTap = function () {
    if (state === 'staging') {
      clearTimeout(timer);
      state = 'idle';
      paint(0, 'Jump start', 'tap to try again');
      if (duo) { duo.times[duo.turn] = null; advance(); }
      return;
    }
    if (state === 'go') {
      const ms = Math.round(performance.now() - outAt);
      state = 'idle';
      if (duo) {
        duo.times[duo.turn] = ms;
        /* each seat's reaction is a real measurement, so it counts toward that
           player's record even in a duel */
        const seat = duoName(duo.turn);
        const rr = recordScore('dragtree', (st) => ({
          plays: st.plays + 1,
          best: Math.min(st.best === undefined ? 99999 : st.best, ms),
          total: (st.total || 0) + ms
        }), { name: seat, metric: (st) => st.best, lowerIsBetter: true });
        if (rr.improved) {
          return showRecord(seat, `${ms} ms`,
            rr.prev ? `previous best ${rr.prev} ms` : 'first run on record',
            () => { paint(0, `${ms} ms`, 'tap for next player', true); advance(); }, rr.global);
        }
        paint(0, `${ms} ms`, 'tap for next player', true);
        advance();
        return;
      }
      const r = recordScore('dragtree', (st) => ({
        plays: st.plays + 1,
        best: Math.min(st.best === undefined ? 99999 : st.best, ms),
        total: (st.total || 0) + ms
      }), { metric: (st) => st.best, lowerIsBetter: true });
      const s = scoreFor('dragtree');
      if (r.improved) {
        return showRecord(profile(), `${ms} ms`,
          r.prev ? `previous best ${r.prev} ms` : 'first run on record',
          () => paint(0, 'Start Lights', 'tap to stage', true), r.global);
      }
      paint(0, `${ms} ms`, `best ${s.best} ms &middot; ${s.plays} runs &middot; tap to go again`, true);
      return;
    }
    sequence();
  };

  function advance() {
    if (duo.turn === 0) {
      duo.turn = 1;
      setStatus(duoName(1));
      setTimeout(() => paint(0, duoName(1), 'tap to stage', true), 900);
    } else {
      const [a, b] = duo.times;
      const label = (v) => (v === null ? 'jump start' : `${v} ms`);
      let verdict = 'Tie';
      if (a === null && b !== null) verdict = `${duoName(1)} wins`;
      else if (b === null && a !== null) verdict = `${duoName(0)} wins`;
      else if (a !== null && b !== null) verdict = a < b ? `${duoName(0)} wins` : (b < a ? `${duoName(1)} wins` : 'Tie');
      setTimeout(() => {
        document.getElementById('game-stage').innerHTML = `
          <div class="tree-wrap" onclick="dragTreeRestart()">
            <div class="duel-result">${verdict}</div>
            <div class="duel-times"><span style="color:${duoColor(0)}">${duoName(0)} ${label(a)}</span>
              <span style="color:${duoColor(1)}">${duoName(1)} ${label(b)}</span></div>
            <div class="tree-sub">tap to run again</div>
          </div>`;
      }, 900);
    }
  }

  window.dragTreeRestart = function () {
    duo = { turn: 0, times: [null, null] };
    setStatus(duoName(0));
    paint(0, duoName(0), 'tap to stage', true);
  };

  registerGame('dragtree', {
    name: 'Start Lights',
    blurb: 'Reaction time',
    modes: ['solo', 'duo'],
    art: '<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="2"/><circle cx="6.5" cy="12" r="1.5" fill="currentColor"/><circle cx="10.8" cy="12" r="1.5" fill="currentColor"/><circle cx="15.1" cy="12" r="1.5"/><circle cx="19.4" cy="12" r="1.5"/></svg>',
    summary: (s) => `best ${s.best} ms · ${s.plays} runs`,
    leaderboard: {
      label: 'best reaction',
      lowerIsBetter: true,
      sort: (s) => (s.best === undefined ? Infinity : s.best),
      format: (s) => `${s.best} ms`
    },
    start(stage, mode) {
      duo = mode === 'duo' ? { turn: 0, times: [null, null] } : null;
      if (duo) setStatus(duoName(0));
      paint(0, duo ? duoName(0) : 'Start Lights', 'tap to stage', true);
    },
    pause() { clearTimeout(timer); state = 'idle'; }
  });
})();

/* ============================== 2048 ============================== */
(function () {
  let grid = [], score = 0, best = 0;

  const empty = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);

  function spawn() {
    const free = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!grid[y][x]) free.push([x, y]);
    if (!free.length) return;
    const [x, y] = free[Math.floor(Math.random() * free.length)];
    grid[y][x] = Math.random() < 0.9 ? 2 : 4;
  }

  function paint() {
    const cells = grid.flatMap((row, y) => row.map((v, x) =>
      `<div class="t2048 v${v}" style="grid-area:${y + 1}/${x + 1}">${v || ''}</div>`)).join('');
    document.getElementById('game-stage').innerHTML = `
      <div class="g2048-wrap">
        <div class="g2048-scores"><span>Score <b>${score}</b></span><span>Best <b>${best}</b></span>
          <button class="ghost-btn small" onclick="g2048New()">New game</button></div>
        <div class="g2048" id="g2048">${cells}</div>
        <div class="tree-sub">swipe to move</div>
      </div>`;
    bindSwipe(document.getElementById('g2048'), move);
  }

  function slide(row) {
    const vals = row.filter(Boolean);
    let gained = 0;
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i] === vals[i + 1]) {
        vals[i] *= 2; gained += vals[i]; vals.splice(i + 1, 1);
      }
    }
    while (vals.length < 4) vals.push(0);
    return { row: vals, gained };
  }

  /* Explicit per-direction movement. The previous version rotated the grid,
     slid left, then rotated back - but rotating clockwise and sliding left
     moves cells DOWN, not up, so up/down were swapped and everything landed
     transposed. Direct indexing is longer but impossible to get subtly wrong. */
  function move(dir) {
    const before = JSON.stringify(grid);
    let gained = 0;

    const line = (vals) => { const r = slide(vals); gained += r.gained; return r.row; };

    if (dir === 'left') {
      for (let y = 0; y < 4; y++) grid[y] = line(grid[y]);
    } else if (dir === 'right') {
      for (let y = 0; y < 4; y++) grid[y] = line(grid[y].slice().reverse()).reverse();
    } else if (dir === 'up') {
      for (let x = 0; x < 4; x++) {
        const col = line([grid[0][x], grid[1][x], grid[2][x], grid[3][x]]);
        for (let y = 0; y < 4; y++) grid[y][x] = col[y];
      }
    } else if (dir === 'down') {
      for (let x = 0; x < 4; x++) {
        const col = line([grid[3][x], grid[2][x], grid[1][x], grid[0][x]]);
        for (let y = 0; y < 4; y++) grid[3 - y][x] = col[y];
      }
    }

    score += gained;
    if (JSON.stringify(grid) !== before) {
      spawn();
      if (score > best) best = score;
      saveGameState('2048', { grid, score, best });
      paint();
      if (dead()) finish();
    }
  }

  function dead() {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (!grid[y][x]) return false;
      if (x < 3 && grid[y][x] === grid[y][x + 1]) return false;
      if (y < 3 && grid[y][x] === grid[y + 1][x]) return false;
    }
    return true;
  }

  function finish() {
    const r = recordScore('2048', (s) => ({
      plays: s.plays + 1,
      best: Math.max(s.best || 0, score)
    }), { metric: (s) => s.best || 0, lowerIsBetter: false });
    clearGameState('2048');
    setStatus('Game over');
    if (r.improved) {
      showRecord(profile(), String(score),
        r.prev ? `previous best ${r.prev}` : 'first game on record',
        () => window.g2048New(), r.global);
    }
  }

  window.g2048New = function () {
    grid = empty(); score = 0; spawn(); spawn();
    saveGameState('2048', { grid, score, best });
    paint();
  };

  registerGame('2048', {
    name: '2048',
    blurb: 'Slide and merge',
    modes: ['solo'],
    resumable: true,
    art: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    summary: (s) => `best ${s.best} · ${s.plays} games`,
    leaderboard: {
      label: 'high score', lowerIsBetter: false,
      sort: (s) => s.best || 0, format: (s) => String(s.best || 0)
    },
    start() {
      const saved = loadGameState('2048');
      if (saved && saved.grid) { grid = saved.grid; score = saved.score; best = saved.best || 0; paint(); }
      else window.g2048New();
    }
  });
})();

/* ============================= WORDLE ============================= */
(function () {
  let answers = [], valid = new Set(), word = '', rows = [], cur = '', done = false;

  socket.on('games:words', (p) => {
    if (!p) return;
    answers = p.answers || [];
    valid = new Set([...(p.valid || []), ...answers]);
  });

  function paint(msg) {
    const board = Array.from({ length: 6 }, (_, r) => {
      const guess = rows[r] !== undefined ? rows[r] : (r === rows.length ? cur : '');
      const marks = rows[r] !== undefined ? score(rows[r]) : [];
      return `<div class="w-row">${Array.from({ length: 5 }, (_, i) =>
        `<div class="w-cell ${marks[i] || ''} ${guess[i] ? 'filled' : ''}">${(guess[i] || '').toUpperCase()}</div>`
      ).join('')}</div>`;
    }).join('');

    const used = {};
    rows.forEach((g) => score(g).forEach((m, i) => {
      const c = g[i];
      if (m === 'hit' || used[c] !== 'hit') used[c] = m;
    }));
    const keys = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((r, i) =>
      `<div class="w-keys">${i === 2 ? '<button class="w-key wide" onclick="wordleKey(\'ENTER\')">Enter</button>' : ''}` +
      r.split('').map((c) => `<button class="w-key ${used[c] || ''}" onclick="wordleKey('${c}')">${c.toUpperCase()}</button>`).join('') +
      `${i === 2 ? '<button class="w-key wide" onclick="wordleKey(\'DEL\')">&#9003;</button>' : ''}</div>`).join('');

    document.getElementById('game-stage').innerHTML =
      `<div class="w-wrap"><div class="w-board">${board}</div>
       <div class="w-msg">${msg || ''}</div>${keys}</div>`;
  }

  /* Two passes: exact matches are claimed first, otherwise a repeated letter in
     the guess can steal credit from a position that actually matches. */
  function score(guess) {
    const marks = Array(5).fill('miss');
    const pool = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === word[i]) marks[i] = 'hit';
      else pool[word[i]] = (pool[word[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (marks[i] === 'hit') continue;
      if (pool[guess[i]]) { marks[i] = 'near'; pool[guess[i]]--; }
    }
    return marks;
  }

  window.wordleKey = function (k) {
    if (done) return;
    if (k === 'DEL') { cur = cur.slice(0, -1); return paint(); }
    if (k === 'ENTER') {
      if (cur.length < 5) return paint('Not enough letters');
      if (!valid.has(cur)) return paint('Not in word list');
      rows.push(cur);
      const won = cur === word;
      cur = '';
      if (won || rows.length === 6) return finish(won);
      return paint();
    }
    if (cur.length < 5) { cur += k; paint(); }
  };

  function finish(won) {
    done = true;
    recordScore('wordle', (s) => {
      const dist = s.dist || [0, 0, 0, 0, 0, 0];
      if (won) dist[rows.length - 1]++;
      const streak = won ? (s.streak || 0) + 1 : 0;
      return {
        plays: s.plays + 1,
        wins: (s.wins || 0) + (won ? 1 : 0),
        guessSum: (s.guessSum || 0) + (won ? rows.length : 0),
        streak,
        bestStreak: Math.max(s.bestStreak || 0, streak),
        dist
      };
    });
    const s = scoreFor('wordle');
    const avg = s.wins ? (s.guessSum / s.wins).toFixed(2) : '—';
    if (won && s.streak > 1 && s.streak === s.bestStreak) {
      return showRecord(profile(), `${s.streak} in a row`,
        `solved in ${rows.length} &middot; average ${avg}`, () => window.wordleNew());
    }
    paint(`${won ? `Got it in ${rows.length}` : `It was ${word.toUpperCase()}`} &middot; avg ${avg} &middot; streak ${s.streak}
           <button class="ghost-btn small" onclick="wordleNew()">New word</button>`);
  }

  window.wordleNew = function () {
    if (!answers.length) { paint('Loading words&hellip;'); return socket.emit('games:words'); }
    word = answers[Math.floor(Math.random() * answers.length)];
    rows = []; cur = ''; done = false;
    paint();
  };

  registerGame('wordle', {
    name: 'Wordle',
    blurb: 'Five letters, six tries',
    modes: ['solo'],
    art: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="6" height="6" rx="1"/><rect x="9.5" y="5" width="6" height="6" rx="1" fill="currentColor"/><rect x="16.5" y="5" width="5" height="6" rx="1"/><rect x="2.5" y="13" width="6" height="6" rx="1" fill="currentColor"/><rect x="9.5" y="13" width="6" height="6" rx="1"/><rect x="16.5" y="13" width="5" height="6" rx="1"/></svg>',
    summary: (s) => `${s.wins || 0}/${s.plays} · avg ${s.wins ? (s.guessSum / s.wins).toFixed(2) : '—'}`,
    leaderboard: {
      label: 'avg guesses',
      lowerIsBetter: true,
      sort: (s) => (s.wins ? s.guessSum / s.wins : Infinity),
      format: (s) => `${(s.guessSum / s.wins).toFixed(2)} · ${s.wins}W · streak ${s.bestStreak || 0}`
    },
    start() {
      if (!answers.length) socket.emit('games:words');
      setTimeout(() => window.wordleNew(), answers.length ? 0 : 350);
    }
  });
})();

/* ============================= MEMORY ============================= */
(function () {
  let cards = [], flipped = [], matched = [], turn = 0, scores = [0, 0], duo = false, lock = false, moves = 0;

  const FACES = ['dragtree', 'wheel', 'cone', 'flag', 'gauge', 'road', 'moon', 'spark'];
  const ART = {
    dragtree: '<circle cx="12" cy="7" r="2.4"/><circle cx="12" cy="14" r="2.4"/><circle cx="12" cy="21" r="2"/>',
    wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    cone: '<path d="M12 4 19 20H5Z"/><path d="M8.6 14h6.8"/>',
    flag: '<path d="M6 21V4"/><path d="M6 5h12v9H6z"/>',
    gauge: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17l5-5"/>',
    road: '<path d="M8 21 11 4h2l3 17"/><path d="M12 7v3M12 13v3"/>',
    moon: '<path d="M15 4a8 8 0 1 0 6 11A9 9 0 0 1 15 4z"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>'
  };

  function paint() {
    const grid = cards.map((f, i) => {
      const open = flipped.includes(i) || matched.includes(i);
      return `<button class="mem-card ${open ? 'open' : ''} ${matched.includes(i) ? 'done' : ''}"
        onclick="memFlip(${i})">${open ? `<svg viewBox="0 0 24 24">${ART[f]}</svg>` : ''}</button>`;
    }).join('');
    const head = duo
      ? `<div class="mem-score">
          <span class="${turn === 0 ? 'on' : ''}" style="color:${turn === 0 ? duoColor(0) : ''}">${duoName(0)} ${scores[0]}</span>
          <span class="${turn === 1 ? 'on' : ''}" style="color:${turn === 1 ? duoColor(1) : ''}">${duoName(1)} ${scores[1]}</span></div>`
      : `<div class="mem-score"><span>Moves ${moves}</span></div>`;
    document.getElementById('game-stage').innerHTML = `<div class="mem-wrap">${head}<div class="mem-grid">${grid}</div></div>`;
  }

  window.memFlip = function (i) {
    if (lock || flipped.includes(i) || matched.includes(i)) return;
    flipped.push(i);
    paint();
    if (flipped.length < 2) return;
    moves++;
    const [a, b] = flipped;
    if (cards[a] === cards[b]) {
      matched.push(a, b);
      if (duo) scores[turn]++;
      flipped = [];
      paint();
      if (matched.length === cards.length) finish();
    } else {
      lock = true;
      setTimeout(() => {
        flipped = []; lock = false;
        if (duo) turn = 1 - turn;
        paint();
      }, 750);
    }
  };

  function finish() {
    if (duo) {
      const tie = scores[0] === scores[1];
      const wi = scores[0] > scores[1] ? 0 : 1;
      /* both seats get a play; the winner gets the win and a streak */
      [0, 1].forEach((i) => {
        const won = !tie && i === wi;
        recordScore('memory', (s) => {
          const streak = won ? (s.streak || 0) + 1 : 0;
          return { plays: s.plays + 1, wins: (s.wins || 0) + (won ? 1 : 0),
                   streak, bestStreak: Math.max(s.bestStreak || 0, streak),
                   best: s.best };
        }, { name: duoName(i) });
      });
      const w = tie ? null : scoreFor('memory', duoName(wi));
      if (w && w.streak > 1 && w.streak === w.bestStreak) {
        return showRecord(duoName(wi), `${w.streak} wins in a row`, '', () => exitGame());
      }
      setStatus(tie ? 'Tie' : `${duoName(wi)} wins`);
    } else {
      const r = recordScore('memory', (s) => ({
        plays: s.plays + 1,
        best: Math.min(s.best === undefined ? 9999 : s.best, moves)
      }), { metric: (s) => s.best, lowerIsBetter: true });
      setStatus(`Done in ${moves} moves`);
      if (r.improved) {
        showRecord(profile(), `${moves} moves`,
          r.prev ? `previous best ${r.prev}` : 'first game on record', () => exitGame(), r.global);
      }
    }
  }

  registerGame('memory', {
    name: 'Memory',
    blurb: 'Match the pairs',
    modes: ['solo', 'duo'],
    art: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.4"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" fill="currentColor"/></svg>',
    summary: (s) => `best ${s.best} moves`,
    leaderboard: {
      label: 'fewest moves', lowerIsBetter: true,
      sort: (s) => (s.best === undefined ? Infinity : s.best), format: (s) => `${s.best} moves`
    },
    start(stage, mode) {
      duo = mode === 'duo';
      cards = [...FACES, ...FACES].sort(() => Math.random() - 0.5);
      flipped = []; matched = []; turn = 0; scores = [0, 0]; lock = false; moves = 0;
      paint();
    }
  });
})();

/* =========================== CONNECT FOUR =========================== */
(function () {
  const W = 7, H = 6;
  let board = [], turn = 0, over = false;

  function paint(msg) {
    const col = duoColorsDistinct();
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = board[y][x];
      cells.push(`<div class="c4-cell"${p ? ` style="background:${col[p - 1]}"` : ''}></div>`);
    }
    /* Solid, tinted and arrowed. A dashed outline on a transparent background
       was effectively invisible against the dark surface. */
    const cols = Array.from({ length: W }, (_, x) =>
      `<button class="c4-drop" style="border-color:${col[turn]};color:${col[turn]}"
        onclick="c4Drop(${x})">&#9660;</button>`).join('');
    document.getElementById('game-stage').innerHTML = `
      <div class="c4-wrap">
        <div class="c4-turn">${msg || `${duoName(turn)}'s turn`}
          <i class="c4-chip" style="background:${col[turn]}"></i></div>
        <div class="c4-cols">${cols}</div>
        <div class="c4-board">${cells.join('')}</div>
        <button class="ghost-btn small" onclick="c4New()">New game</button>
      </div>`;
  }

  window.c4Drop = function (x) {
    if (over) return;
    for (let y = H - 1; y >= 0; y--) {
      if (!board[y][x]) {
        board[y][x] = turn + 1;
        if (wins(x, y)) {
        over = true;
        return settle(turn);
      }
        if (board.every((r) => r.every(Boolean))) { over = true; return paint('Draw'); }
        turn = 1 - turn;
        return paint();
      }
    }
  };

  function settle(winner) {
    [0, 1].forEach((i) => {
      const won = i === winner;
      recordScore('connect4', (s) => {
        const streak = won ? (s.streak || 0) + 1 : 0;
        return { plays: s.plays + 1, wins: (s.wins || 0) + (won ? 1 : 0),
                 streak, bestStreak: Math.max(s.bestStreak || 0, streak) };
      }, { name: duoName(i) });
    });
    const w = scoreFor('connect4', duoName(winner));
    if (w && w.streak > 1 && w.streak === w.bestStreak) {
      return showRecord(duoName(winner), `${w.streak} wins in a row`, '', () => window.c4New());
    }
    paint(`${duoName(winner)} wins`);
  }

  function wins(x, y) {
    const me = board[y][x];
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    return dirs.some(([dx, dy]) => {
      let n = 1;
      for (const sign of [1, -1]) {
        let cx = x + dx * sign, cy = y + dy * sign;
        while (cx >= 0 && cx < W && cy >= 0 && cy < H && board[cy][cx] === me) {
          n++; cx += dx * sign; cy += dy * sign;
        }
      }
      return n >= 4;
    });
  }

  window.c4New = function () {
    board = Array.from({ length: H }, () => Array(W).fill(0));
    turn = 0; over = false; paint();
  };

  registerGame('connect4', {
    name: 'Connect Four',
    blurb: 'Four in a row',
    modes: ['duo'],
    art: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.8" fill="currentColor"/><circle cx="12" cy="13" r="1.8" fill="currentColor"/><circle cx="16" cy="9" r="1.8"/><circle cx="8" cy="16" r="1.8"/></svg>',
    leaderboard: { label: 'wins', lowerIsBetter: false,
      sort: (s) => s.wins || 0,
      format: (s) => `${s.wins || 0}W of ${s.plays} · streak ${s.bestStreak || 0}` },
    start() { window.c4New(); }
  });
})();

/* =========================== DOTS AND BOXES =========================== */
(function () {
  const N = 5;                       // dots per side -> 4x4 boxes
  let h = [], v = [], owner = [], turn = 0, scores = [0, 0], over = false;

  function paint(msg) {
    const col = duoColorsDistinct();
    const tint = (hex, a) => {
      const v = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
      return `rgba(${r},${g},${b},${a})`;
    };
    let html = '';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        html += `<div class="db-dot" style="grid-area:${y * 2 + 1}/${x * 2 + 1}"></div>`;
        if (x < N - 1) html += `<button class="db-h" style="grid-area:${y * 2 + 1}/${x * 2 + 2}${
          h[y][x] ? `;background:${col[h[y][x] - 1]}` : ''}" onclick="dbLine('h',${x},${y})"></button>`;
      }
      if (y < N - 1) for (let x = 0; x < N; x++) {
        html += `<button class="db-v" style="grid-area:${y * 2 + 2}/${x * 2 + 1}${
          v[y][x] ? `;background:${col[v[y][x] - 1]}` : ''}" onclick="dbLine('v',${x},${y})"></button>`;
        if (x < N - 1) html += `<div class="db-box" style="grid-area:${y * 2 + 2}/${x * 2 + 2}${
          owner[y][x] ? `;background:${tint(col[owner[y][x] - 1], 0.28)}` : ''}"></div>`;
      }
    }
    document.getElementById('game-stage').innerHTML = `
      <div class="db-wrap">
        <div class="mem-score">
          <span class="${turn === 0 ? 'on' : ''}" style="color:${turn === 0 ? col[0] : ''}">${duoName(0)} ${scores[0]}</span>
          <span class="${turn === 1 ? 'on' : ''}" style="color:${turn === 1 ? col[1] : ''}">${duoName(1)} ${scores[1]}</span></div>
        <div class="db-grid">${html}</div>
        <div class="tree-sub">${msg || 'tap a line'}</div>
      </div>`;
  }

  window.dbLine = function (kind, x, y) {
    if (over) return;
    const arr = kind === 'h' ? h : v;
    if (arr[y][x]) return;
    arr[y][x] = turn + 1;
    /* closing a box grants another turn - that rule is what makes the endgame
       interesting rather than a coin flip */
    let claimed = 0;
    for (let by = 0; by < N - 1; by++) for (let bx = 0; bx < N - 1; bx++) {
      if (!owner[by][bx] && h[by][bx] && h[by + 1][bx] && v[by][bx] && v[by][bx + 1]) {
        owner[by][bx] = turn + 1; scores[turn]++; claimed++;
      }
    }
    if (!claimed) turn = 1 - turn;
    const total = (N - 1) * (N - 1);
    if (scores[0] + scores[1] === total) {
      over = true;
      if (scores[0] === scores[1]) return paint('Draw');
      const wi = scores[0] > scores[1] ? 0 : 1;
      [0, 1].forEach((i) => {
        const won = i === wi;
        recordScore('dots', (st) => {
          const streak = won ? (st.streak || 0) + 1 : 0;
          return { plays: st.plays + 1, wins: (st.wins || 0) + (won ? 1 : 0),
                   streak, bestStreak: Math.max(st.bestStreak || 0, streak) };
        }, { name: duoName(i) });
      });
      const w = scoreFor('dots', duoName(wi));
      if (w && w.streak > 1 && w.streak === w.bestStreak) {
        return showRecord(duoName(wi), `${w.streak} wins in a row`, '', () => exitGame());
      }
      return paint(`${duoName(wi)} wins`);
    }
    paint();
  };

  registerGame('dots', {
    name: 'Dots & Boxes',
    blurb: 'Close a box, go again',
    modes: ['duo'],
    art: '<svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/><path d="M5 5h7M5 12h7M5 5v7"/></svg>',
    leaderboard: { label: 'wins', lowerIsBetter: false,
      sort: (s) => s.wins || 0,
      format: (s) => `${s.wins || 0}W of ${s.plays} · streak ${s.bestStreak || 0}` },
    start() {
      h = Array.from({ length: N }, () => Array(N - 1).fill(0));
      v = Array.from({ length: N - 1 }, () => Array(N).fill(0));
      owner = Array.from({ length: N - 1 }, () => Array(N - 1).fill(0));
      turn = 0; scores = [0, 0]; over = false;
      paint();
    }
  });
})();

/* ============================== SNAKE ============================== */
(function () {
  let snake = [], dir = [1, 0], food = [0, 0], loop = null, score = 0, dead = false;
  const CELL = 24, COLS = 24, ROWS = 16;

  function place() {
    do { food = [Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS)]; }
    while (snake.some(([x, y]) => x === food[0] && y === food[1]));
  }

  let snakePal = null;
  function readSnakePalette() {
    const css = getComputedStyle(document.documentElement);
    snakePal = {
      bg: css.getPropertyValue('--surface').trim() || '#14181a',
      food: css.getPropertyValue('--orange').trim(),
      body: css.getPropertyValue('--teal').trim()
    };
  }

  function paint() {
    const c = document.getElementById('snake-canvas');
    if (!c) return;
    if (!snakePal) readSnakePalette();
    const ctx = c.getContext('2d');
    ctx.fillStyle = snakePal.bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = snakePal.food;
    ctx.fillRect(food[0] * CELL + 4, food[1] * CELL + 4, CELL - 8, CELL - 8);
    ctx.fillStyle = snakePal.body;
    snake.forEach(([x, y], i) => {
      ctx.globalAlpha = i === 0 ? 1 : 0.85 - Math.min(0.5, i / snake.length * 0.5);
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
    });
    ctx.globalAlpha = 1;
  }

  function tick() {
    const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
    if (head[0] < 0 || head[1] < 0 || head[0] >= COLS || head[1] >= ROWS ||
        snake.some(([x, y]) => x === head[0] && y === head[1])) return finish();
    snake.unshift(head);
    if (head[0] === food[0] && head[1] === food[1]) { score++; place(); setStatus(`Score ${score}`); }
    else snake.pop();
    paint();
  }

  function finish() {
    clearInterval(loop); loop = null; dead = true;
    const r = recordScore('snake', (s) => ({ plays: s.plays + 1, best: Math.max(s.best || 0, score) }),
      { metric: (s) => s.best || 0, lowerIsBetter: false });
    setStatus(`Game over &middot; ${score}`);
    if (r.improved) showRecord(profile(), String(score),
      r.prev ? `previous best ${r.prev}` : 'first game on record', () => window.snakeNew(), r.global);
  }

  window.snakeNew = function () {
    clearInterval(loop);
    readSnakePalette();
    snake = [[6, 8], [5, 8], [4, 8]]; dir = [1, 0]; score = 0; dead = false;
    place(); paint(); setStatus('Score 0');
    loop = setInterval(tick, 130);
  };

  window.snakeTurn = function (d) {
    const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const nd = map[d];
    if (!nd || dead) return;
    if (nd[0] === -dir[0] && nd[1] === -dir[1]) return;   // no instant reverse
    dir = nd;
  };

  registerGame('snake', {
    name: 'Snake',
    blurb: 'Do not bite yourself',
    modes: ['solo'],
    art: '<svg viewBox="0 0 24 24"><path d="M4 6h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/><circle cx="19" cy="18" r="1.6" fill="currentColor"/></svg>',
    summary: (s) => `best ${s.best}`,
    leaderboard: { label: 'high score', lowerIsBetter: false, sort: (s) => s.best || 0, format: (s) => String(s.best || 0) },
    start(stage) {
      stage.innerHTML = `<div class="snake-wrap">
        <canvas id="snake-canvas" width="${COLS * CELL}" height="${ROWS * CELL}"></canvas>
        <div class="dpad">
          <button onclick="snakeTurn('up')">&#9650;</button>
          <div><button onclick="snakeTurn('left')">&#9664;</button>
               <button onclick="snakeTurn('right')">&#9654;</button></div>
          <button onclick="snakeTurn('down')">&#9660;</button>
        </div>
        <button class="ghost-btn small" onclick="snakeNew()">Restart</button>
      </div>`;
      bindSwipe(document.getElementById('snake-canvas'), window.snakeTurn);
      window.snakeNew();
    },
    pause() { clearInterval(loop); loop = null; }
  });
})();

/* ============================= BREAKOUT ============================= */
(function () {
  let raf = null, paddle = 0, ball = null, bricks = [], score = 0, lives = 3, last = 0, speed = 0;
  const W = 1280, H = 720, PADDLE_W = 180, BASE_SPEED = 420;

  function reset() {
    bricks = [];
    const cols = 12, bw = (W - 40) / cols;
    for (let r = 0; r < 6; r++) for (let c = 0; c < cols; c++) {
      bricks.push({ x: 20 + c * bw + 3, y: 60 + r * 40, w: bw - 6, h: 30, alive: true, row: r });
    }
    paddle = W / 2 - PADDLE_W / 2;
    speed = BASE_SPEED;
    launch();
  }

  function launch() {
    const angle = (-60 + Math.random() * 40) * Math.PI / 180;
    ball = { x: W / 2, y: H - 90, vx: Math.sin(angle) * speed, vy: -Math.abs(Math.cos(angle)) * speed };
  }

  function setSpeed(v) {
    const cur = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = ball.vx / cur * v;
    ball.vy = ball.vy / cur * v;
  }

  function frame(now) {
    const c = document.getElementById('bo-canvas');
    if (!c) return;
    /* Movement is per SECOND, not per frame. This Pi throttles to 600MHz and
       drops well under 60fps, which made a per-frame ball crawl. */
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;

    const ctx = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--surface').trim() || '#14181a';
    ctx.fillRect(0, 0, W, H);

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < 9) { ball.x = 9; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - 9) { ball.x = W - 9; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < 9) { ball.y = 9; ball.vy = Math.abs(ball.vy); }

    if (ball.vy > 0 && ball.y > H - 40 && ball.y < H - 18 &&
        ball.x > paddle && ball.x < paddle + PADDLE_W) {
      /* where it lands on the paddle sets the angle, so the paddle steers */
      const off = (ball.x - (paddle + PADDLE_W / 2)) / (PADDLE_W / 2);
      const ang = off * 1.05;
      const v = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(ang) * v;
      ball.vy = -Math.abs(Math.cos(ang) * v);
    }

    if (ball.y > H) {
      lives--;
      if (lives <= 0) return finish(false);
      setStatus(`Score ${score} &middot; ${lives} lives`);
      launch();
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x > b.x - 6 && ball.x < b.x + b.w + 6 && ball.y > b.y - 6 && ball.y < b.y + b.h + 6) {
        b.alive = false;
        ball.vy *= -1;
        score += (6 - b.row) * 10;
        /* Classic behaviour: it gets faster as the wall thins out, so the last
           few bricks are the hard part. */
        const cleared = bricks.filter((x) => !x.alive).length / bricks.length;
        setSpeed(BASE_SPEED * (1 + cleared * 0.85));
        setStatus(`Score ${score} &middot; ${lives} lives`);
        break;
      }
    }
    if (!bricks.some((b) => b.alive)) return finish(true);

    const teal = css.getPropertyValue('--teal').trim();
    const orange = css.getPropertyValue('--orange').trim();
    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.globalAlpha = 1 - b.row * 0.1;
      ctx.fillStyle = b.row < 2 ? orange : teal;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = css.getPropertyValue('--numeral').trim();
    ctx.fillRect(paddle, H - 30, PADDLE_W, 14);
    ctx.fillStyle = orange;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, 9, 0, Math.PI * 2); ctx.fill();

    raf = requestAnimationFrame(frame);
  }

  function finish(won) {
    cancelAnimationFrame(raf); raf = null;
    const r = recordScore('breakout', (s) => ({ plays: s.plays + 1, best: Math.max(s.best || 0, score) }),
      { metric: (s) => s.best || 0, lowerIsBetter: false });
    setStatus(won ? `Cleared &middot; ${score}` : `Game over &middot; ${score}`);
    if (r.improved) showRecord(profile(), String(score),
      r.prev ? `previous best ${r.prev}` : 'first game on record', () => window.boNew(), r.global);
  }

  window.boNew = function () {
    cancelAnimationFrame(raf);
    score = 0; lives = 3; last = 0; reset();
    setStatus('Score 0 &middot; 3 lives');
    raf = requestAnimationFrame(frame);
  };

  registerGame('breakout', {
    name: 'Breakout',
    blurb: 'Drag to aim',
    modes: ['solo'],
    art: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="3" rx="1" fill="currentColor"/><rect x="9.5" y="4" width="5" height="3" rx="1"/><rect x="16" y="4" width="5" height="3" rx="1" fill="currentColor"/><circle cx="12" cy="14" r="1.8" fill="currentColor"/><rect x="7" y="19" width="10" height="2.4" rx="1.2"/></svg>',
    summary: (s) => `best ${s.best}`,
    leaderboard: { label: 'high score', lowerIsBetter: false, sort: (s) => s.best || 0, format: (s) => String(s.best || 0) },
    start(stage) {
      stage.innerHTML = `<div class="bo-wrap">
        <canvas id="bo-canvas" width="${W}" height="${H}"></canvas>
        <button class="ghost-btn small" onclick="boNew()">Restart</button></div>`;
      const c = document.getElementById('bo-canvas');
      /* 1:1 with the pointer - the paddle centre sits under the finger. An
         amplified mapping was faster but broke the direct-manipulation feel,
         since the paddle no longer tracked where you were touching. */
      const track = (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) * (W / r.width);
        paddle = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
      };
      c.addEventListener('pointermove', track);
      c.addEventListener('pointerdown', track);
      window.boNew();
    },
    pause() { cancelAnimationFrame(raf); raf = null; }
  });
})();

/* ============================== FLAPPY ==============================
   Tap anywhere to flap. Delta-timed so it plays identically whether the Pi is
   at full clock or throttled.

   Two things keep it smooth on a 600MHz Pi: the canvas is 840x472 rather than
   720p (a third of the pixels to fill per frame, then scaled up by CSS), and
   theme colors are read ONCE at start rather than per frame - calling
   getComputedStyle inside the loop forces a style recalculation 60 times a
   second, which was the bulk of the cost. */
(function () {
  const W = 840, H = 472, GAP = 150, PIPE_W = 76, SPACING = 260;
  const GRAVITY = 1020, FLAP = -335, SPEED = 190, BX = 150, BR = 17;
  let raf = null, last = 0, bird = null, pipes = [], score = 0, state = 'ready';
  let pal = null, flapT = 0;

  function readPalette() {
    const css = getComputedStyle(document.documentElement);
    pal = {
      bg: css.getPropertyValue('--surface').trim() || '#14181a',
      pipe: css.getPropertyValue('--teal').trim(),
      bird: css.getPropertyValue('--orange').trim(),
      ink: css.getPropertyValue('--numeral').trim(),
      dim: css.getPropertyValue('--silver-dim').trim(),
      deep: css.getPropertyValue('--bg').trim()
    };
  }

  function reset() {
    bird = { y: H / 2, v: 0 };
    pipes = [];
    for (let i = 0; i < 4; i++) {
      pipes.push({ x: W + 120 + i * SPACING, gapY: 90 + Math.random() * (H - 200 - GAP), passed: false });
    }
    score = 0; flapT = 0; state = 'ready';
  }

  window.flappyFlap = function () {
    if (state === 'dead') return window.flappyNew();
    if (state === 'ready') { state = 'run'; last = 0; raf = requestAnimationFrame(frame); }
    bird.v = FLAP;
    flapT = 0.22;                 // wing stays raised briefly after a flap
  };

  /* A body, a wing that beats when you flap, a beak, an eye and a tail. */
  function drawBird(ctx, tilt) {
    ctx.save();
    ctx.translate(BX, bird.y);
    ctx.rotate(tilt);

    ctx.fillStyle = pal.bird;
    ctx.beginPath(); ctx.ellipse(0, 0, BR * 1.15, BR, 0, 0, Math.PI * 2); ctx.fill();

    // tail
    ctx.beginPath();
    ctx.moveTo(-BR * 1.0, -2); ctx.lineTo(-BR * 1.9, -BR * 0.6);
    ctx.lineTo(-BR * 1.75, BR * 0.45); ctx.closePath(); ctx.fill();

    // wing - angle follows the flap timer
    const wing = flapT > 0 ? -0.7 : 0.35;
    ctx.save();
    ctx.translate(-2, 1);
    ctx.rotate(wing);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 0, BR * 0.85, BR * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // beak
    ctx.fillStyle = '#f3c34a';
    ctx.beginPath();
    ctx.moveTo(BR * 1.05, -1); ctx.lineTo(BR * 1.75, 2.5);
    ctx.lineTo(BR * 1.05, 6); ctx.closePath(); ctx.fill();

    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(BR * 0.45, -BR * 0.4, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.deep;
    ctx.beginPath(); ctx.arc(BR * 0.62, -BR * 0.4, 2.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function frame(now) {
    const c = document.getElementById('fb-canvas');
    if (!c) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (flapT > 0) flapT -= dt;
    const ctx = c.getContext('2d');

    bird.v += GRAVITY * dt;
    bird.y += bird.v * dt;

    for (const p of pipes) {
      p.x -= SPEED * dt;
      if (!p.passed && p.x + PIPE_W < BX) { p.passed = true; score++; setStatus(`Score ${score}`); }
      if (p.x < -PIPE_W) {
        p.x = Math.max(...pipes.map((q) => q.x)) + SPACING;
        p.gapY = 90 + Math.random() * (H - 200 - GAP);
        p.passed = false;
      }
    }

    const hit = pipes.some((p) =>
      BX + BR > p.x && BX - BR < p.x + PIPE_W &&
      (bird.y - BR < p.gapY || bird.y + BR > p.gapY + GAP));
    if (bird.y > H - BR || bird.y < BR || hit) return die();

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = pal.pipe;
    pipes.forEach((p) => {
      ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
      ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP);
      // lip on each pipe end, so they read as pipes rather than bars
      ctx.fillRect(p.x - 5, p.gapY - 16, PIPE_W + 10, 16);
      ctx.fillRect(p.x - 5, p.gapY + GAP, PIPE_W + 10, 16);
    });

    drawBird(ctx, Math.max(-0.5, Math.min(1.1, bird.v / 620)));

    ctx.fillStyle = pal.ink;
    ctx.font = '600 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(score), W / 2, 62);

    raf = requestAnimationFrame(frame);
  }

  function die() {
    cancelAnimationFrame(raf); raf = null; state = 'dead';
    const r = recordScore('flappy', (s) => ({ plays: s.plays + 1, best: Math.max(s.best || 0, score) }),
      { metric: (s) => s.best || 0, lowerIsBetter: false });
    setStatus(`Game over &middot; ${score}`);
    if (r.improved) {
      showRecord(profile(), String(score),
        r.prev ? `previous best ${r.prev}` : 'first game on record',
        () => window.flappyNew(), r.global);
    }
  }

  window.flappyNew = function () {
    cancelAnimationFrame(raf);
    readPalette();
    reset();
    setStatus('Tap to start');
    const c = document.getElementById('fb-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    drawBird(ctx, 0);
    ctx.fillStyle = pal.dim;
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('tap to flap', W / 2, H - 60);
  };

  registerGame('flappy', {
    name: 'Flappy',
    blurb: 'Tap to flap',
    modes: ['solo'],
    art: '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="12" rx="6" ry="5"/><path d="M17 11.5l4-2v5z"/><path d="M5 10.5c2-2 4.5-2 6 0-1.5 2-4 2.5-6 0z"/><circle cx="14" cy="10.5" r="1.1" fill="currentColor"/></svg>',
    summary: (s) => `best ${s.best}`,
    leaderboard: { label: 'high score', lowerIsBetter: false, sort: (s) => s.best || 0, format: (s) => String(s.best || 0) },
    start(stage) {
      stage.innerHTML = `<div class="bo-wrap">
        <canvas id="fb-canvas" width="${W}" height="${H}" onclick="flappyFlap()"></canvas>
        <button class="ghost-btn small" onclick="flappyNew()">Restart</button></div>`;
      window.flappyNew();
    },
    pause() { cancelAnimationFrame(raf); raf = null; state = 'dead'; }
  });
})();

/* ---------- shared: swipe detection for grid games ----------
 * Fires as soon as the gesture is unambiguous rather than waiting for the
 * finger to lift. Waiting for pointerup made every move feel like it lagged,
 * and a small threshold meant jitter near the release point could resolve to
 * the wrong axis - which is what made moves look random.
 */
function bindSwipe(el, cb) {
  if (!el) return;
  let sx = 0, sy = 0, active = false, fired = false;

  const start = (e) => { sx = e.clientX; sy = e.clientY; active = true; fired = false; };
  const move = (e) => {
    if (!active || fired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 34) return;
    /* require a clearly dominant axis so a diagonal drag does not coin-flip */
    if (Math.max(ax, ay) < Math.min(ax, ay) * 1.35) return;
    fired = true;
    cb(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const end = () => { active = false; fired = false; };

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
}
