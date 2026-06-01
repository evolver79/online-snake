# Snake Dungeon — Claude.md

## Project Overview

Snake Dungeon is a browser-based roguelike dungeon crawler. The snake moves through procedurally generated floors, kills enemies to grow, collects pickups, and takes the exit staircase to the next floor. Every 5th floor is a boss floor.

Deployed on **Netlify** (static). Backend is **Supabase** (Postgres + Realtime) for the shared leaderboard. No server process — the browser connects directly to Supabase.

GitHub: https://github.com/evolver79/online-snake

## Repo Structure

```
online-snake/
  client/          Vite + TypeScript frontend
    src/
      main.ts      Entry point
      Game.ts      Game controller — overlay UI, RAF loop, leaderboard
      GameEngine   → shared/src/GameEngine.ts
      Renderer.ts  Canvas 2D renderer (all drawing)
      InputHandler.ts  Keyboard + pointer input
      SoundEngine.ts   Web Audio procedural sound
      Leaderboard.ts   Supabase fetch/submit/realtime
      profanity.ts     Name filter (bad-words + Norwegian words)
    index.html     Single HTML file, minimal CSS overlay
  shared/
    src/
      GameEngine.ts  Game logic — dungeon gen, snake, enemies, pickups
      types.ts       All shared TypeScript types
      constants.ts   Tuning values (speeds, sizes, floor cadence)
  netlify.toml     Build: `npm --prefix client install && npm --prefix client run build`
```

## Key Architecture Decisions

- **Canvas 2D, not Three.js.** The project started with Three.js in mind but the dungeon crawler was built directly on a 480×270 logical canvas with `image-rendering: pixelated`, scaled via CSS. All rendering is in `Renderer.ts`.
- **Shared game logic.** `shared/src/GameEngine.ts` contains all simulation — no DOM imports. The client imports it via the `@shared` Vite alias.
- **Fixed 60 logic-ticks/sec.** `Game.ts` accumulates elapsed time and steps the engine at 60 ticks/sec regardless of display refresh rate.
- **No compiled .js files in src/.** Vite transpiles TypeScript directly. Never add `.js` files alongside `.ts` in `client/src/` or `shared/src/` — Vite prefers `.js` over `.ts` when both exist, silently loading stale code.

## Canvas Layout

- Logical size: 480×270 px
- Play area: 480×220 (MAP_W=48 × MAP_H=22 cells, CELL=10px)
- HUD strip: 480×50 at the bottom
- Scaled to fill viewport via CSS (`min(100vw, 177.78vh)` × `min(100vh, 56.25vw)`)
- CRT effect: pre-baked overlay canvas (scanlines + radial vignette), drawn last

## Pixel Font

All in-game text uses a custom 4×5 pixel font in `Renderer.ts`. The `GLYPHS` record maps characters to 5-element arrays of bit patterns. Missing characters render as space. Current coverage: 0–9, A–N, P–V, X–Y, space. Add missing letters to `GLYPHS` before using them in messages.

## Game Phases

`DungeonPhase` in `shared/src/types.ts`:
- `start` — title screen, waiting for first key press
- `playing` — active game
- `respawn` — died with lives remaining; game frozen, waiting for key press
- `dead` — all lives gone, game over screen

## Environment Variables

Required in `client/.env.local` (never commit):
```
VITE_SUPABASE_URL=https://mbzfrvxxwmkiqbbjysia.supabase.co
VITE_SUPABASE_ANON_KEY=<anon jwt>
```

Add the same two vars in Netlify → Site settings → Environment variables for production builds.

## Dev Server

```bash
cd client && npm run dev     # http://localhost:5173
```

Always restart the dev server after structural changes (new files, deleted files). Hot reload works for edits within existing `.ts` files.

## Common Pitfalls

- **WASD in text inputs**: `InputHandler` skips direction interception when `document.activeElement` is an input — don't break this.
- **Respawn safety**: snake always respawns with `INIT_SNAKE_LEN` (3) segments going RIGHT from `roomCenter(rooms[0])`. Rooms are minimum 5 cells wide, so 3 segments always fit. Don't increase respawn length without verifying room bounds.
- **Enemy containment**: enemies are constrained to their `roomIdx` room via `enemyCanMove`. They can't leave their room.
- **Exit reveal**: exit only appears once ALL enemies on the floor are dead. `s.grid[ep.y][ep.x]` is set to `'exit'` and `s.exitPos` is set simultaneously.
- **Boss floors**: every `BOSS_FLOOR_EVERY` (5) floors. One boss (HP=5, segments=10) in the last room. Heart pickup is guaranteed on boss floors.
- **Name entry qualification**: only shown if score strictly beats the 10th entry in the leaderboard (or fewer than 10 exist). Equal scores don't qualify.
