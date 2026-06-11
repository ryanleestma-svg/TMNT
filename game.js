/* =========================================================================
   TEENAGE MUTANT NINJA TURTLES — SEWER SHOWDOWN
   A browser beat-'em-up. Pure canvas, no assets, no dependencies.
   ========================================================================= */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const FLOOR_TOP = 300;   // top of the walkable floor band (depth)
  const FLOOR_BOT = 500;   // bottom of the walkable floor band

  /* ---------------------------------------------------------------------
     Turtle roster. Each has a bandana color, weapon, and tuned stats.
     --------------------------------------------------------------------- */
  const TURTLES = {
    leo: {
      name: "LEONARDO", weap: "Katana", color: "#1f6fff",
      speed: 3.0, power: 10, range: 64, maxHealth: 100,
      desc: "Balanced leader",
      special: "Twin Slash",
    },
    raph: {
      name: "RAPHAEL", weap: "Sai", color: "#d11f2f",
      speed: 3.1, power: 14, range: 50, maxHealth: 110,
      desc: "Hard hitter",
      special: "Rage Spin",
    },
    don: {
      name: "DONATELLO", weap: "Bo Staff", color: "#7a3fd1",
      speed: 2.7, power: 8, range: 86, maxHealth: 95,
      desc: "Long reach",
      special: "Sweep Quake",
    },
    mike: {
      name: "MICHELANGELO", weap: "Nunchaku", color: "#ff8a1f",
      speed: 3.4, power: 9, range: 56, maxHealth: 100,
      desc: "Fast & wild",
      special: "Cowabunga Combo",
    },
  };

  /* ---------------------------------------------------------------------
     Input handling
     --------------------------------------------------------------------- */
  const keys = {};
  const pressed = {};
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  function consume(k) { if (pressed[k]) { pressed[k] = false; return true; } return false; }

  /* ---------------------------------------------------------------------
     Sprite drawing — turtles & foot soldiers drawn with primitives.
     Drawn centered at (0,0); caller translates/scales/flips.
     --------------------------------------------------------------------- */
  function drawTurtle(g, color, frame, scale) {
    scale = scale || 1;
    g.save();
    g.scale(scale, scale);
    const bob = Math.sin(frame * 0.3) * 1.5;

    // shadow
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(0, 34, 20, 6, 0, 0, Math.PI * 2); g.fill();

    // legs
    g.fillStyle = "#2e7d32";
    g.fillRect(-11, 18, 8, 16);
    g.fillRect(3, 18, 8, 16);
    g.fillStyle = "#1b3a1c"; // foot pads
    g.fillRect(-13, 32, 12, 4);
    g.fillRect(1, 32, 12, 4);

    // shell (behind body)
    g.fillStyle = "#6b3e16";
    g.beginPath(); g.ellipse(0, 4 + bob, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#8a5320";
    g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();

    // body / plastron
    g.fillStyle = "#43a047";
    g.beginPath(); g.ellipse(0, 6 + bob, 14, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#bfe3a0";
    g.beginPath(); g.ellipse(0, 8 + bob, 9, 13, 0, 0, Math.PI * 2); g.fill();

    // arms
    g.fillStyle = "#43a047";
    g.fillRect(-17, 2 + bob, 7, 16);
    g.fillRect(10, 2 + bob, 7, 16);

    // head
    g.fillStyle = "#4caf50";
    g.beginPath(); g.ellipse(0, -16 + bob, 12, 11, 0, 0, Math.PI * 2); g.fill();

    // bandana
    g.fillStyle = color;
    g.fillRect(-12, -20 + bob, 24, 7);
    // bandana tails
    g.beginPath();
    g.moveTo(11, -19 + bob); g.lineTo(24, -22 + bob); g.lineTo(22, -14 + bob);
    g.lineTo(11, -13 + bob); g.closePath(); g.fill();

    // eyes (white slits)
    g.fillStyle = "#fff";
    g.fillRect(-7, -18 + bob, 5, 4);
    g.fillRect(3, -18 + bob, 5, 4);

    g.restore();
  }

  function drawFoot(g, frame, scale, elite) {
    scale = scale || 1;
    g.save();
    g.scale(scale, scale);
    const bob = Math.sin(frame * 0.25) * 1.5;
    const suit = elite ? "#3a0d4d" : "#2a2a38";
    const trim = elite ? "#c026d3" : "#9aa0b4";

    // shadow
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(0, 34, 16, 5, 0, 0, Math.PI * 2); g.fill();

    // legs
    g.fillStyle = suit;
    g.fillRect(-9, 16, 7, 18);
    g.fillRect(2, 16, 7, 18);

    // body
    g.fillStyle = suit;
    g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();
    // belt sash
    g.fillStyle = trim;
    g.fillRect(-12, 6 + bob, 24, 4);

    // arms
    g.fillStyle = suit;
    g.fillRect(-15, 0 + bob, 6, 15);
    g.fillRect(9, 0 + bob, 6, 15);

    // head wrap
    g.fillStyle = suit;
    g.beginPath(); g.ellipse(0, -14 + bob, 10, 10, 0, 0, Math.PI * 2); g.fill();
    // mask eye-band
    g.fillStyle = trim;
    g.fillRect(-10, -16 + bob, 20, 6);
    g.fillStyle = elite ? "#ff3df0" : "#ff5555";
    g.fillRect(-6, -15 + bob, 4, 3);
    g.fillRect(2, -15 + bob, 4, 3);
    // mask tail
    g.fillStyle = suit;
    g.beginPath();
    g.moveTo(-9, -16 + bob); g.lineTo(-20, -20 + bob); g.lineTo(-18, -12 + bob);
    g.closePath(); g.fill();

    g.restore();
  }

  /* ---------------------------------------------------------------------
     Entities
     --------------------------------------------------------------------- */
  class Player {
    constructor(type) {
      const t = TURTLES[type];
      this.type = type;
      this.cfg = t;
      this.x = 150; this.y = 420;
      this.w = 44; this.h = 70;
      this.vx = 0; this.vy = 0;
      this.z = 0;            // jump height
      this.vz = 0;
      this.facing = 1;
      this.health = t.maxHealth;
      this.special = 0;      // 0..100 meter
      this.attackTimer = 0;
      this.hitTimer = 0;     // i-frames after taking damage
      this.attackCooldown = 0;
      this.frame = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.specialActive = 0;
      this.flash = 0;
    }

    get attacking() { return this.attackTimer > 0; }

    update(dt) {
      this.frame += Math.abs(this.vx) > 0.3 || Math.abs(this.vy) > 0.3 ? 1 : 0.4;
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;
      if (this.hitTimer > 0) this.hitTimer--;
      if (this.flash > 0) this.flash--;
      if (this.comboTimer > 0) this.comboTimer--; else this.combo = 0;
      if (this.specialActive > 0) this.specialActive--;

      // movement input
      let mx = 0, my = 0;
      if (keys["arrowleft"] || keys["a"]) mx -= 1;
      if (keys["arrowright"] || keys["d"]) mx += 1;
      if (keys["arrowup"] || keys["w"]) my -= 1;
      if (keys["arrowdown"] || keys["s"]) my += 1;

      const sp = this.cfg.speed * (this.attacking ? 0.2 : 1);
      this.x += mx * sp;
      this.y += my * sp;
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;

      // clamp to floor band & screen
      this.x = Math.max(30, Math.min(W - 30, this.x));
      this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));

      // jump
      if (consume("k") && this.z === 0) { this.vz = 9; }
      this.z += this.vz;
      this.vz -= 0.6;
      if (this.z < 0) { this.z = 0; this.vz = 0; }

      // attack
      if ((consume("j") || consume(" ")) && this.attackCooldown === 0) {
        this.attackTimer = 12;
        this.attackCooldown = 18;
        this.combo = Math.min(this.combo + 1, 3);
        this.comboTimer = 45;
        this.didHit = false;
      }

      // special
      if (consume("l") && this.special >= 100) {
        this.special = 0;
        this.specialActive = 40;
        this.flash = 40;
      }
    }

    // returns the attack hitbox in world space, or null
    hitbox() {
      if (this.specialActive > 0) {
        // special hits a wide arc around the player
        return { x: this.x - 110, y: this.y - 30, w: 220, h: 90, dmg: this.cfg.power * 2.2, special: true };
      }
      if (!this.attacking || this.attackTimer > 8) return null; // active frames only
      const r = this.cfg.range;
      const x = this.facing === 1 ? this.x : this.x - r;
      const dmg = this.cfg.power * (1 + this.combo * 0.25);
      return { x, y: this.y - 24, w: r, h: 60, dmg };
    }

    takeDamage(d) {
      if (this.hitTimer > 0 || this.specialActive > 0) return;
      this.health -= d;
      this.hitTimer = 40;
      this.flash = 12;
    }

    draw(g) {
      g.save();
      g.translate(this.x, this.y - this.z);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.flash > 0 && Math.floor(this.flash / 2) % 2 === 0) g.globalAlpha = 0.45;

      // special glow
      if (this.specialActive > 0) {
        g.save();
        g.globalAlpha = 0.4;
        g.fillStyle = this.cfg.color;
        g.beginPath(); g.ellipse(0, 0, 70, 50, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      drawTurtle(g, this.cfg.color, this.frame, 1.15);

      // weapon swing arc
      if (this.attacking && this.attackTimer > 6) {
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.lineWidth = 4;
        g.beginPath();
        g.arc(28, -6, this.cfg.range * 0.7, -1.0, 0.9);
        g.stroke();
      }
      g.restore();

      // combo counter
      if (this.combo > 1) {
        g.fillStyle = "#ffd23f";
        g.font = "bold 16px Trebuchet MS";
        g.textAlign = "center";
        g.fillText(this.combo + "x", this.x, this.y - this.z - 64);
      }
    }
  }

  class Foot {
    constructor(x, y, wave) {
      this.x = x; this.y = y;
      this.w = 38; this.h = 60;
      this.elite = wave >= 3 && Math.random() < 0.3;
      this.health = (this.elite ? 45 : 26) + wave * 4;
      this.maxHealth = this.health;
      this.speed = 1.0 + Math.random() * 0.5 + wave * 0.05 + (this.elite ? 0.4 : 0);
      this.facing = -1;
      this.frame = Math.random() * 10;
      this.attackTimer = 0;
      this.attackCooldown = 30 + Math.random() * 40;
      this.hitFlash = 0;
      this.knockback = 0;
      this.dead = false;
      this.value = this.elite ? 250 : 100;
    }

    update(p) {
      this.frame += 0.5;
      if (this.hitFlash > 0) this.hitFlash--;
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;

      if (this.knockback !== 0) {
        this.x += this.knockback;
        this.knockback *= 0.8;
        if (Math.abs(this.knockback) < 0.4) this.knockback = 0;
        return;
      }

      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx > 0 ? 1 : -1;

      // approach the player; keep within striking range
      if (dist > 46) {
        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;
      } else if (this.attackCooldown === 0) {
        this.attackTimer = 16;
        this.attackCooldown = 60 + Math.random() * 40;
        // deal damage mid-swing
        this._pendingHit = true;
      }

      // resolve the strike
      if (this.attackTimer === 8 && this._pendingHit) {
        const near = Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 40;
        if (near) p.takeDamage(this.elite ? 14 : 8);
        this._pendingHit = false;
      }

      this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));
    }

    takeDamage(d, dir) {
      this.health -= d;
      this.hitFlash = 8;
      this.knockback = dir * (d > 20 ? 14 : 8);
      if (this.health <= 0) this.dead = true;
    }

    draw(g) {
      g.save();
      g.translate(this.x, this.y);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.hitFlash > 0) {
        g.globalAlpha = 0.9;
        drawFootFlash(g, this.frame, 1.05, this.elite);
      } else {
        drawFoot(g, this.frame, 1.05, this.elite);
      }
      g.restore();

      // health pip
      if (this.health < this.maxHealth) {
        const w = 34;
        g.fillStyle = "#000";
        g.fillRect(this.x - w / 2 - 1, this.y - 52, w + 2, 5);
        g.fillStyle = this.elite ? "#c026d3" : "#e23";
        g.fillRect(this.x - w / 2, this.y - 51, w * (this.health / this.maxHealth), 3);
      }
    }
  }

  function drawFootFlash(g, frame, scale, elite) {
    drawFoot(g, frame, scale, elite);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(-30, -40, 60, 90);
    g.globalCompositeOperation = "source-over";
  }

  /* ---------------------------------------------------------------------
     Floating text / particles
     --------------------------------------------------------------------- */
  const particles = [];
  function spawnHit(x, y, txt, color) {
    particles.push({ x, y, vy: -1.4, life: 40, txt, color: color || "#fff" });
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles(g) {
    g.textAlign = "center";
    g.font = "bold 18px Trebuchet MS";
    for (const p of particles) {
      g.globalAlpha = Math.min(1, p.life / 20);
      g.fillStyle = p.color;
      g.fillText(p.txt, p.x, p.y);
    }
    g.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------
     Background — a scrolling sewer/rooftop scene
     --------------------------------------------------------------------- */
  function drawBackground(g) {
    // sky / brick gradient
    const grd = g.createLinearGradient(0, 0, 0, FLOOR_TOP);
    grd.addColorStop(0, "#1a2a3a");
    grd.addColorStop(1, "#2a3a2a");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, FLOOR_TOP);

    // brick wall
    g.fillStyle = "#3a3a4a";
    for (let y = 40; y < FLOOR_TOP; y += 26) {
      for (let x = (y % 52 === 0 ? 0 : -26); x < W; x += 52) {
        g.fillStyle = (Math.floor(x + y) % 3 === 0) ? "#34344a" : "#3e3e52";
        g.fillRect(x + 2, y + 2, 48, 22);
      }
    }

    // sewer pipes
    g.fillStyle = "#586";
    g.fillRect(0, 120, W, 14);
    g.fillStyle = "#475";
    g.fillRect(0, 122, W, 4);
    for (let x = 60; x < W; x += 160) {
      g.fillStyle = "#697";
      g.beginPath(); g.arc(x, 127, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#243";
      g.beginPath(); g.arc(x, 127, 5, 0, Math.PI * 2); g.fill();
    }

    // floor
    const fg = g.createLinearGradient(0, FLOOR_TOP, 0, H);
    fg.addColorStop(0, "#2b2b30");
    fg.addColorStop(1, "#17171b");
    g.fillStyle = fg;
    g.fillRect(0, FLOOR_TOP, W, H - FLOOR_TOP);

    // floor grid lines for depth
    g.strokeStyle = "rgba(120,160,120,0.12)";
    g.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * W;
      g.beginPath();
      g.moveTo(x, FLOOR_TOP);
      g.lineTo(W / 2 + (x - W / 2) * 2.4, H);
      g.stroke();
    }
    for (let j = 0; j < 5; j++) {
      const y = FLOOR_TOP + (j / 4) * (H - FLOOR_TOP);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
  }

  /* ---------------------------------------------------------------------
     Game state machine
     --------------------------------------------------------------------- */
  const STATE = { MENU: 0, PLAY: 1, OVER: 2 };
  const game = {
    state: STATE.MENU,
    player: null,
    enemies: [],
    wave: 1,
    score: 0,
    lives: 3,
    spawnQueue: 0,
    spawnTimer: 0,
    selected: null,
    waveBanner: 0,
    shake: 0,
  };

  function startWave(n) {
    game.wave = n;
    game.spawnQueue = 3 + n * 2;          // enemies this wave
    game.spawnTimer = 0;
    game.waveBanner = 110;
    document.getElementById("wave").textContent = "WAVE " + n;
  }

  function spawnEnemy() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side === -1 ? -20 : W + 20;
    const y = FLOOR_TOP + Math.random() * (FLOOR_BOT - FLOOR_TOP);
    game.enemies.push(new Foot(x, y, game.wave));
  }

  function beginGame(type) {
    game.player = new Player(type);
    game.enemies = [];
    particles.length = 0;
    game.score = 0;
    game.lives = 3;
    game.state = STATE.PLAY;
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("hud").classList.remove("hidden");
    updatePortrait(type);
    startWave(1);
  }

  function playerDown() {
    game.lives--;
    if (game.lives <= 0) {
      endGame(false);
    } else {
      // revive
      game.player.health = game.player.cfg.maxHealth;
      game.player.hitTimer = 80;
      game.player.x = 150; game.player.y = 420;
      game.player.flash = 80;
    }
  }

  function endGame(won) {
    game.state = STATE.OVER;
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("go-title").textContent = won ? "YOU SAVED THE CITY!" : "GAME OVER";
    document.getElementById("go-score").textContent =
      "Final Score: " + game.score + "   •   Reached Wave " + game.wave;
    document.getElementById("gameover").classList.remove("hidden");
  }

  /* ---------------------------------------------------------------------
     Core update
     --------------------------------------------------------------------- */
  function update() {
    if (game.state !== STATE.PLAY) return;
    const p = game.player;
    p.update();

    // spawning
    if (game.spawnQueue > 0) {
      game.spawnTimer--;
      if (game.spawnTimer <= 0 && game.enemies.length < 6) {
        spawnEnemy();
        game.spawnQueue--;
        game.spawnTimer = 50 - Math.min(30, game.wave * 4);
      }
    }

    // wave cleared?
    if (game.spawnQueue === 0 && game.enemies.length === 0) {
      if (game.wave >= 8) { endGame(true); return; }
      startWave(game.wave + 1);
      // small heal between waves
      p.health = Math.min(p.cfg.maxHealth, p.health + 20);
    }

    if (game.waveBanner > 0) game.waveBanner--;

    // enemies
    const hb = p.hitbox();
    for (const e of game.enemies) {
      e.update(p);
      if (hb && !e.dead) {
        const overlap =
          hb.x < e.x + e.w / 2 && hb.x + hb.w > e.x - e.w / 2 &&
          hb.y < e.y + e.h / 2 && hb.y + hb.h > e.y - e.h / 2;
        const canHit = hb.special || !p.didHit;
        if (overlap && canHit) {
          e.takeDamage(hb.dmg, p.facing);
          if (!hb.special) p.didHit = true;
          spawnHit(e.x, e.y - 50, "-" + Math.round(hb.dmg), hb.special ? "#6cf" : "#fff");
          game.shake = 4;
          if (!hb.special) p.special = Math.min(100, p.special + 6);
          if (e.dead) {
            game.score += e.value;
            spawnHit(e.x, e.y - 60, "+" + e.value, "#ffd23f");
            p.special = Math.min(100, p.special + 10);
          }
        }
      }
    }
    game.enemies = game.enemies.filter((e) => !e.dead);

    if (p.health <= 0) playerDown();

    if (game.shake > 0) game.shake--;
    updateParticles();
    updateHUD();
  }

  function updateHUD() {
    const p = game.player;
    document.getElementById("health-fill").style.width =
      Math.max(0, (p.health / p.cfg.maxHealth) * 100) + "%";
    document.getElementById("special-fill").style.width = p.special + "%";
    document.getElementById("score").textContent = "SCORE " + game.score;
    document.getElementById("lives").textContent = "🐢 x " + game.lives;
  }

  /* ---------------------------------------------------------------------
     Render
     --------------------------------------------------------------------- */
  function render() {
    ctx.save();
    if (game.shake > 0) {
      ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    }

    drawBackground(ctx);

    if (game.state === STATE.PLAY) {
      // draw entities sorted by y (depth)
      const ents = [...game.enemies, game.player].sort((a, b) => a.y - b.y);
      for (const e of ents) e.draw(ctx);
      drawParticles(ctx);

      // wave banner
      if (game.waveBanner > 0) {
        ctx.globalAlpha = Math.min(1, game.waveBanner / 30);
        ctx.fillStyle = "#ffd23f";
        ctx.font = "bold 52px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText("WAVE " + game.wave, W / 2, H / 2 - 20);
        ctx.font = "bold 20px Trebuchet MS";
        ctx.fillStyle = "#fff";
        ctx.fillText(game.wave >= 8 ? "FINAL WAVE — SHREDDER'S ELITE!" : "Incoming Foot Clan!", W / 2, H / 2 + 14);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------------
     Menu / character select wiring
     --------------------------------------------------------------------- */
  function buildRoster() {
    const roster = document.getElementById("roster");
    Object.keys(TURTLES).forEach((key) => {
      const t = TURTLES[key];
      const card = document.createElement("div");
      card.className = "turtle-card";
      card.dataset.key = key;

      const c = document.createElement("canvas");
      c.width = 90; c.height = 90;
      const g = c.getContext("2d");
      g.translate(45, 48);
      drawTurtle(g, t.color, 0, 1.5);

      card.appendChild(c);
      const stars = "★".repeat(Math.round(t.power / 3)) + "☆".repeat(5 - Math.round(t.power / 3));
      card.insertAdjacentHTML("beforeend",
        `<div class="tname" style="color:${t.color}">${t.name.split(" ")[0]}</div>
         <div class="tweap">${t.weap}</div>
         <div class="tstat">${t.desc}<br/>PWR ${t.power} · RNG ${t.range}</div>`);

      card.addEventListener("click", () => {
        document.querySelectorAll(".turtle-card").forEach((x) => x.classList.remove("selected"));
        card.classList.add("selected");
        game.selected = key;
        const btn = document.getElementById("start-btn");
        btn.disabled = false;
        btn.textContent = "FIGHT AS " + t.name.split(" ")[0];
      });

      roster.appendChild(card);
    });
  }

  function updatePortrait(type) {
    const t = TURTLES[type];
    const el = document.getElementById("portrait");
    const c = document.createElement("canvas");
    c.width = 46; c.height = 46;
    const g = c.getContext("2d");
    g.translate(23, 30);
    drawTurtle(g, t.color, 0, 0.85);
    el.style.background = "#1d3d1d";
    el.innerHTML = "";
    el.appendChild(c);
  }

  document.getElementById("start-btn").addEventListener("click", () => {
    if (game.selected) beginGame(game.selected);
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
  });

  buildRoster();
  loop();
})();
