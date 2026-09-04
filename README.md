# 🕹️ NEXUS ARCADE

A pro-level, single-page game arcade — pure HTML5, CSS3 and vanilla JavaScript (no frameworks, no build step). Neon/glassmorphism dark theme, 7 fully playable games, search & category filters, a global leaderboard, and a player profile — all persisted with `localStorage`.

## 📁 Folder structure

```
game-arcade/
├── index.html          → all markup (preloader, header, hero, grid, leaderboard, profile, game shell)
├── css/
│   └── style.css        → entire design system (neon dark theme + light-mode override, fully responsive)
├── js/
│   ├── games.js          → all 7 game engines (Flappy, TicTacToe, Memory, Snake, Typing, 2048, Dino)
│   └── main.js            → app shell: routing, search/filter, leaderboard, profile, audio, theme, pause/fullscreen system
└── README.md
```

Nothing else is required — there are no build tools, no `npm install`, no bundler. The only external resource is the Google Fonts stylesheet (Orbitron + Rajdhani).

## ▶️ How to run locally in VS Code

**Option A — Live Server (recommended)**
1. Open the `game-arcade` folder in VS Code (`File → Open Folder…`).
2. Install the **"Live Server"** extension (by Ritwick Dey) from the Extensions tab if you don't have it.
3. Right-click `index.html` in the file explorer → **"Open with Live Server"**.
4. Your browser opens automatically at something like `http://127.0.0.1:5500` — done!

**Option B — Any static server**
```bash
cd game-arcade
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```
or, with Node installed:
```bash
npx serve .
```

**Option C — Just double-click**
You can literally double-click `index.html` and it will open directly in your browser (`file://…`). Everything works offline since there's no backend — the only caveat is some browsers restrict `localStorage` slightly differently under `file://`, so Option A/B is preferred for the full experience.

## 🎮 Games included

| Game | Type | Highlights |
|---|---|---|
| Flappy Bird | Canvas | Increasing difficulty (speed & gap shrink with score) |
| Tic-Tac-Toe | DOM | Unbeatable minimax AI, win/loss/draw tracking |
| Memory Match | DOM | Flip-card animation, timer + move counter, score formula |
| Snake | Canvas | Golden power-up food = temporary speed boost |
| Typing Speed Test | DOM | Live WPM + accuracy, per-character highlighting |
| 2048 | DOM | Swipe/arrow merging, **undo** (press `Z` or the Undo button) |
| Dino Runner | Canvas | Chrome-style endless runner, jump + duck, birds & cacti |

Every game shares one generic **Game Shell** (`main.js`) providing:
- Pause / Resume (`ESC` or the ⏸ button)
- Restart (`R` or the 🔁 button)
- Fullscreen toggle (`F` or the ⛶ button)
- Mute/unmute sound effects (Web Audio API oscillator beeps — no audio files needed)
- Live score + per-game **high score**, persisted in `localStorage`
- Game-over overlay with "new high score" celebration
- Every completed session is recorded to the **global leaderboard** and the **player profile** (games played, total score, favorite game)

## 🎨 Design notes

- Theme: dark neon/glassmorphism by default, with a light-mode toggle (🌙/☀️ button, top right) — preference is remembered.
- Fully responsive: CSS Grid card layout, fluid typography (`clamp()`), and per-game canvases that scale to fit mobile/tablet/desktop via `aspect-ratio`.
- Preloader animates on first load; category chips + live search filter the game grid instantly; sort by Featured / Top Rated / A–Z.

## 🗑️ Resetting your data

Scroll to the **Player Profile** section and click **"Reset All Data"** — this clears every high score, leaderboard entry, and profile stat stored under the `arcade_*` localStorage keys. Nothing else on your machine is touched.

## 🧩 Extending it

To add an 8th game:
1. Add a metadata entry to the `GAMES` array at the top of `js/main.js` (id, name, category, emoji, desc, trending, isNew, rating).
2. Add `GAME_MODULES.yourId = function(api) { return { start(), pause(), resume(), restart(), destroy() }; }` in `js/games.js`, following the pattern of the existing games (use `api.setScore()`, `api.gameOver()`, `api.beep()`, `api.stage`, `api.isPaused()`).

That's it — the shell, leaderboard, high scores, and card rendering all pick it up automatically.
