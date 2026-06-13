# 🐢 Teenage Mutant Ninja Turtles — Sewer Showdown

A 90s-style **side-scrolling beat-'em-up** in the spirit of *TMNT: Turtles in Time*
and the classic *TMNT Arcade Game*. Solo or **2-player co-op**, brawl through five
stages — including a Mode-7-style hoverboard ride — and take down Bebop,
Rocksteady, Baxter, the Rat King, Krang, and Shredder.

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

**1 player** (also works with a gamepad or on-screen touch buttons):

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

**2 player co-op** (pick "2P" on the menu):

| | Move | Attack | Jump | Special |
|---|---|---|---|---|
| **P1** | `WASD` | `F` | `G` | `H` |
| **P2** | Arrows | `.` | `/` | `,` |

Two gamepads also work — one per player. On phones/tablets the on-screen
D-pad and buttons appear automatically.

## The classic feel

- **Five stages**, each with its own backdrop, enemies, and boss:
  1. **Big Apple, 3 AM** — neon city rooftops → **Bebop**
  2. **Sewer Surfin'** — the turtles' home turf → **Rocksteady**
  3. **Neon Night Riders** — a Mode-7-style synthwave **hoverboard ride**, dodging
     and smashing Foot riders that rush you from the horizon → **Baxter the Fly**
  4. **Sewer Lair of the Rat King** — swarming rats → **The Rat King** (who summons more)
  5. **Technodrome: Let's Kick Shell** — Krang's fortress → mid-boss **Krang**
     in his android body, then final boss **Shredder**
- **2-player co-op** — team up locally; enemies and bosses target the nearest turtle.
- **"STOP" enemy gates** — the screen locks and you must clear the Foot Clan
  before the path opens and the **GO ▶** arrow appears.
- **Grab & throw** — the signature move. Stun a Foot Soldier, grab it, and throw
  it into its buddies to knock them all down.
- **Four Foot Soldier types** — purple (melee), red (fast bruisers), blue
  (keep their distance and throw shuriken), and the Rat King's rats.
- **Six bosses**, each with their own health bar and distinct patterns —
  Bebop & Rocksteady charge and swipe, the Rat King summons rats, Krang stomps
  shockwaves and fires beams, Baxter swoops and spits, and **Shredder teleports**,
  only opening up right after he attacks (just like the original).
- **Pizza pickups** restore health between fights. 🍕
- **Synthesized arcade sound** — punches, throws, jumps, pizza, and boss hits,
  all generated with the Web Audio API.
- **Four playable turtles** with distinct stats: Leo (balanced), Raph (power),
  Don (long reach), Mike (fast).
- **Keyboard, gamepad, and touch** controls all supported.

## Files

- `index.html` — menu, HUD, boss bar, game-over screen
- `style.css` — retro arcade styling
- `game.js` — the full engine (input, camera, combat, grab/throw, bosses, audio)

Cowabunga! 🍕
