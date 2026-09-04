/* =========================================================
   NEXUS ARCADE — games.js
   Each entry in GAME_MODULES is a factory: (api) => instance
   instance = { start(), pause(), resume(), restart(), destroy() }

   api (provided by main.js GameShell) gives games everything
   they need without touching the rest of the app:
     api.stage          -> DOM element to render into
     api.setScore(n)     -> push current score to the header
     api.gameOver(score, opts) -> end the session (shows overlay)
     api.beep(freq,dur,type,vol) -> quick sound effect
     api.isMuted()       -> bool
     api.isPaused()      -> bool (kept in sync by the shell)
     api.setHelp(text)   -> footer hint text
     api.rng             -> Math.random wrapper (kept for clarity)
   ========================================================= */

const GAME_MODULES = {};

/* ---------- small shared helpers ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.width = '100%';
  c.style.maxWidth = w + 'px';
  c.style.height = 'auto';
  c.style.aspectRatio = `${w}/${h}`;
  c.style.touchAction = 'none';
  return c;
}
function clearStage(stage) { stage.querySelectorAll('.game-dynamic').forEach(n => n.remove()); }
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

/* =========================================================
   1. FLAPPY BIRD
   ========================================================= */
GAME_MODULES.flappy = function (api) {
  const W = 400, H = 560;
  let canvas, ctx, raf, running, bird, pipes, frame, score, gravity, gap, pipeSpeed, spawnEvery;

  function reset() {
    bird = { x: 90, y: H / 2, vy: 0, r: 14 };
    pipes = [];
    frame = 0;
    score = 0;
    gravity = 0.45;
    gap = 165;
    pipeSpeed = 2.6;
    spawnEvery = 95;
    api.setScore(0);
  }

  function flap() {
    if (!running || api.isPaused()) return;
    bird.vy = -7.6;
    api.beep(520, 0.08, 'square', 0.05);
  }

  function spawnPipe() {
    const margin = 60;
    const topH = margin + Math.random() * (H - gap - margin * 2);
    pipes.push({ x: W + 30, top: topH, passed: false });
  }

  function update() {
    frame++;
    bird.vy += gravity;
    bird.y += bird.vy;

    if (frame % spawnEvery === 0) spawnPipe();

    // difficulty ramps with score
    pipeSpeed = 2.6 + Math.min(score * 0.09, 3.5);
    gap = Math.max(120, 165 - Math.min(score * 1.6, 45));

    pipes.forEach(p => { p.x -= pipeSpeed; });
    pipes = pipes.filter(p => p.x > -70);

    pipes.forEach(p => {
      if (!p.passed && p.x + 30 < bird.x) {
        p.passed = true;
        score++;
        api.setScore(score);
        api.beep(760, 0.09, 'sine', 0.06);
      }
      const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + 52;
      const inGapY = bird.y - bird.r > p.top && bird.y + bird.r < p.top + gap;
      if (inX && !inGapY) die();
    });

    if (bird.y + bird.r > H || bird.y - bird.r < 0) die();
  }

  function die() {
    if (!running) return;
    running = false;
    api.beep(140, 0.35, 'sawtooth', 0.08);
    cancelAnimationFrame(raf);
    api.gameOver(score);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0b2a'); g.addColorStop(1, '#1a0b2e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 40; i++) { const sx = (i * 53) % W, sy = (i * 97 + frame * 0.3) % H; ctx.fillRect(sx, sy, 2, 2); }

    // pipes
    pipes.forEach(p => {
      ctx.fillStyle = '#00f6ff';
      ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 12;
      ctx.fillRect(p.x, 0, 52, p.top);
      ctx.fillRect(p.x, p.top + gap, 52, H - p.top - gap);
      ctx.shadowBlur = 0;
    });

    // bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(Math.max(-0.5, Math.min(1, bird.vy / 10)));
    ctx.fillStyle = '#ff2bd6'; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 0, bird.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function loop() {
    if (running && !api.isPaused()) { update(); draw(); }
    raf = requestAnimationFrame(loop);
  }

  function onKey(e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } }
  function onPointer(e) { e.preventDefault(); flap(); }

  return {
    start() {
      canvas = makeCanvas(W, H); canvas.classList.add('game-dynamic');
      ctx = canvas.getContext('2d');
      api.stage.appendChild(canvas);
      api.setHelp('SPACE / click / tap to flap. Avoid the pipes — difficulty ramps up as you score!');
      reset(); running = true;
      document.addEventListener('keydown', onKey);
      canvas.addEventListener('pointerdown', onPointer);
      draw();
      raf = requestAnimationFrame(loop);
    },
    pause() { /* loop() checks api.isPaused() */ },
    resume() { },
    restart() { reset(); running = true; },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (canvas) canvas.removeEventListener('pointerdown', onPointer);
    }
  };
};

/* =========================================================
   2. TIC-TAC-TOE (unbeatable minimax AI)
   ========================================================= */
GAME_MODULES.tictactoe = function (api) {
  let board, boardEl, statusEl, wrap, gameActive, stats;

  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function winner(b) {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    if (b.every(x => x)) return 'draw';
    return null;
  }

  function minimax(b, depth, isMax) {
    const w = winner(b);
    if (w === 'O') return 10 - depth;
    if (w === 'X') return depth - 10;
    if (w === 'draw') return 0;
    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = 'O'; best = Math.max(best, minimax(b, depth + 1, false)); b[i] = null; }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = 'X'; best = Math.min(best, minimax(b, depth + 1, true)); b[i] = null; }
      return best;
    }
  }

  function aiMove() {
    let bestScore = -Infinity, bestMove = -1;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        const s = minimax(board, 0, false);
        board[i] = null;
        if (s > bestScore) { bestScore = s; bestMove = i; }
      }
    }
    if (bestMove > -1) { board[bestMove] = 'O'; api.beep(300, 0.08, 'triangle', 0.05); render(); checkEnd(); }
  }

  function render() {
    [...boardEl.children].forEach((cell, i) => {
      cell.textContent = board[i] || '';
      cell.className = 'ttt-cell' + (board[i] === 'X' ? ' x' : board[i] === 'O' ? ' o' : '');
    });
  }

  function checkEnd() {
    const w = winner(board);
    if (!w) return false;
    gameActive = false;
    if (w === 'draw') { statusEl.textContent = "🤝 It's a draw!"; stats.draws++; }
    else if (w === 'X') { statusEl.textContent = '🎉 You win!'; stats.wins++; api.beep(880, 0.2, 'sine', 0.07); }
    else { statusEl.textContent = '💀 AI wins!'; stats.losses++; api.beep(150, 0.3, 'sawtooth', 0.07); }
    localStorage.setItem('arcade_ttt_stats', JSON.stringify(stats));
    api.setScore(stats.wins);
    setTimeout(() => { if (!gameActive) newRound(); }, 1400);
    return true;
  }

  function newRound() {
    board = Array(9).fill(null);
    gameActive = true;
    statusEl.textContent = 'Your move — you are X';
    render();
  }

  function cellClick(i) {
    if (!gameActive || api.isPaused() || board[i]) return;
    board[i] = 'X';
    api.beep(440, 0.07, 'square', 0.05);
    render();
    if (checkEnd()) return;
    statusEl.textContent = 'AI thinking…';
    setTimeout(() => { if (gameActive) { aiMove(); if (gameActive) statusEl.textContent = 'Your move — you are X'; } }, 380);
  }

  return {
    start() {
      stats = JSON.parse(localStorage.getItem('arcade_ttt_stats') || '{"wins":0,"losses":0,"draws":0}');
      wrap = el('div', 'dom-game game-dynamic');
      statusEl = el('div', 'ttt-status', 'Your move — you are X');
      boardEl = el('div', 'ttt-board');
      for (let i = 0; i < 9; i++) { const c = el('div', 'ttt-cell'); c.addEventListener('click', () => cellClick(i)); boardEl.appendChild(c); }
      const statsLine = el('div', 'memory-stats', `<span>Wins: ${stats.wins}</span><span>Losses: ${stats.losses}</span><span>Draws: ${stats.draws}</span>`);
      wrap.append(statusEl, boardEl, statsLine);
      api.stage.appendChild(wrap);
      api.setHelp('Click a square to place X. First to 3 in a row wins. The AI never loses (but you can draw!).');
      api.setScore(stats.wins);
      newRound();
    },
    pause() {}, resume() {},
    restart() { newRound(); },
    destroy() {}
  };
};

/* =========================================================
   3. MEMORY CARD GAME
   ========================================================= */
GAME_MODULES.memory = function (api) {
  const EMOJIS = ['🐱','🐶','🦊','🐼','🐸','🦁','🐵','🐷','🦄','🐙','🐝','🦋'];
  let wrap, gridEl, timerEl, movesEl, timer, seconds, moves, flipped, matched, cards, locked;

  function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  function buildDeck(pairs = 8) {
    const pick = shuffle([...EMOJIS]).slice(0, pairs);
    return shuffle([...pick, ...pick]).map((v, i) => ({ id: i, val: v }));
  }

  function tick() { seconds++; timerEl.textContent = fmt(seconds); }
  function fmt(s) { const m = String(Math.floor(s / 60)).padStart(2, '0'); const r = String(s % 60).padStart(2, '0'); return `${m}:${r}`; }

  function renderGrid() {
    gridEl.innerHTML = '';
    const cols = Math.min(5, Math.ceil(Math.sqrt(cards.length)));
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 70px)`;
    cards.forEach(card => {
      const c = el('div', 'memory-card');
      c.innerHTML = `<div class="face front">❓</div><div class="face back">${card.val}</div>`;
      c.addEventListener('click', () => flipCard(card.id, c));
      c.dataset.id = card.id;
      gridEl.appendChild(c);
    });
  }

  function flipCard(id, node) {
    if (api.isPaused() || locked || node.classList.contains('flipped') || node.classList.contains('matched')) return;
    if (!timer) timer = setInterval(tick, 1000);
    node.classList.add('flipped');
    flipped.push({ id, node });
    api.beep(500, 0.06, 'square', 0.04);
    if (flipped.length === 2) {
      moves++; movesEl.textContent = moves;
      locked = true;
      const [a, b] = flipped;
      const va = cards.find(c => c.id === a.id).val, vb = cards.find(c => c.id === b.id).val;
      if (va === vb) {
        a.node.classList.add('matched'); b.node.classList.add('matched');
        matched += 2; flipped = []; locked = false;
        api.beep(760, 0.12, 'sine', 0.06);
        if (matched === cards.length) finish();
      } else {
        setTimeout(() => { a.node.classList.remove('flipped'); b.node.classList.remove('flipped'); flipped = []; locked = false; }, 700);
      }
    }
  }

  function finish() {
    clearInterval(timer); timer = null;
    const score = Math.max(50, 1200 - moves * 12 - seconds * 4);
    api.setScore(score);
    api.beep(880, 0.25, 'sine', 0.08);
    setTimeout(() => api.gameOver(score, { title: '🎉 ALL MATCHED!', extra: `${moves} moves · ${fmt(seconds)}` }), 500);
  }

  function newGame() {
    clearInterval(timer); timer = null;
    seconds = 0; moves = 0; flipped = []; matched = 0; locked = false;
    cards = buildDeck(8);
    timerEl.textContent = '00:00'; movesEl.textContent = '0';
    api.setScore(0);
    renderGrid();
  }

  return {
    start() {
      wrap = el('div', 'dom-game game-dynamic');
      const stats = el('div', 'memory-stats', '');
      timerEl = el('span'); movesEl = el('span');
      stats.append('⏱ ', timerEl, ' · 🔁 ', movesEl, ' moves');
      gridEl = el('div', 'memory-grid');
      wrap.append(stats, gridEl);
      api.stage.appendChild(wrap);
      api.setHelp('Flip two cards to find a match. Fewer moves & less time = higher score!');
      newGame();
    },
    pause() {}, resume() {},
    restart() { newGame(); },
    destroy() { clearInterval(timer); }
  };
};

/* =========================================================
   4. SNAKE (with speed-boost power-ups)
   ========================================================= */
GAME_MODULES.snake = function (api) {
  const COLS = 20, ROWS = 20, CELL = 20;
  const W = COLS * CELL, H = ROWS * CELL;
  let canvas, ctx, snake, dir, nextDir, food, power, score, running, tickMs, boostUntil, loopId;

  function rndCell(avoid) {
    let c;
    do { c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
    while (avoid.some(s => s.x === c.x && s.y === c.y));
    return c;
  }

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 }; nextDir = dir;
    food = rndCell(snake);
    power = null;
    score = 0; tickMs = 130; boostUntil = 0;
    api.setScore(0);
    maybeSpawnPower();
  }

  function maybeSpawnPower() {
    if (Math.random() < 0.5 && !power) power = { ...rndCell([...snake, food]), ttl: 80 };
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || snake.some(s => s.x === head.x && s.y === head.y)) {
      return die();
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10; api.setScore(score);
      api.beep(600, 0.08, 'square', 0.05);
      food = rndCell(snake);
      if (score % 40 === 0) maybeSpawnPower();
    } else if (power && head.x === power.x && head.y === power.y) {
      score += 30; api.setScore(score);
      boostUntil = Date.now() + 4000;
      api.beep(900, 0.15, 'sine', 0.07);
      power = null;
    } else {
      snake.pop();
    }
    if (power) { power.ttl--; if (power.ttl <= 0) power = null; }
  }

  function die() {
    running = false;
    api.beep(140, 0.35, 'sawtooth', 0.08);
    api.gameOver(score);
  }

  function draw() {
    ctx.fillStyle = '#08081c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke(); }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(W, j * CELL); ctx.stroke(); }

    ctx.fillStyle = '#ff2bd6'; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 10;
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
    ctx.shadowBlur = 0;

    if (power) {
      ctx.fillStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(power.x * CELL + CELL / 2, power.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#00f6ff' : `rgba(0,246,255,${0.85 - i * 0.03})`;
      ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = i === 0 ? 10 : 0;
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      ctx.shadowBlur = 0;
    });

    if (Date.now() < boostUntil) {
      ctx.fillStyle = '#ffe14d'; ctx.font = '12px Rajdhani'; ctx.fillText('⚡ SPEED BOOST', 8, 16);
    }
  }

  function loop() {
    if (running && !api.isPaused()) {
      step();
      draw();
    }
    const speed = Date.now() < boostUntil ? tickMs * 0.55 : tickMs;
    loopId = setTimeout(loop, speed);
  }

  function onKey(e) {
    const map = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };
    const nd = map[e.key];
    if (!nd) return;
    e.preventDefault();
    if (nd.x === -dir.x && nd.y === -dir.y) return; // no 180 turns
    nextDir = nd;
  }

  let touchStart = null;
  function onTouchStart(e) { touchStart = e.touches[0]; }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.clientX, dy = t.clientY - touchStart.clientY;
    if (Math.abs(dx) > Math.abs(dy)) nextDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    else nextDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    touchStart = null;
  }

  return {
    start() {
      canvas = makeCanvas(W, H); canvas.classList.add('game-dynamic');
      ctx = canvas.getContext('2d');
      api.stage.appendChild(canvas);
      api.setHelp('Arrow keys / WASD to steer (swipe on mobile). Grab the gold orb for a temporary speed boost!');
      reset(); running = true;
      document.addEventListener('keydown', onKey);
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      canvas.addEventListener('touchend', onTouchEnd, { passive: true });
      draw();
      loop();
    },
    pause() {}, resume() {},
    restart() { reset(); running = true; },
    destroy() {
      clearTimeout(loopId);
      document.removeEventListener('keydown', onKey);
    }
  };
};

/* =========================================================
   5. TYPING SPEED TEST
   ========================================================= */
GAME_MODULES.typing = function (api) {
  const SENTENCES = [
    'The neon lights flicker as the arcade comes alive at midnight.',
    'Practice makes perfect when you type with speed and accuracy.',
    'A quick fox cannot help but jump over the lazy dog again.',
    'Every keystroke brings you closer to becoming a typing master.',
    'Retro games remind us that simple fun never goes out of style.',
    'Focus on accuracy first and the speed will follow naturally.',
    'Coding late at night with synthwave music playing in the background.',
    'The best way to predict the future is to build it yourself.'
  ];
  let wrap, sentenceEl, input, wpmEl, accEl, timeEl, target, startTime, timerId, finished;

  function pick() { return SENTENCES[Math.floor(Math.random() * SENTENCES.length)]; }

  function renderSentence(typed) {
    sentenceEl.innerHTML = target.split('').map((ch, i) => {
      let cls = '';
      if (i < typed.length) cls = typed[i] === ch ? 'correct' : 'incorrect';
      else if (i === typed.length) cls = 'current';
      return `<span class="${cls}">${ch === ' ' ? '&nbsp;' : ch}</span>`;
    }).join('');
  }

  function updateStats() {
    const elapsed = (Date.now() - startTime) / 1000;
    timeEl.textContent = elapsed.toFixed(1) + 's';
    const typed = input.value;
    const words = typed.trim().length / 5;
    const wpm = elapsed > 0 ? Math.round((words / elapsed) * 60) : 0;
    wpmEl.textContent = wpm;
    let correct = 0;
    for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++;
    const acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    accEl.textContent = acc + '%';
    api.setScore(wpm);
    return { wpm, acc };
  }

  function onInput() {
    if (api.isPaused() || finished) return;
    if (!startTime) { startTime = Date.now(); timerId = setInterval(updateStats, 200); api.beep(400, 0.04, 'square', 0.03); }
    const typed = input.value;
    renderSentence(typed);
    if (typed.length > 0 && typed[typed.length - 1] !== ' ') api.beep(700, 0.02, 'square', 0.015);
    if (typed === target) {
      finished = true;
      clearInterval(timerId);
      const { wpm, acc } = updateStats();
      api.beep(880, 0.2, 'sine', 0.07);
      setTimeout(() => api.gameOver(wpm, { title: '⌨️ TEST COMPLETE', extra: `${wpm} WPM · ${acc}% accuracy` }), 400);
    }
  }

  function newTest() {
    clearInterval(timerId);
    target = pick(); startTime = null; finished = false;
    input.value = ''; input.disabled = false;
    wpmEl.textContent = '0'; accEl.textContent = '100%'; timeEl.textContent = '0.0s';
    api.setScore(0);
    renderSentence('');
    setTimeout(() => input.focus(), 50);
  }

  return {
    start() {
      wrap = el('div', 'typing-box game-dynamic');
      sentenceEl = el('div', 'typing-sentence');
      input = document.createElement('input');
      input.className = 'typing-input'; input.type = 'text'; input.placeholder = 'Start typing here…'; input.autocomplete = 'off';
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', e => { if (api.isPaused()) e.preventDefault(); });
      const stats = el('div', 'typing-stats');
      wpmEl = el('b'); accEl = el('b'); timeEl = el('b');
      const s1 = el('div'); s1.innerHTML = 'WPM'; const wpmWrap = el('div'); wpmWrap.append(wpmEl, ' WPM');
      stats.innerHTML = '';
      const box1 = el('div'); box1.append(wpmEl, document.createTextNode('WPM'));
      const box2 = el('div'); box2.append(accEl, document.createTextNode('Accuracy'));
      const box3 = el('div'); box3.append(timeEl, document.createTextNode('Time'));
      stats.append(box1, box2, box3);
      wrap.append(sentenceEl, input, stats);
      api.stage.appendChild(wrap);
      api.setHelp('Type the sentence exactly as shown. Your live WPM & accuracy update as you go.');
      newTest();
    },
    pause() { input.disabled = true; },
    resume() { input.disabled = false; input.focus(); },
    restart() { newTest(); },
    destroy() { clearInterval(timerId); }
  };
};

/* =========================================================
   6. 2048 (with undo)
   ========================================================= */
GAME_MODULES.g2048 = function (api) {
  let boardEl, wrap, grid, score, history, statusShown;
  const SIZE = 4;
  const COLORS = { 2:'#0f3460',4:'#16478c',8:'#1f5fb8',16:'#00a3cc',32:'#00c2b3',64:'#00e08a',
    128:'#8bd450',256:'#ffe14d',512:'#ffb84d',1024:'#ff7a4d',2048:'#ff2bd6' };

  function emptyGrid() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(0)); }

  function addRandom() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empties.push([r, c]);
    if (!empties.length) return;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function cloneState() { return { grid: grid.map(r => [...r]), score }; }

  function slideRowLeft(row) {
    let vals = row.filter(v => v);
    let gained = 0;
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i] === vals[i + 1]) { vals[i] *= 2; gained += vals[i]; vals.splice(i + 1, 1); }
    }
    while (vals.length < SIZE) vals.push(0);
    return { row: vals, gained };
  }

  function rotateCW(g) { const n = emptyGrid(); for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) n[c][SIZE - 1 - r] = g[r][c]; return n; }

  function move(dir) {
    if (api.isPaused()) return;
    let rotations = { left: 0, up: 3, right: 2, down: 1 }[dir];
    let g = grid;
    for (let i = 0; i < rotations; i++) g = rotateCW(g);
    let moved = false, gained = 0;
    const newG = g.map(row => {
      const before = row.join(',');
      const { row: nr, gained: gn } = slideRowLeft(row);
      gained += gn;
      if (nr.join(',') !== before) moved = true;
      return nr;
    });
    let result = newG;
    for (let i = 0; i < (4 - rotations) % 4; i++) result = rotateCW(result);
    if (moved) {
      history.push(cloneState());
      if (history.length > 15) history.shift();
      grid = result;
      score += gained;
      api.setScore(score);
      if (gained) api.beep(500 + Math.min(gained, 500), 0.08, 'sine', 0.05);
      addRandom();
      render();
      checkEnd();
    }
  }

  function checkEnd() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c] === 2048 && !statusShown) {
      statusShown = true; api.beep(880, 0.3, 'sine', 0.08);
    }
    const hasEmpty = grid.some(row => row.some(v => !v));
    if (hasEmpty) return;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if ((c < SIZE - 1 && grid[r][c + 1] === v) || (r < SIZE - 1 && grid[r + 1][c] === v)) return;
    }
    api.beep(140, 0.35, 'sawtooth', 0.08);
    setTimeout(() => api.gameOver(score, { title: '🔢 NO MOVES LEFT' }), 300);
  }

  function render() {
    boardEl.innerHTML = '';
    grid.forEach(row => row.forEach(v => {
      const cell = el('div', 'g2048-cell', v || '');
      if (v) { cell.style.background = COLORS[v] || '#ff2bd6'; cell.style.color = v <= 4 ? '#cfe8ff' : '#0a0a18'; }
      boardEl.appendChild(cell);
    }));
  }

  function undo() {
    if (!history.length) return;
    const prev = history.pop();
    grid = prev.grid; score = prev.score;
    api.setScore(score);
    api.beep(300, 0.08, 'triangle', 0.05);
    render();
  }

  function newGame() {
    grid = emptyGrid(); score = 0; history = []; statusShown = false;
    api.setScore(0);
    addRandom(); addRandom();
    render();
  }

  function onKey(e) {
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    if (e.key === 'z' || e.key === 'u') undo();
  }

  let touchStart = null;
  function onTouchStart(e) { touchStart = e.touches[0]; }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.clientX, dy = t.clientY - touchStart.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left'); else move(dy > 0 ? 'down' : 'up');
    touchStart = null;
  }

  return {
    start() {
      wrap = el('div', 'g2048-wrap game-dynamic');
      boardEl = el('div', 'g2048-board');
      const actions = el('div', 'g2048-actions');
      const undoBtn = el('button', 'btn btn-ghost small', '↩ Undo');
      undoBtn.style.marginTop = '0';
      undoBtn.addEventListener('click', undo);
      actions.appendChild(undoBtn);
      wrap.append(boardEl, actions);
      api.stage.appendChild(wrap);
      wrap.tabIndex = 0;
      wrap.addEventListener('touchstart', onTouchStart, { passive: true });
      wrap.addEventListener('touchend', onTouchEnd, { passive: true });
      document.addEventListener('keydown', onKey);
      api.setHelp('Arrow keys / WASD / swipe to merge tiles. Press Z or click Undo to rewind one move.');
      newGame();
    },
    pause() {}, resume() {},
    restart() { newGame(); },
    destroy() { document.removeEventListener('keydown', onKey); }
  };
};

/* =========================================================
   7. DINO RUNNER
   ========================================================= */
GAME_MODULES.dino = function (api) {
  const W = 600, H = 220;
  let canvas, ctx, raf, running, dino, obstacles, speed, frame, score, groundY, nextSpawn;

  function reset() {
    groundY = H - 30;
    dino = { x: 60, y: groundY - 40, w: 34, h: 40, vy: 0, jumping: false, duck: false };
    obstacles = [];
    speed = 6; frame = 0; score = 0; nextSpawn = 60;
    api.setScore(0);
  }

  function jump() {
    if (dino.jumping || api.isPaused() || !running) return;
    dino.vy = -12.5; dino.jumping = true;
    api.beep(500, 0.08, 'square', 0.05);
  }

  function spawn() {
    const isBird = Math.random() < 0.3 && score > 15;
    if (isBird) obstacles.push({ x: W + 10, y: groundY - 70 - Math.random() * 20, w: 30, h: 20, bird: true });
    else {
      const wide = Math.random() < 0.3;
      obstacles.push({ x: W + 10, y: groundY - (wide ? 34 : 30), w: wide ? 40 : 20, h: wide ? 34 : 30 });
    }
  }

  function update() {
    frame++;
    speed = 6 + Math.min(score * 0.045, 7);
    dino.vy += 0.7;
    dino.y += dino.vy;
    if (dino.y > groundY - dino.h) { dino.y = groundY - dino.h; dino.vy = 0; dino.jumping = false; }

    if (frame >= nextSpawn) { spawn(); nextSpawn = frame + 55 + Math.random() * 45 - Math.min(score * 0.5, 25); }

    obstacles.forEach(o => o.x -= speed);
    obstacles = obstacles.filter(o => o.x > -50);

    score += 0.12;
    api.setScore(Math.floor(score));

    const dh = dino.duck ? 20 : dino.h;
    const dy = dino.duck ? dino.y + (dino.h - 20) : dino.y;
    for (const o of obstacles) {
      if (dino.x < o.x + o.w && dino.x + dino.w > o.x && dy < o.y + o.h && dy + dh > o.y) { die(); return; }
    }
  }

  function die() {
    running = false;
    api.beep(140, 0.35, 'sawtooth', 0.08);
    cancelAnimationFrame(raf);
    api.gameOver(Math.floor(score));
  }

  function draw() {
    ctx.fillStyle = '#0b0b1f'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,246,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

    ctx.fillStyle = '#00f6ff'; ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 10;
    const dh = dino.duck ? 20 : dino.h;
    const dy = dino.duck ? dino.y + (dino.h - 20) : dino.y;
    ctx.fillRect(dino.x, dy, dino.w, dh);
    ctx.shadowBlur = 0;

    obstacles.forEach(o => {
      ctx.fillStyle = o.bird ? '#ff2bd6' : '#ffe14d';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.shadowBlur = 0;
    });

    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 6; i++) { const cx = (i * 140 - frame * 2 * (speed / 6)) % (W + 60); ctx.fillRect(cx, 30 + (i % 3) * 14, 3, 3); }
  }

  function loop() {
    if (running && !api.isPaused()) { update(); draw(); }
    raf = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown') { dino.duck = true; }
  }
  function onKeyUp(e) { if (e.code === 'ArrowDown') dino.duck = false; }
  function onPointer() { jump(); }

  return {
    start() {
      canvas = makeCanvas(W, H); canvas.classList.add('game-dynamic');
      ctx = canvas.getContext('2d');
      api.stage.appendChild(canvas);
      api.setHelp('SPACE / tap to jump, ↓ to duck under birds. Speed increases the longer you survive.');
      reset(); running = true;
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('pointerdown', onPointer);
      draw();
      raf = requestAnimationFrame(loop);
    },
    pause() {}, resume() {},
    restart() { reset(); running = true; },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    }
  };
};
