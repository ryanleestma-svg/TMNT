# 🐢 Teenage Mutant Ninja Turtles — Sewer Showdown

A 90s-style **side-scrolling beat-'em-up** in the spirit of *TMNT: Turtles in Time*
and the classic *TMNT Arcade Game*. Pick your turtle, brawl through three
time-warped stages of Foot Clan, and take down Bebop, Rocksteady, and Shredder.

Pure HTML5 Canvas + Web Audio. **No build step, no dependencies, no asset files** —
every sprite, background, and sound effect is generated in code.

## Play

```bash
cd TMNT
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `index.html`. (Sound starts after you pick a turtle, since
browsers require a click before playing audio.)

## Controls

| Action       | Keys                                                        |
|--------------|-------------------------------------------------------------|
| Move         | Arrow keys or `WASD` — **double-tap** left/right to **run** |
| Attack       | `J` or `Space` (3-hit combo; the 3rd hit knocks down)       |
| **Grab**     | Walk into a stunned Foot Soldier to grapple it              |
| **Throw**    | While grabbing, press **Attack** to hurl them — flying foes bowl over others |
| Jump         | `K`                                                         |
| **Jump kick**| Attack while airborne                                       |
| **Slide**    | Attack while running                                        |
| Special spin | `L` — hits everything around you, costs a little health     |

## The classic feel

- **Three time-traveling stages**, each with its own backdrop, enemies, and boss:
  1. **Big Apple, 3 AM** — neon city rooftops → **Bebop**
  2. **Sewer Surfin'** — the turtles' home turf → **Rocksteady**
  3. **Technodrome: Let's Kick Shell** — Krang's fortress → **Shredder**
- **"STOP" enemy gates** — the screen locks and you must clear the Foot Clan
  before the path opens and the **GO ▶** arrow appears.
- **Grab & throw** — the signature move. Stun a Foot Soldier, grab it, and throw
  it into its buddies to knock them all down.
- **Three Foot Soldier types** — purple (melee), red (fast bruisers), and blue
  (keep their distance and throw shuriken).
- **Bosses with their own health bar** and distinct patterns — Bebop & Rocksteady
  charge and swipe; **Shredder teleports** and is only vulnerable right after he
  attacks (just like the original).
- **Pizza pickups** restore health between fights. 🍕
- **Synthesized arcade sound** — punches, throws, jumps, pizza, and boss hits,
  all generated with the Web Audio API.
- **Four playable turtles** with distinct stats: Leo (balanced), Raph (power),
  Don (long reach), Mike (fast).

## Files

- `index.html` — menu, HUD, boss bar, game-over screen
- `style.css` — retro arcade styling
- `game.js` — the full engine (input, camera, combat, grab/throw, bosses, audio)

Cowabunga! 🍕
