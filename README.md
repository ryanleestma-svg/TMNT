# 🐢 Teenage Mutant Ninja Turtles — Sewer Showdown

A browser-based beat-'em-up. Pick your turtle, fight off waves of the Foot Clan,
and survive to the final showdown. No build step, no dependencies — pure HTML5
Canvas + JavaScript.

## Play

Open `index.html` in any modern browser:

```bash
# from the project directory
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or just double-click `index.html`.

## Controls

| Action  | Keys                    |
|---------|-------------------------|
| Move    | Arrow keys or `WASD`    |
| Attack  | `J` or `Space`          |
| Jump    | `K`                     |
| Special | `L` (needs full meter)  |

## Features

- **Four playable turtles**, each with unique stats and a signature weapon:
  - **Leonardo** — Katana, balanced leader
  - **Raphael** — Sai, hard hitter
  - **Donatello** — Bo staff, long reach
  - **Michelangelo** — Nunchaku, fast & wild
- **8 escalating waves** of Foot Clan soldiers, including purple **elite** ninjas.
- **Combo system** — chain attacks for bonus damage.
- **Special meter** — fill it by landing hits, then unleash a screen-clearing
  special with `L`.
- **3 lives**, score tracking, and a between-wave heal.
- Sprites and the sewer backdrop are drawn entirely in code — no image assets.

## Files

- `index.html` — markup, menu, HUD, game-over screen
- `style.css` — retro arcade styling
- `game.js` — the full game engine (input, combat, waves, rendering)

Cowabunga! 🍕
