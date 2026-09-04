/* =========================================================
   NEXUS ARCADE — main.js
   Handles: preloader, theme, search/filter, card rendering,
   the generic Game Shell (pause/resume/restart/fullscreen/
   sound/high-scores), leaderboard & profile persistence.
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- GAME METADATA ---------------- */
  const GAMES = [
    { id: 'flappy',    name: 'Flappy Bird',    category: 'Action', emoji: '🐦', desc: 'Flap through neon pipes without crashing. Gets harder the further you fly.', trending: true,  isNew: false, rating: 4.6 },
    { id: 'tictactoe', name: 'Tic-Tac-Toe',    category: 'Puzzle', emoji: '⭕', desc: 'Classic 3-in-a-row against an unbeatable minimax AI opponent.',              trending: false, isNew: false, rating: 4.2 },
    { id: 'memory',    name: 'Memory Match',   category: 'Puzzle', emoji: '🧠', desc: 'Flip cards, find every pair. Timer & move-counter track your best runs.',     trending: false, isNew: true,  rating: 4.4 },
    { id: 'snake',     name: 'Snake',          category: 'Arcade', emoji: '🐍', desc: 'Eat, grow, survive. Grab gold orbs for a temporary speed boost.',             trending: true,  isNew: false, rating: 4.7 },
    { id: 'typing',    name: 'Typing Speed',   category: 'Skill',  emoji: '⌨️', desc: 'Race the clock with a live WPM & accuracy counter.',                          trending: false, isNew: false, rating: 4.1 },
    { id: 'g2048',     name: '2048',           category: 'Puzzle', emoji: '🔢', desc: 'Slide & merge tiles to reach 2048 — with a handy undo button.',               trending: true,  isNew: false, rating: 4.5 },
    { id: 'dino',      name: 'Dino Runner',    category: 'Action', emoji: '🦖', desc: 'Chrome-style endless runner. Jump cacti, duck birds, beat your best.',        trending: false, isNew: true,  rating: 4.3 },
  ];

  /* ---------------- STORAGE HELPERS ---------------- */
  const LS = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const HS_KEY = id => `arcade_highscore_${id}`;
  const LEADERBOARD_KEY = 'arcade_leaderboard';
  const PROFILE_KEY = 'arcade_profile';
  const THEME_KEY = 'arcade_theme';
  const MUTE_KEY = 'arcade_muted';

  function getHighScore(id) { return LS.get(HS_KEY(id), 0); }
  function setHighScore(id, val) { LS.set(HS_KEY(id), val); }

  function getProfile() { return LS.get(PROFILE_KEY, { played: 0, totalScore: 0, perGame: {} }); }
  function saveProfile(p) { LS.set(PROFILE_KEY, p); }

  function recordSession(gameId, score) {
    const profile = getProfile();
    profile.played++;
    profile.totalScore += score;
    profile.perGame[gameId] = (profile.perGame[gameId] || 0) + 1;
    saveProfile(profile);

    const board = LS.get(LEADERBOARD_KEY, []);
    board.push({ game: gameId, score, date: new Date().toISOString() });
    board.sort((a, b) => b.score - a.score);
    LS.set(LEADERBOARD_KEY, board.slice(0, 25));

    renderProfile();
    renderLeaderboard();
    renderHeroStats();
  }

  /* ---------------- AUDIO ---------------- */
  let audioCtx = null;
  function isMuted() { return LS.get(MUTE_KEY, false); }
  function setMuted(v) { LS.set(MUTE_KEY, v); }
  function beep(freq = 440, dur = 0.1, type = 'sine', vol = 0.05) {
    if (isMuted()) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio not available — fail silently */ }
  }

  /* ---------------- THEME ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeToggle').textContent = theme === 'light' ? '☀️' : '🌙';
    LS.set(THEME_KEY, theme);
  }
  document.getElementById('themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(cur);
  });

  /* ---------------- PRELOADER ---------------- */
  window.addEventListener('load', () => {
    const fill = document.getElementById('loaderFill');
    const text = document.getElementById('loaderText');
    const msgs = ['Booting arcade cabinets…', 'Charging neon tubes…', 'Polishing high scores…', 'Ready!'];
    let p = 0, i = 0;
    const iv = setInterval(() => {
      p += 8 + Math.random() * 14;
      if (p > 100) p = 100;
      fill.style.width = p + '%';
      if (p > i * 30 && i < msgs.length - 1) { i++; text.textContent = msgs[i]; }
      if (p >= 100) {
        clearInterval(iv);
        text.textContent = msgs[msgs.length - 1];
        setTimeout(() => document.getElementById('preloader').classList.add('hide'), 350);
      }
    }, 120);
  });

  /* ---------------- CARD RENDERING ---------------- */
  const grid = document.getElementById('gameGrid');
  const noResults = document.getElementById('noResults');
  let activeCategory = 'All';
  let searchTerm = '';
  let sortMode = 'default';

  function starString(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full) + ` ${rating.toFixed(1)}`;
  }

  function renderCards() {
    let list = GAMES.filter(g =>
      (activeCategory === 'All' || g.category === activeCategory) &&
      (g.name.toLowerCase().includes(searchTerm) || g.desc.toLowerCase().includes(searchTerm) || g.category.toLowerCase().includes(searchTerm))
    );
    if (sortMode === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortMode === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));

    grid.innerHTML = '';
    noResults.hidden = list.length !== 0;

    list.forEach(g => {
      const hs = getHighScore(g.id);
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="card-thumb">
          <div class="card-badges">
            ${g.trending ? '<span class="badge trending">🔥 Trending</span>' : ''}
            ${g.isNew ? '<span class="badge new">✨ New</span>' : ''}
          </div>
          ${g.emoji}
        </div>
        <div class="card-body">
          <div class="card-top-row">
            <span class="card-title">${g.name}</span>
            <span class="card-cat">${g.category}</span>
          </div>
          <p class="card-desc">${g.desc}</p>
          <div class="card-foot">
            <span class="card-rating">${starString(g.rating)}</span>
            <span class="card-highscore">Best: ${hs}</span>
          </div>
          <div class="card-play">▶ Play Now</div>
        </div>`;
      card.addEventListener('click', () => openGame(g.id));
      grid.appendChild(card);
    });
  }

  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderCards();
  });
  document.getElementById('categoryChips').addEventListener('click', e => {
    if (!e.target.classList.contains('chip')) return;
    [...document.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    activeCategory = e.target.dataset.cat;
    renderCards();
  });
  document.getElementById('sortSelect').addEventListener('change', e => { sortMode = e.target.value; renderCards(); });
  document.getElementById('playNowBtn').addEventListener('click', () => document.getElementById('games').scrollIntoView({ behavior: 'smooth' }));
  document.getElementById('viewLeaderboardBtn').addEventListener('click', () => document.getElementById('leaderboard').scrollIntoView({ behavior: 'smooth' }));

  /* ---------------- HERO STATS ---------------- */
  function renderHeroStats() {
    const profile = getProfile();
    document.getElementById('statPlayed').textContent = profile.played;
    const totalHigh = GAMES.reduce((sum, g) => sum + getHighScore(g.id), 0);
    document.getElementById('statHigh').textContent = totalHigh;
  }

  /* ---------------- LEADERBOARD ---------------- */
  function renderLeaderboard() {
    const board = LS.get(LEADERBOARD_KEY, []);
    const body = document.getElementById('leaderboardBody');
    if (!board.length) { body.innerHTML = '<tr><td colspan="4" class="empty-row">No scores yet — go play something!</td></tr>'; return; }
    body.innerHTML = board.slice(0, 10).map((entry, i) => {
      const g = GAMES.find(x => x.id === entry.game);
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
      const d = new Date(entry.date);
      return `<tr><td class="${rankClass}">#${i + 1}</td><td>${g ? g.emoji + ' ' + g.name : entry.game}</td><td>${entry.score}</td><td>${d.toLocaleDateString()}</td></tr>`;
    }).join('');
  }

  /* ---------------- PROFILE ---------------- */
  function renderProfile() {
    const profile = getProfile();
    document.getElementById('profileGamesPlayed').textContent = profile.played;
    document.getElementById('profileTotalScore').textContent = profile.totalScore;
    let fav = '—';
    const entries = Object.entries(profile.perGame || {});
    if (entries.length) {
      const [favId] = entries.sort((a, b) => b[1] - a[1])[0];
      const g = GAMES.find(x => x.id === favId);
      fav = g ? `${g.emoji} ${g.name}` : favId;
    }
    document.getElementById('profileFav').textContent = fav;
  }
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('This will erase all high scores, leaderboard entries and profile stats. Continue?')) return;
    Object.keys(localStorage).filter(k => k.startsWith('arcade_')).forEach(k => localStorage.removeItem(k));
    renderCards(); renderProfile(); renderLeaderboard(); renderHeroStats();
  });

  /* =========================================================
     GAME SHELL — generic wrapper around every game module
     ========================================================= */
  const overlay = document.getElementById('gameOverlay');
  const shell = document.getElementById('gameShell');
  const stage = document.getElementById('gameStage');
  const pauseScreen = document.getElementById('pauseScreen');
  const gameoverScreen = document.getElementById('gameoverScreen');
  const scoreVal = document.getElementById('scoreVal');
  const highScoreVal = document.getElementById('highScoreVal');
  const gameTitleText = document.getElementById('gameTitleText');
  const gameTitleIcon = document.getElementById('gameTitleIcon');
  const helpEl = document.getElementById('gameHelp');
  const muteBtn = document.getElementById('muteBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  let currentGameId = null;
  let currentInstance = null;
  let paused = false;
  let ended = false;
  let currentScore = 0;

  function apiFor(gameId) {
    return {
      stage,
      isPaused: () => paused,
      isMuted,
      beep,
      setHelp: text => { helpEl.textContent = text; },
      setScore(n) {
        currentScore = n;
        scoreVal.textContent = n;
        const hs = getHighScore(gameId);
        if (n > hs) { setHighScore(gameId, n); highScoreVal.textContent = n; }
      },
      gameOver(score, opts = {}) {
        if (ended) return;
        ended = true;
        currentScore = score;
        const hs = getHighScore(gameId);
        const isNewHigh = score > hs;
        if (isNewHigh) setHighScore(gameId, score);
        recordSession(gameId, score);
        document.getElementById('gameoverTitle').textContent = opts.title || 'GAME OVER';
        document.getElementById('gameoverScoreText').textContent = opts.extra ? opts.extra : `Score: ${score}`;
        document.getElementById('gameoverHighText').hidden = !isNewHigh;
        gameoverScreen.hidden = false;
        highScoreVal.textContent = getHighScore(gameId);
      }
    };
  }

  function openGame(id) {
    const meta = GAMES.find(g => g.id === id);
    if (!meta || !GAME_MODULES[id]) return;
    currentGameId = id;
    ended = false; paused = false;
    clearStage(stage);
    pauseScreen.hidden = true; gameoverScreen.hidden = true;
    gameTitleIcon.textContent = meta.emoji;
    gameTitleText.textContent = meta.name;
    scoreVal.textContent = '0';
    highScoreVal.textContent = getHighScore(id);
    pauseBtn.textContent = '⏸';
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    currentInstance = GAME_MODULES[id](apiFor(id));
    currentInstance.start();
  }

  function closeGame() {
    if (currentInstance) currentInstance.destroy();
    currentInstance = null; currentGameId = null;
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (shell.classList.contains('is-fs') || document.fullscreenElement) exitFullscreen();
    renderCards();
  }

  function togglePause(force) {
    if (!currentInstance || ended) return;
    const next = typeof force === 'boolean' ? force : !paused;
    if (next === paused) return;
    paused = next;
    pauseScreen.hidden = !paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    if (paused) { currentInstance.pause && currentInstance.pause(); }
    else { currentInstance.resume && currentInstance.resume(); }
  }

  function restartGame() {
    if (!currentInstance) return;
    ended = false; paused = false;
    pauseScreen.hidden = true; gameoverScreen.hidden = true;
    pauseBtn.textContent = '⏸';
    scoreVal.textContent = '0';
    currentInstance.restart();
  }

  function requestFullscreen() {
    const el = shell;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  }
  function exitFullscreen() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (document.fullscreenElement && ex) ex.call(document);
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) exitFullscreen(); else requestFullscreen();
  }

  document.getElementById('backBtn').addEventListener('click', closeGame);
  document.getElementById('backHomeBtn').addEventListener('click', closeGame);
  document.getElementById('pauseBtn').addEventListener('click', () => togglePause());
  document.getElementById('resumeOverlayBtn').addEventListener('click', () => togglePause(false));
  document.getElementById('restartBtn').addEventListener('click', restartGame);
  document.getElementById('playAgainBtn').addEventListener('click', restartGame);
  document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
  document.getElementById('muteBtn').addEventListener('click', () => {
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    beep(440, 0.08, 'sine', 0.05);
  });

  /* ---------------- KEYBOARD SHORTCUTS ---------------- */
  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { togglePause(); }
    else if (e.key.toLowerCase() === 'f' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { toggleFullscreen(); }
    else if (e.key.toLowerCase() === 'r' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { restartGame(); }
  });

  /* ---------------- INIT ---------------- */
  applyTheme(LS.get(THEME_KEY, 'dark'));
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  renderCards();
  renderLeaderboard();
  renderProfile();
  renderHeroStats();
})();
