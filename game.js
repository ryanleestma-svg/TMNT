/* =========================================================================
   TEENAGE MUTANT NINJA TURTLES — SEWER SHOWDOWN
   A 90s-style side-scrolling beat-'em-up homage (Turtles in Time / Arcade).
   Pure canvas + Web Audio. No external assets.

   Signature mechanics modeled after the classics:
     • Side-scrolling stages with "STOP" enemy gates (clear to advance)
     • Grab a Foot Soldier by walking into it, then THROW it as a projectile
     • Jump kicks, running slide, 3-hit ground combo with a knockdown finisher
     • Special spin attack that hits everything but costs a sliver of health
     • Pizza pickups restore health
     • End-of-stage bosses (Bebop, Rocksteady, Shredder) with their own bar
   ========================================================================= */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;      // 900
  const H = canvas.height;     // 540
  const FLOOR_TOP = 330;       // near edge of walkable depth band
  const FLOOR_BOT = 505;       // far edge

  /* =======================================================================
     AUDIO — tiny Web Audio synth, created on first user gesture.
     ======================================================================= */
  const Sound = (() => {
    let ac = null, master = null;
    let noiseBuf = null;
    let enabled = true;
    function init() {
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.35;
      master.connect(ac.destination);
      // build a short noise buffer for percussive hits
      const n = ac.sampleRate * 0.4;
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    function tone(freq, dur, type, vol, slideTo) {
      if (!ac || !enabled) return;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, vol, hp) {
      if (!ac || !enabled) return;
      const s = ac.createBufferSource();
      s.buffer = noiseBuf;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol || 0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      const f = ac.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = hp || 800;
      s.connect(f); f.connect(g); g.connect(master);
      s.start(); s.stop(ac.currentTime + dur);
    }
    return {
      init,
      setEnabled(v) { enabled = v; },
      punch() { noise(0.06, 0.25, 1200); tone(220, 0.05, "square", 0.12); },
      hit()   { noise(0.09, 0.35, 600); tone(160, 0.08, "square", 0.18, 90); },
      whiff() { noise(0.05, 0.08, 2000); },
      jump()  { tone(300, 0.14, "square", 0.18, 620); },
      land()  { noise(0.05, 0.12, 400); },
      grab()  { tone(420, 0.05, "square", 0.15); },
      thrw()  { tone(500, 0.18, "sawtooth", 0.2, 120); noise(0.1, 0.15, 500); },
      special(){ tone(660, 0.28, "sawtooth", 0.22, 1320); noise(0.2, 0.2, 800); },
      pizza() { tone(523, 0.1, "square", 0.22); setTimeout(() => tone(784, 0.16, "square", 0.22), 90); },
      bossHit(){ noise(0.12, 0.4, 400); tone(110, 0.12, "square", 0.25, 70); },
      hurt()  { tone(200, 0.2, "sawtooth", 0.25, 80); },
      die()   { tone(300, 0.6, "sawtooth", 0.3, 60); },
      clear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, "square", 0.22), i * 130)); },
      bossWarn(){ tone(140, 0.5, "sawtooth", 0.28, 110); },
    };
  })();

  /* =======================================================================
     TURTLE ROSTER
     ======================================================================= */
  const TURTLES = {
    leo:  { name: "LEONARDO",    short: "LEO",  weap: "Katana",   color: "#1f6fff", speed: 3.0, power: 10, range: 60, maxHealth: 100, desc: "Balanced leader",  special: "Twin Slash" },
    raph: { name: "RAPHAEL",     short: "RAPH", weap: "Sai",      color: "#d11f2f", speed: 3.1, power: 13, range: 50, maxHealth: 112, desc: "Hard hitter",      special: "Rage Spin" },
    don:  { name: "DONATELLO",   short: "DON",  weap: "Bo Staff", color: "#7a3fd1", speed: 2.7, power: 9,  range: 82, maxHealth: 96,  desc: "Long reach",       special: "Sweep Quake" },
    mike: { name: "MICHELANGELO",short: "MIKE", weap: "Nunchaku", color: "#ff8a1f", speed: 3.4, power: 9,  range: 54, maxHealth: 100, desc: "Fast & wild",      special: "Cowabunga Combo" },
  };

  /* =======================================================================
     INPUT  (with double-tap-to-run detection)
     ======================================================================= */
  const keys = {};
  const pressed = {};
  const tapTime = {};      // last keydown time per key (for double-tap)
  let runDir = 0;          // -1, 0, 1 while running
  let runKey = "";

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!keys[k]) {
      pressed[k] = true;
      // double-tap detection for horizontal run
      const now = performance.now();
      const left = (k === "arrowleft" || k === "a");
      const right = (k === "arrowright" || k === "d");
      if (left || right) {
        const id = left ? "L" : "R";
        if (tapTime[id] && now - tapTime[id] < 260) { runDir = left ? -1 : 1; runKey = k; }
        tapTime[id] = now;
      }
    }
    keys[k] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === runKey) { runDir = 0; runKey = ""; }
  });
  function consume(k) { if (pressed[k]) { pressed[k] = false; return true; } return false; }
  function attackPressed() { return consume("j") || consume(" "); }

  /* =======================================================================
     CAMERA
     ======================================================================= */
  const camera = { x: 0, limit: 0 };
  function toScreenX(x) { return x - camera.x; }

  /* =======================================================================
     SPRITES — everything drawn with primitives, centered at (0,0).
     ======================================================================= */
  function drawShadow(g, rx) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(0, 36, rx, rx * 0.32, 0, 0, Math.PI * 2); g.fill();
  }

  function drawTurtle(g, color, frame, scale, pose) {
    scale = scale || 1; pose = pose || "idle";
    g.save();
    g.scale(scale, scale);
    const walk = pose === "walk";
    const bob = walk ? Math.sin(frame * 0.3) * 1.6 : Math.sin(frame * 0.12) * 0.8;
    const stride = walk ? Math.sin(frame * 0.3) * 4 : 0;

    drawShadow(g, 20);

    // legs (stride)
    g.fillStyle = "#2e7d32";
    g.fillRect(-11 - stride * 0.3, 18, 8, 16);
    g.fillRect(3 + stride * 0.3, 18, 8, 16);
    g.fillStyle = "#163417";
    g.fillRect(-13 - stride * 0.3, 32, 12, 4);
    g.fillRect(1 + stride * 0.3, 32, 12, 4);

    // shell
    g.fillStyle = "#6b3e16";
    g.beginPath(); g.ellipse(0, 4 + bob, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#8a5320";
    g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5a3212"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-9, -6 + bob); g.lineTo(9, -6 + bob);
    g.moveTo(-11, 4 + bob); g.lineTo(11, 4 + bob);
    g.moveTo(-9, 14 + bob); g.lineTo(9, 14 + bob); g.stroke();

    // body / plastron
    g.fillStyle = "#43a047";
    g.beginPath(); g.ellipse(0, 6 + bob, 14, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#cfe9b0";
    g.beginPath(); g.ellipse(0, 8 + bob, 9, 13, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#a9c98a"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-7, 4 + bob); g.lineTo(7, 4 + bob);
    g.moveTo(-8, 10 + bob); g.lineTo(8, 10 + bob); g.stroke();

    // arms — pose dependent
    g.fillStyle = "#43a047";
    if (pose === "attack") {
      g.fillRect(8, -4 + bob, 22, 7);   // extended punch arm
      g.fillRect(-17, 2 + bob, 7, 14);
    } else if (pose === "grab") {
      g.fillRect(12, -2 + bob, 16, 7);
      g.fillRect(12, 8 + bob, 16, 7);
    } else {
      g.fillRect(-17, 2 + bob, 7, 16);
      g.fillRect(10, 2 + bob, 7, 16);
    }

    // head
    g.fillStyle = "#4caf50";
    g.beginPath(); g.ellipse(0, -16 + bob, 12, 11, 0, 0, Math.PI * 2); g.fill();
    // bandana
    g.fillStyle = color;
    g.fillRect(-12, -20 + bob, 24, 7);
    g.beginPath();
    g.moveTo(11, -19 + bob); g.lineTo(26, -23 + bob); g.lineTo(24, -14 + bob);
    g.lineTo(11, -13 + bob); g.closePath(); g.fill();
    // eyes
    g.fillStyle = "#fff";
    g.fillRect(-7, -18 + bob, 5, 4);
    g.fillRect(3, -18 + bob, 5, 4);
    g.fillStyle = "#000";
    g.fillRect(-5, -17 + bob, 2, 2);
    g.fillRect(5, -17 + bob, 2, 2);

    g.restore();
  }

  const FOOT_COLORS = {
    purple: { suit: "#5b2a86", trim: "#caa6f0", eye: "#ff5cf0" },
    red:    { suit: "#7a1d1d", trim: "#f0a6a6", eye: "#ff6a6a" },
    blue:   { suit: "#1d3a7a", trim: "#a6c4f0", eye: "#6ab0ff" },
  };

  function drawFoot(g, frame, scale, kind, grabbed) {
    scale = scale || 1;
    const c = FOOT_COLORS[kind] || FOOT_COLORS.purple;
    g.save();
    g.scale(scale, scale);
    const bob = grabbed ? 0 : Math.sin(frame * 0.25) * 1.5;
    const stride = grabbed ? 0 : Math.sin(frame * 0.25) * 3;

    drawShadow(g, 15);

    g.fillStyle = c.suit;
    g.fillRect(-9 - stride * 0.3, 16, 7, 18);
    g.fillRect(2 + stride * 0.3, 16, 7, 18);

    g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.trim;
    g.fillRect(-12, 6 + bob, 24, 4);

    g.fillStyle = c.suit;
    if (grabbed) { g.fillRect(-16, -4 + bob, 6, 18); g.fillRect(10, -4 + bob, 6, 18); }
    else { g.fillRect(-15, 0 + bob, 6, 15); g.fillRect(9, 0 + bob, 6, 15); }

    g.beginPath(); g.ellipse(0, -14 + bob, 10, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.trim;
    g.fillRect(-10, -16 + bob, 20, 6);
    g.fillStyle = c.eye;
    g.fillRect(-6, -15 + bob, 4, 3);
    g.fillRect(2, -15 + bob, 4, 3);
    g.fillStyle = c.suit;
    g.beginPath();
    g.moveTo(-9, -16 + bob); g.lineTo(-22, -21 + bob); g.lineTo(-19, -11 + bob);
    g.closePath(); g.fill();

    g.restore();
  }

  function drawPizza(g, frame) {
    g.save();
    const bob = Math.sin(frame * 0.1) * 3;
    g.translate(0, bob);
    drawShadow(g, 14);
    // box
    g.fillStyle = "#d9c089";
    g.fillRect(-15, -12, 30, 22);
    g.fillStyle = "#b89a5a";
    g.fillRect(-15, -12, 30, 5);
    // a slice on top
    g.fillStyle = "#e8b84a";
    g.beginPath(); g.moveTo(0, -10); g.lineTo(-11, 6); g.lineTo(11, 6); g.closePath(); g.fill();
    g.fillStyle = "#c0392b";
    g.beginPath(); g.arc(-4, 0, 2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(4, 1, 2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, 4, 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  /* ---- Bosses ---- */
  function drawBebop(g, frame, hurt) {
    g.save();
    const bob = Math.sin(frame * 0.18) * 2;
    drawShadow(g, 30);
    const skin = hurt ? "#ffffff" : "#6d5a8a";
    // legs
    g.fillStyle = "#2a2a2a";
    g.fillRect(-16, 22, 12, 22); g.fillRect(4, 22, 12, 22);
    // torso (big)
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(0, 6 + bob, 26, 28, 0, 0, Math.PI * 2); g.fill();
    // vest
    g.fillStyle = "#1a1a2a";
    g.fillRect(-22, -2 + bob, 12, 30); g.fillRect(10, -2 + bob, 12, 30);
    // arms
    g.fillStyle = skin;
    g.fillRect(-32, 0 + bob, 12, 24); g.fillRect(20, 0 + bob, 12, 24);
    // head
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(0, -22 + bob, 16, 14, 0, 0, Math.PI * 2); g.fill();
    // snout/tusks
    g.fillStyle = "#7d6a9a";
    g.fillRect(-6, -18 + bob, 12, 8);
    g.fillStyle = "#fff";
    g.fillRect(-7, -12 + bob, 3, 6); g.fillRect(4, -12 + bob, 3, 6);
    // mohawk (magenta)
    g.fillStyle = "#ff2db5";
    for (let i = -10; i <= 10; i += 5) { g.beginPath(); g.moveTo(i, -34 + bob); g.lineTo(i + 2, -46 + bob); g.lineTo(i + 5, -34 + bob); g.closePath(); g.fill(); }
    // sunglasses
    g.fillStyle = "#111";
    g.fillRect(-12, -26 + bob, 24, 5);
    g.restore();
  }

  function drawRocksteady(g, frame, hurt) {
    g.save();
    const bob = Math.sin(frame * 0.16) * 2;
    drawShadow(g, 32);
    const skin = hurt ? "#ffffff" : "#8a8a6a";
    g.fillStyle = "#3a3322";
    g.fillRect(-17, 22, 13, 24); g.fillRect(4, 22, 13, 24);
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(0, 6 + bob, 28, 30, 0, 0, Math.PI * 2); g.fill();
    // ammo belt
    g.fillStyle = "#caa72a";
    g.fillRect(-26, 0 + bob, 52, 6);
    g.fillStyle = skin;
    g.fillRect(-36, 0 + bob, 13, 26); g.fillRect(23, 0 + bob, 13, 26);
    // head
    g.beginPath(); g.ellipse(0, -22 + bob, 17, 15, 0, 0, Math.PI * 2); g.fill();
    // horn
    g.fillStyle = "#e8e0c0";
    g.beginPath(); g.moveTo(-4, -30 + bob); g.lineTo(0, -44 + bob); g.lineTo(4, -30 + bob); g.closePath(); g.fill();
    // helmet
    g.fillStyle = "#3a5a2a";
    g.fillRect(-16, -34 + bob, 32, 7);
    // eyes
    g.fillStyle = "#c00";
    g.fillRect(-9, -24 + bob, 5, 4); g.fillRect(4, -24 + bob, 5, 4);
    g.restore();
  }

  function drawShredder(g, frame, hurt) {
    g.save();
    const bob = Math.sin(frame * 0.2) * 1.5;
    drawShadow(g, 26);
    const metal = hurt ? "#ffffff" : "#c0c4cc";
    // cape
    g.fillStyle = "#5a1a6a";
    g.beginPath(); g.moveTo(-22, -20 + bob); g.lineTo(-30, 36); g.lineTo(30, 36); g.lineTo(22, -20 + bob); g.closePath(); g.fill();
    // legs
    g.fillStyle = "#2a2a3a";
    g.fillRect(-12, 20, 9, 20); g.fillRect(3, 20, 9, 20);
    // body
    g.fillStyle = metal;
    g.beginPath(); g.ellipse(0, 4 + bob, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#9aa0aa";
    g.beginPath(); g.ellipse(0, 6 + bob, 11, 15, 0, 0, Math.PI * 2); g.fill();
    // bladed arms
    g.fillStyle = metal;
    g.fillRect(-26, -2 + bob, 9, 20); g.fillRect(17, -2 + bob, 9, 20);
    g.fillStyle = "#eef";
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(-26 + i * 3, 18 + bob); g.lineTo(-25 + i * 3, 30 + bob); g.lineTo(-23 + i * 3, 18 + bob); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(17 + i * 3, 18 + bob); g.lineTo(18 + i * 3, 30 + bob); g.lineTo(20 + i * 3, 18 + bob); g.closePath(); g.fill();
    }
    // helmet
    g.fillStyle = metal;
    g.beginPath(); g.ellipse(0, -18 + bob, 13, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e8ecf2";
    g.beginPath(); g.moveTo(-13, -22 + bob); g.lineTo(-18, -34 + bob); g.lineTo(-9, -24 + bob); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(13, -22 + bob); g.lineTo(18, -34 + bob); g.lineTo(9, -24 + bob); g.closePath(); g.fill();
    // mask
    g.fillStyle = "#3a2a1a";
    g.fillRect(-9, -16 + bob, 18, 8);
    g.fillStyle = "#ff3030";
    g.fillRect(-7, -15 + bob, 5, 4); g.fillRect(3, -15 + bob, 5, 4);
    g.restore();
  }

  const BOSS_DRAW = { bebop: drawBebop, rocksteady: drawRocksteady, shredder: drawShredder };

  /* =======================================================================
     PARTICLES / FLOATING TEXT
     ======================================================================= */
  const fx = [];
  function popText(x, y, txt, color) { fx.push({ x, y, vy: -1.4, life: 42, txt, color: color || "#fff" }); }
  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 8); i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 24, dot: true, color });
    }
  }
  function updateFx() {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.x += p.vx || 0; p.y += p.vy; if (p.dot) p.vy += 0.18; p.life--;
      if (p.life <= 0) fx.splice(i, 1);
    }
  }
  function drawFx(g) {
    for (const p of fx) {
      g.globalAlpha = Math.min(1, p.life / 18);
      if (p.dot) { g.fillStyle = p.color; g.fillRect(toScreenX(p.x) - 2, p.y - 2, 4, 4); }
      else {
        g.fillStyle = p.color; g.textAlign = "center"; g.font = "bold 18px Trebuchet MS";
        g.fillText(p.txt, toScreenX(p.x), p.y);
      }
    }
    g.globalAlpha = 1;
  }

  /* =======================================================================
     PLAYER
     ======================================================================= */
  class Player {
    constructor(type) {
      const t = TURTLES[type];
      this.type = type; this.cfg = t;
      this.x = 120; this.y = 430;
      this.z = 0; this.vz = 0;
      this.facing = 1;
      this.health = t.maxHealth;
      this.special = 0;
      this.frame = 0;
      this.attackTimer = 0; this.attackCooldown = 0; this.combo = 0; this.comboTimer = 0;
      this.didHit = false;
      this.hitTimer = 0; this.flash = 0;
      this.jumpKick = false;
      this.spinTimer = 0;
      this.grabbed = null;      // held enemy
      this.grabTimer = 0;       // auto-knee tick
      this.pose = "idle";
    }

    update() {
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;
      if (this.hitTimer > 0) this.hitTimer--;
      if (this.flash > 0) this.flash--;
      if (this.spinTimer > 0) this.spinTimer--;
      if (this.comboTimer > 0) this.comboTimer--; else this.combo = 0;

      const grounded = this.z === 0;
      let mx = 0, my = 0;
      if (keys["arrowleft"] || keys["a"]) mx -= 1;
      if (keys["arrowright"] || keys["d"]) mx += 1;
      if (keys["arrowup"] || keys["w"]) my -= 1;
      if (keys["arrowdown"] || keys["s"]) my += 1;

      // ---- holding an enemy ----
      if (this.grabbed) {
        if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
        // position the held foot in front of us
        const e = this.grabbed;
        e.x = this.x + this.facing * 26; e.y = this.y;
        this.grabTimer--;
        if (this.grabTimer <= 0) { // periodic knee/headbutt damage
          e.takeDamage(6, this.facing, true);
          popText(e.x, e.y - 54, "-6", "#fff");
          Sound.punch();
          this.grabTimer = 28;
          if (e.dead) this.releaseGrab(false);
        }
        if (attackPressed()) this.throwGrabbed();
        this.pose = "grab";
        this.frame += 0.2;
        return;
      }

      // ---- movement ----
      const running = runDir !== 0 && (keys[runKey]) && this.attackTimer === 0;
      let sp = this.cfg.speed * (this.attackTimer > 0 ? 0.15 : 1);
      if (running && grounded) sp *= 1.7;
      this.x += mx * sp;
      this.y += my * (sp * 0.8);
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
      this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));
      this.x = Math.max(camera.x + 24, Math.min(camera.x + W - 24, this.x));

      // ---- jump ----
      if (consume("k") && grounded && this.attackTimer === 0) { this.vz = 9.2; Sound.jump(); }
      if (this.z > 0 || this.vz !== 0) {
        this.z += this.vz; this.vz -= 0.6;
        if (this.z <= 0) { this.z = 0; this.vz = 0; this.jumpKick = false; Sound.land(); }
      }

      // ---- attack ----
      if (attackPressed() && this.attackCooldown === 0 && this.spinTimer === 0) {
        if (!grounded) { this.jumpKick = true; this.attackTimer = 14; this.attackCooldown = 16; this.didHit = false; Sound.whiff(); }
        else if (running) { this.attackTimer = 16; this.attackCooldown = 22; this.combo = 0; this.didHit = false; this.slide = 10; Sound.whiff(); }
        else {
          this.attackTimer = 12; this.attackCooldown = 16;
          this.combo = (this.comboTimer > 0) ? Math.min(this.combo + 1, 3) : 1;
          this.comboTimer = 42; this.didHit = false; Sound.whiff();
        }
      }
      if (this.slide > 0) { this.x += this.facing * this.slide; this.slide--; }

      // ---- special spin ----
      if (consume("l") && this.spinTimer === 0 && this.health > 12) {
        this.spinTimer = 36; this.health -= 8; this.flash = 8; Sound.special();
        burst(this.x, this.y - 20, this.cfg.color, 16);
      }

      // pose for rendering
      if (this.spinTimer > 0) this.pose = "attack";
      else if (this.attackTimer > 0) this.pose = "attack";
      else if (mx !== 0 || my !== 0) this.pose = "walk";
      else this.pose = "idle";
      this.frame += (this.pose === "walk") ? (running ? 1.5 : 1) : 0.4;
    }

    startGrab(e) {
      this.grabbed = e; e.grabbedBy = this; e.state = "grabbed";
      this.grabTimer = 24; Sound.grab();
    }
    releaseGrab(thrown) {
      if (!this.grabbed) return;
      const e = this.grabbed;
      e.grabbedBy = null;
      if (!thrown) e.state = "active";
      this.grabbed = null;
    }
    throwGrabbed() {
      const e = this.grabbed;
      e.becomeThrown(this.facing);
      Sound.thrw();
      popText(e.x, e.y - 54, "THROW!", "#ffd23f");
      this.grabbed = null;
    }

    // melee hitbox in world coords, or null
    hitbox() {
      if (this.spinTimer > 0 && this.spinTimer % 6 === 0)
        return { x: this.x - 70, y: this.y - 30, w: 140, h: 80, dmg: this.cfg.power * 1.4, spin: true };
      if (this.attackTimer === 0) return null;
      if (this.jumpKick) {
        if (this.attackTimer > 9) return null;
        return { x: this.facing === 1 ? this.x : this.x - 56, y: this.y - 40, w: 56, h: 70, dmg: this.cfg.power * 1.3, kick: true };
      }
      if (this.attackTimer > 8) return null;     // active frames only
      const r = this.cfg.range + (this.slide > 0 ? 20 : 0);
      const x = this.facing === 1 ? this.x : this.x - r;
      const dmg = this.cfg.power * (1 + this.combo * 0.22);
      return { x, y: this.y - 24, w: r, h: 60, dmg, finisher: this.combo >= 3 };
    }

    takeDamage(d) {
      if (this.hitTimer > 0 || this.spinTimer > 0) return;
      if (this.grabbed) this.releaseGrab(false);
      this.health -= d; this.hitTimer = 44; this.flash = 14; Sound.hurt();
      popText(this.x, this.y - 70, "-" + d, "#ff7070");
    }

    draw(g) {
      g.save();
      g.translate(toScreenX(this.x), this.y - this.z);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.flash > 0 && Math.floor(this.flash / 2) % 2 === 0) g.globalAlpha = 0.4;

      if (this.spinTimer > 0) {
        g.save(); g.globalAlpha = 0.4; g.fillStyle = this.cfg.color;
        g.beginPath(); g.ellipse(0, 0, 64, 44, 0, 0, Math.PI * 2); g.fill(); g.restore();
        g.rotate((36 - this.spinTimer) * 0.5);
      }

      drawTurtle(g, this.cfg.color, this.frame, 1.2, this.pose);

      if (this.attackTimer > 6 && !this.jumpKick && this.spinTimer === 0) {
        g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 4;
        g.beginPath(); g.arc(30, -6, this.cfg.range * 0.7, -1.0, 0.9); g.stroke();
      }
      g.restore();

      if (this.combo > 1 && this.comboTimer > 0) {
        g.fillStyle = "#ffd23f"; g.font = "bold 15px Trebuchet MS"; g.textAlign = "center";
        g.fillText(this.combo + " HIT", toScreenX(this.x), this.y - this.z - 70);
      }
    }
  }

  /* =======================================================================
     FOOT SOLDIER
     ======================================================================= */
  class Foot {
    constructor(x, y, kind, hpBonus) {
      this.x = x; this.y = y; this.w = 38; this.h = 60;
      this.kind = kind || "purple";
      const base = this.kind === "red" ? 40 : this.kind === "blue" ? 26 : 30;
      this.health = base + (hpBonus || 0);
      this.maxHealth = this.health;
      this.speed = (this.kind === "red" ? 1.7 : this.kind === "blue" ? 1.1 : 1.3) + Math.random() * 0.3;
      this.facing = -1;
      this.frame = Math.random() * 10;
      this.attackTimer = 0; this.attackCooldown = 40 + Math.random() * 50;
      this.hitFlash = 0; this.stun = 0;
      this.state = "active";   // active | stunned | grabbed | thrown | knockdown
      this.grabbedBy = null;
      this.vx = 0; this.vy = 0; this.z = 0; this.vz = 0;
      this.dead = false;
      this.shootCd = 60 + Math.random() * 80;
      this.value = this.kind === "red" ? 300 : this.kind === "blue" ? 200 : 150;
    }

    becomeThrown(dir) {
      this.state = "thrown";
      this.vx = dir * 11; this.vz = 7; this.z = 0.1;
      this.facing = -dir; this.stun = 0;
    }

    update(p, enemies) {
      this.frame += 0.5;
      if (this.hitFlash > 0) this.hitFlash--;

      // thrown: arc through the air, bowl over others, then crash
      if (this.state === "thrown") {
        this.x += this.vx; this.vx *= 0.99;
        this.z += this.vz; this.vz -= 0.5;
        for (const o of enemies) {
          if (o === this || o.dead || o.state === "thrown") continue;
          if (Math.abs(o.x - this.x) < 30 && Math.abs(o.y - this.y) < 26 && o.state !== "knockdown") {
            o.takeDamage(14, Math.sign(this.vx) || 1, true); o.knockdown();
            popText(o.x, o.y - 54, "-14", "#9cf"); burst(o.x, o.y - 20, "#caa6f0", 6);
          }
        }
        if (this.z <= 0) { // crash landing
          this.z = 0; this.takeDamage(10, 0, true); Sound.hit();
          burst(this.x, this.y - 10, "#caa6f0", 8);
          if (!this.dead) this.knockdown();
        }
        return;
      }

      // knockdown: lie on the ground, then get up (if alive)
      if (this.state === "knockdown") {
        this.stun--; this.z = Math.max(0, this.z + (this.vz -= 0.5));
        this.x += this.vx; this.vx *= 0.85;
        if (this.stun <= 0) { this.state = "active"; this.z = 0; }
        return;
      }

      if (this.state === "grabbed") { this.frame += 0.3; return; }

      if (this.stun > 0) { this.stun--; this.state = "stunned"; if (this.stun === 0) this.state = "active"; return; }

      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;

      const dx = p.x - this.x, dy = p.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx > 0 ? 1 : -1;

      // blue soldiers throw shuriken from range
      if (this.kind === "blue") {
        this.shootCd--;
        const wantDist = 150;
        if (dist > wantDist + 30) { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; }
        else if (dist < wantDist - 30) { this.x -= (dx / dist) * this.speed; }
        else if (this.shootCd <= 0 && Math.abs(dy) < 50) {
          this.shootCd = 110 + Math.random() * 60;
          projectiles.push(new Shuriken(this.x, this.y - 18, this.facing));
        }
        this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));
        return;
      }

      // melee: approach, then strike
      if (dist > 44) {
        this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed;
      } else if (this.attackCooldown === 0) {
        this.attackTimer = 18; this.attackCooldown = 70 + Math.random() * 50; this._pending = true;
      }
      if (this.attackTimer === 9 && this._pending) {
        if (Math.abs(p.x - this.x) < 48 && Math.abs(p.y - this.y) < 38)
          p.takeDamage(this.kind === "red" ? 12 : 8);
        this._pending = false;
      }
      this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));
    }

    knockdown() {
      this.state = "knockdown"; this.stun = 50; this.vz = 5; this.z = 0.1;
      this.vx = this.facing * -3;
    }

    takeDamage(d, dir, noKnock) {
      this.health -= d; this.hitFlash = 8;
      if (this.health <= 0) {
        this.dead = true; this.value && (lastKillValue = this.value);
        burst(this.x, this.y - 20, "#fff", 10); Sound.hit();
        return;
      }
      if (!noKnock) { this.stun = 22; this.state = "stunned"; this.x += dir * 6; }
      Sound.hit();
    }

    grabbable() { return (this.state === "stunned" || this.stun > 0) && this.kind !== "blue"; }

    draw(g) {
      g.save();
      g.translate(toScreenX(this.x), this.y - this.z);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.state === "knockdown") g.rotate(Math.PI / 2 * (1 - this.stun / 50) * 0.9);
      if (this.hitFlash > 0) { drawFootFlash(g, this.frame, 1.05, this.kind); }
      else drawFoot(g, this.frame, 1.05, this.kind, this.state === "grabbed");
      g.restore();

      if (this.health < this.maxHealth && this.state !== "knockdown" && this.state !== "thrown") {
        const w = 32, sx = toScreenX(this.x);
        g.fillStyle = "#000"; g.fillRect(sx - w / 2 - 1, this.y - 54, w + 2, 5);
        g.fillStyle = this.kind === "red" ? "#f55" : this.kind === "blue" ? "#5af" : "#c9f";
        g.fillRect(sx - w / 2, this.y - 53, w * Math.max(0, this.health / this.maxHealth), 3);
      }
    }
  }
  let lastKillValue = 0;

  function drawFootFlash(g, frame, scale, kind) {
    drawFoot(g, frame, scale, kind, false);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(-30, -42, 60, 92);
    g.globalCompositeOperation = "source-over";
  }

  /* =======================================================================
     PROJECTILES (foot shuriken)
     ======================================================================= */
  const projectiles = [];
  class Shuriken {
    constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.spin = 0; this.dead = false; }
    update(p) {
      this.x += this.dir * 5.2; this.spin += 0.5;
      if (Math.abs(p.x - this.x) < 26 && Math.abs((p.y - p.z) - this.y) < 30) { p.takeDamage(7); this.dead = true; }
      if (toScreenX(this.x) < -40 || toScreenX(this.x) > W + 40) this.dead = true;
    }
    draw(g) {
      g.save(); g.translate(toScreenX(this.x), this.y); g.rotate(this.spin);
      g.fillStyle = "#cfd8e0";
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(8, -3); g.lineTo(11, 0); g.lineTo(8, 3); g.closePath(); g.fill(); }
      g.restore();
    }
  }

  /* =======================================================================
     PIZZA PICKUP
     ======================================================================= */
  const pickups = [];
  class Pizza {
    constructor(x, y) { this.x = x; this.y = y; this.frame = 0; this.dead = false; this.life = 600; }
    update(p) {
      this.frame++; this.life--;
      if (this.life <= 0) this.dead = true;
      if (Math.abs(p.x - this.x) < 34 && Math.abs(p.y - this.y) < 30) {
        const heal = Math.min(40, p.cfg.maxHealth - p.health);
        p.health = Math.min(p.cfg.maxHealth, p.health + 40);
        this.dead = true; Sound.pizza();
        popText(this.x, this.y - 30, heal > 0 ? "+" + heal + " PIZZA POWER!" : "COWABUNGA!", "#7CFC00");
      }
    }
    draw(g) { g.save(); g.translate(toScreenX(this.x), this.y); drawPizza(g, this.frame); g.restore(); }
  }

  /* =======================================================================
     BOSS
     ======================================================================= */
  class Boss {
    constructor(cfg, x) {
      this.cfg = cfg; this.kind = cfg.kind;
      this.x = x; this.y = 430;
      this.w = 70; this.h = 110;
      this.health = cfg.hp; this.maxHealth = cfg.hp;
      this.facing = -1; this.frame = 0;
      this.state = "intro"; this.timer = 80;
      this.hitFlash = 0; this.dead = false;
      this.vulnerable = true;
      this.value = 2000;
    }
    update(p) {
      this.frame += 0.6;
      if (this.hitFlash > 0) this.hitFlash--;
      this.facing = p.x > this.x ? 1 : -1;
      this.timer--;

      switch (this.state) {
        case "intro":
          if (this.timer <= 0) { this.state = "approach"; this.timer = 50; }
          break;
        case "approach": {
          this.vulnerable = true;
          const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
          if (d > 70) { this.x += (dx / d) * 1.7; this.y += (dy / d) * 1.4; }
          this.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, this.y));
          if (this.timer <= 0) {
            // choose an attack
            if (this.kind === "shredder") this.state = Math.random() < 0.5 ? "teleport" : "windup";
            else this.state = Math.random() < 0.45 ? "windup_dash" : "windup";
            this.timer = 28;
          }
          break;
        }
        case "windup": // melee swipe telegraph
          this.vulnerable = true;
          if (this.timer <= 0) { this.state = "swipe"; this.timer = 16; this._pending = true; }
          break;
        case "swipe":
          if (this.timer === 8 && this._pending) {
            if (Math.abs(p.x - this.x) < 84 && Math.abs(p.y - this.y) < 46 && p.z < 30) p.takeDamage(this.cfg.dmg);
            this._pending = false;
          }
          if (this.timer <= 0) { this.state = "recover"; this.timer = 40; }
          break;
        case "windup_dash":
          this.vulnerable = false;
          if (this.timer <= 0) { this.state = "dash"; this.timer = 26; this.dashV = this.facing * 9; }
          break;
        case "dash":
          this.vulnerable = false;
          this.x += this.dashV;
          if (Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 50 && p.z < 30) { p.takeDamage(this.cfg.dmg + 4); this.dashV *= -0.4; }
          if (this.timer <= 0) { this.state = "recover"; this.timer = 46; }
          break;
        case "teleport": // Shredder vanishes & reappears, then fires a blob
          this.vulnerable = false;
          if (this.timer <= 0) {
            this.x = p.x + (Math.random() < 0.5 ? -140 : 140);
            this.x = Math.max(camera.x + 60, Math.min(camera.x + W - 60, this.x));
            this.y = p.y;
            projectiles.push(new Blob(this.x, this.y - 30, Math.sign(p.x - this.x) || 1, this.cfg.dmg));
            Sound.bossWarn();
            this.state = "recover"; this.timer = 44;
          }
          break;
        case "recover": // vulnerable window (per Shredder behavior in the originals)
          this.vulnerable = true;
          if (this.timer <= 0) { this.state = "approach"; this.timer = 40 + Math.random() * 40; }
          break;
      }
      this.x = Math.max(camera.x + 40, Math.min(camera.x + W - 40, this.x));
    }
    takeDamage(d) {
      const mult = (this.state === "recover") ? 1.6 : 1;
      if (!this.vulnerable && this.state !== "recover") { d *= 0.25; } // resist mid-attack
      this.health -= d * mult; this.hitFlash = 7; Sound.bossHit();
      if (this.health <= 0) { this.dead = true; }
    }
    hurtbox() { return { x: this.x - 34, y: this.y - 80, w: 68, h: 90 }; }
    draw(g) {
      g.save();
      g.translate(toScreenX(this.x), this.y);
      if (this.facing === 1) g.scale(-1, 1);
      const scale = this.kind === "shredder" ? 1.5 : 1.7;
      g.scale(scale, scale);
      if (this.state === "teleport") g.globalAlpha = 0.3 + 0.3 * Math.sin(this.frame);
      const draw = BOSS_DRAW[this.kind];
      draw(g, this.frame, this.hitFlash > 0);
      g.restore();
      if (this.state === "windup" || this.state === "windup_dash") {
        g.fillStyle = "#ff0"; g.font = "bold 22px Trebuchet MS"; g.textAlign = "center";
        if (Math.floor(this.frame) % 2 === 0) g.fillText("!", toScreenX(this.x), this.y - 130);
      }
    }
  }

  class Blob {
    constructor(x, y, dir, dmg) { this.x = x; this.y = y; this.dir = dir; this.dmg = dmg; this.dead = false; this.frame = 0; }
    update(p) {
      this.x += this.dir * 4; this.frame++;
      if (Math.abs(p.x - this.x) < 28 && Math.abs((p.y - p.z) - this.y) < 32) { p.takeDamage(this.dmg); this.dead = true; }
      if (toScreenX(this.x) < -40 || toScreenX(this.x) > W + 40) this.dead = true;
    }
    draw(g) {
      g.save(); g.translate(toScreenX(this.x), this.y);
      g.fillStyle = "#6cff4a";
      const r = 8 + Math.sin(this.frame * 0.4) * 2;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(120,255,90,0.4)"; g.beginPath(); g.arc(-this.dir * 8, 0, r * 0.7, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  /* =======================================================================
     STAGES
     Each encounter: { camX (camera lock), spawns:[{kind,n}], pizza }
     Final encounter is the boss.
     ======================================================================= */
  const STAGES = [
    {
      name: "BIG APPLE, 3 AM", theme: "city",
      length: 2600,
      encounters: [
        { camX: 300,  spawns: [{ kind: "purple", n: 3 }] },
        { camX: 760,  spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 1 }], pizza: true },
        { camX: 1250, spawns: [{ kind: "purple", n: 3 }, { kind: "blue", n: 2 }] },
      ],
      boss: { kind: "bebop", name: "BEBOP", hp: 220, dmg: 12 },
    },
    {
      name: "SEWER SURFIN'", theme: "sewer",
      length: 2600,
      encounters: [
        { camX: 320,  spawns: [{ kind: "purple", n: 2 }, { kind: "blue", n: 2 }] },
        { camX: 800,  spawns: [{ kind: "red", n: 2 }, { kind: "purple", n: 2 }], pizza: true },
        { camX: 1280, spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 1 }, { kind: "blue", n: 1 }] },
      ],
      boss: { kind: "rocksteady", name: "ROCKSTEADY", hp: 280, dmg: 13 },
    },
    {
      name: "TECHNODROME: LET'S KICK SHELL", theme: "techno",
      length: 2800,
      encounters: [
        { camX: 340,  spawns: [{ kind: "red", n: 2 }, { kind: "blue", n: 2 }] },
        { camX: 820,  spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 2 }], pizza: true },
        { camX: 1320, spawns: [{ kind: "red", n: 3 }, { kind: "blue", n: 2 }], pizza: true },
      ],
      boss: { kind: "shredder", name: "SHREDDER", hp: 360, dmg: 14 },
    },
  ];

  /* =======================================================================
     BACKGROUNDS  (parallax, themed per stage)
     ======================================================================= */
  function drawBackground(g, theme) {
    const cx = camera.x;
    if (theme === "city") {
      const sky = g.createLinearGradient(0, 0, 0, FLOOR_TOP);
      sky.addColorStop(0, "#0b1030"); sky.addColorStop(1, "#3a2a5a");
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR_TOP);
      // moon
      g.fillStyle = "#f5f3c0"; g.beginPath(); g.arc(W - 120, 70, 34, 0, Math.PI * 2); g.fill();
      // far buildings (parallax 0.3)
      for (let i = -1; i < 14; i++) {
        const bx = ((i * 150 - cx * 0.3) % (15 * 150) + 15 * 150) % (15 * 150) - 100;
        const bh = 90 + ((i * 53) % 90);
        g.fillStyle = "#1b2240"; g.fillRect(bx, FLOOR_TOP - bh, 120, bh);
        g.fillStyle = "#ffd86b";
        for (let wy = FLOOR_TOP - bh + 12; wy < FLOOR_TOP - 8; wy += 20)
          for (let wx = bx + 10; wx < bx + 105; wx += 22)
            if ((wx + wy + i) % 3 === 0) g.fillRect(wx, wy, 8, 10);
      }
      // near buildings (parallax 0.6)
      for (let i = -1; i < 10; i++) {
        const bx = ((i * 230 - cx * 0.6) % (11 * 230) + 11 * 230) % (11 * 230) - 120;
        const bh = 150 + ((i * 71) % 80);
        g.fillStyle = "#121830"; g.fillRect(bx, FLOOR_TOP - bh, 180, bh);
      }
      drawStreet(g);
    } else if (theme === "sewer") {
      g.fillStyle = "#0c1a14"; g.fillRect(0, 0, W, FLOOR_TOP);
      // big pipe arches (parallax 0.5)
      for (let i = -1; i < 8; i++) {
        const bx = ((i * 320 - cx * 0.5) % (9 * 320) + 9 * 320) % (9 * 320) - 160;
        g.strokeStyle = "#2a4a3a"; g.lineWidth = 20;
        g.beginPath(); g.arc(bx + 130, FLOOR_TOP + 40, 150, Math.PI, Math.PI * 2); g.stroke();
      }
      // pipe band
      g.fillStyle = "#3a5a4a"; g.fillRect(0, 150, W, 16);
      for (let x = 80 - (cx * 0.5 % 200); x < W + 100; x += 200) {
        g.fillStyle = "#4a6a5a"; g.beginPath(); g.arc(x, 158, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#16261c"; g.beginPath(); g.arc(x, 158, 5, 0, Math.PI * 2); g.fill();
      }
      drawFloor(g, "#1f2a22", "#0f1712");
      // green sludge stripe at far edge
      g.fillStyle = "rgba(60,180,80,0.18)"; g.fillRect(0, FLOOR_TOP, W, 12);
    } else { // techno
      const sky = g.createLinearGradient(0, 0, 0, FLOOR_TOP);
      sky.addColorStop(0, "#14001a"); sky.addColorStop(1, "#2a0030");
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR_TOP);
      // circuit lines
      g.strokeStyle = "rgba(255,40,200,0.25)"; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const lx = ((i * 120 - cx * 0.4) % (19 * 120) + 19 * 120) % (19 * 120) - 60;
        g.beginPath(); g.moveTo(lx, 30); g.lineTo(lx, 120); g.lineTo(lx + 40, 160); g.stroke();
        g.fillStyle = "#ff28c8"; g.fillRect(lx + 38, 158, 5, 5);
      }
      // glowing panels
      for (let i = -1; i < 9; i++) {
        const bx = ((i * 260 - cx * 0.6) % (10 * 260) + 10 * 260) % (10 * 260) - 130;
        g.fillStyle = "#220028"; g.fillRect(bx, 80, 200, FLOOR_TOP - 80);
        g.fillStyle = "rgba(0,220,255,0.15)"; g.fillRect(bx + 16, 100, 168, 120);
      }
      drawFloor(g, "#241026", "#120612");
    }
  }
  function drawStreet(g) { drawFloor(g, "#2a2a30", "#141418"); }
  function drawFloor(g, c0, c1) {
    const fg = g.createLinearGradient(0, FLOOR_TOP, 0, H);
    fg.addColorStop(0, c0); fg.addColorStop(1, c1);
    g.fillStyle = fg; g.fillRect(0, FLOOR_TOP, W, H - FLOOR_TOP);
    g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 2;
    const off = camera.x % 80;
    for (let x = -off; x < W; x += 80) {
      g.beginPath(); g.moveTo(x, FLOOR_TOP); g.lineTo(W / 2 + (x - W / 2) * 2.2, H); g.stroke();
    }
    for (let j = 1; j < 4; j++) { const y = FLOOR_TOP + (j / 4) * (H - FLOOR_TOP); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }

  /* =======================================================================
     GAME STATE
     ======================================================================= */
  const STATE = { MENU: 0, PLAY: 1, CLEAR: 2, OVER: 3, WIN: 4 };
  const game = {
    state: STATE.MENU, player: null, selected: null,
    stageIdx: 0, stage: null,
    enemies: [], boss: null,
    encIdx: 0, encActive: false, spawnQueue: [], spawnTimer: 0,
    score: 0, lives: 3,
    banner: 0, bannerText: "", bannerSub: "",
    shake: 0, arrow: 0,
  };

  function loadStage(i) {
    const s = STAGES[i];
    game.stage = s; game.stageIdx = i;
    game.enemies = []; game.boss = null;
    projectiles.length = 0; pickups.length = 0; fx.length = 0;
    game.encIdx = 0; game.encActive = false; game.spawnQueue = [];
    game.player.x = 120; camera.x = 0; camera.limit = s.encounters[0].camX;
    game.banner = 150; game.bannerText = "STAGE " + (i + 1); game.bannerSub = s.name;
    document.getElementById("wave").textContent = s.name;
    document.getElementById("boss-hud").classList.add("hidden");
    Sound.bossWarn();
  }

  function startEncounter(enc) {
    game.encActive = true;
    game.spawnQueue = [];
    for (const sp of enc.spawns) for (let k = 0; k < sp.n; k++) game.spawnQueue.push(sp.kind);
    game.spawnTimer = 0;
    game.curEnc = enc;
  }

  function spawnFromQueue() {
    if (game.spawnQueue.length === 0) return;
    if (game.enemies.length >= 5) return;
    game.spawnTimer--;
    if (game.spawnTimer > 0) return;
    const kind = game.spawnQueue.shift();
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side === -1 ? camera.x - 30 : camera.x + W + 30;
    const y = FLOOR_TOP + Math.random() * (FLOOR_BOT - FLOOR_TOP);
    game.enemies.push(new Foot(x, y, kind, game.stageIdx * 8));
    game.spawnTimer = 40;
  }

  function spawnBoss() {
    const b = game.stage.boss;
    game.boss = new Boss(b, camera.x + W - 90);
    document.getElementById("boss-name").textContent = b.name;
    document.getElementById("boss-fill").style.width = "100%";
    document.getElementById("boss-hud").classList.remove("hidden");
    game.banner = 90; game.bannerText = b.name + "!"; game.bannerSub = "";
    Sound.bossWarn();
  }

  function beginGame(type) {
    game.player = new Player(type);
    game.score = 0; game.lives = 3; game.state = STATE.PLAY;
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("hud").classList.remove("hidden");
    updatePortrait(type);
    loadStage(0);
  }

  function playerDown() {
    game.lives--;
    if (game.lives <= 0) { endGame(false); return; }
    game.player.health = game.player.cfg.maxHealth;
    game.player.hitTimer = 90; game.player.flash = 90;
    game.player.x = camera.x + 100; game.player.y = 440;
    game.player.grabbed = null; game.player.spinTimer = 0;
  }

  function endGame(won) {
    game.state = won ? STATE.WIN : STATE.OVER;
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("boss-hud").classList.add("hidden");
    document.getElementById("go-title").textContent = won ? "YOU SAVED THE CITY!" : "GAME OVER";
    document.getElementById("go-title").style.color = won ? "#4ddb4d" : "#ff4d4d";
    document.getElementById("go-score").textContent =
      "Final Score: " + game.score + (won ? "   •   Cowabunga!" : "   •   Reached Stage " + (game.stageIdx + 1));
    document.getElementById("gameover").classList.remove("hidden");
    if (won) Sound.clear(); else Sound.die();
  }

  function stageCleared() {
    if (game.stageIdx + 1 >= STAGES.length) { endGame(true); return; }
    game.state = STATE.CLEAR; game.banner = 0;
    Sound.clear();
    game.bannerText = "STAGE CLEAR!"; game.bannerSub = "+5000";
    game.score += 5000;
    game.clearTimer = 160;
  }

  /* =======================================================================
     UPDATE
     ======================================================================= */
  function update() {
    if (game.state === STATE.CLEAR) {
      game.clearTimer--;
      if (game.clearTimer <= 0) { game.state = STATE.PLAY; loadStage(game.stageIdx + 1); }
      return;
    }
    if (game.state !== STATE.PLAY) return;

    const p = game.player;
    p.update();

    // ----- camera follows player; in a beat-'em-up it only scrolls right -----
    const want = p.x - W * 0.42;
    camera.x = Math.max(0, Math.max(camera.x, Math.min(camera.limit, want)));

    // ----- encounter / gate logic -----
    if (!game.encActive && !game.boss) {
      if (game.encIdx < game.stage.encounters.length) {
        const enc = game.stage.encounters[game.encIdx];
        if (camera.x >= camera.limit - 2) startEncounter(enc);
      } else {
        // all encounters done → walk to boss
        camera.limit = game.stage.length - W;
        if (camera.x >= camera.limit - 2 && !game.boss) spawnBoss();
      }
    }

    if (game.encActive) {
      spawnFromQueue();
      if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
        // encounter cleared
        game.encActive = false;
        if (game.curEnc.pizza) pickups.push(new Pizza(camera.x + W / 2, 430));
        game.encIdx++;
        if (game.encIdx < game.stage.encounters.length) camera.limit = game.stage.encounters[game.encIdx].camX;
        else camera.limit = game.stage.length - W;
      }
    }

    // ----- player melee vs enemies & grab initiation -----
    const hb = p.hitbox();
    for (const e of game.enemies) {
      e.update(p, game.enemies);
      // grab: walking into a stunned foot
      if (!p.grabbed && p.spinTimer === 0 && p.attackTimer === 0 && e.grabbable() &&
          Math.abs(p.x - e.x) < 40 && Math.abs(p.y - e.y) < 26) {
        const facingIt = (e.x - p.x) * p.facing >= -6;
        if (facingIt) { p.startGrab(e); }
      }
      if (hb && !e.dead && e.state !== "thrown" && e.state !== "grabbed") {
        const eb = { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h + 10 };
        if (hb.x < eb.x + eb.w && hb.x + hb.w > eb.x && hb.y < eb.y + eb.h && hb.y + hb.h > eb.y) {
          const canHit = hb.spin || !p.didHit;
          if (canHit) {
            e.takeDamage(hb.dmg, p.facing, false);
            if (!hb.spin) p.didHit = true;
            popText(e.x, e.y - 54, "-" + Math.round(hb.dmg), hb.kick ? "#9cf" : "#fff");
            game.shake = 4;
            if (hb.finisher || hb.kick) e.knockdown();
            if (!hb.spin) p.special = Math.min(100, p.special + 5);
            if (e.dead) { game.score += e.value; popText(e.x, e.y - 64, "+" + e.value, "#ffd23f"); }
          }
        }
      }
    }
    game.enemies = game.enemies.filter((e) => !e.dead);

    // ----- boss -----
    if (game.boss) {
      const b = game.boss;
      b.update(p);
      if (hb && b.state !== "intro") {
        const bb = b.hurtbox();
        if (hb.x < bb.x + bb.w && hb.x + hb.w > bb.x && hb.y < bb.y + bb.h && hb.y + hb.h > bb.y) {
          if (hb.spin || !p.didHit) {
            b.takeDamage(hb.dmg);
            if (!hb.spin) p.didHit = true;
            game.shake = 5; p.special = Math.min(100, p.special + 4);
            popText(b.x, b.y - 130, "-" + Math.round(hb.dmg * (b.state === "recover" ? 1.6 : 1)), "#ff0");
          }
        }
      }
      document.getElementById("boss-fill").style.width = Math.max(0, (b.health / b.maxHealth) * 100) + "%";
      if (b.dead) {
        game.score += b.value;
        popText(b.x, b.y - 100, "+" + b.value, "#ffd23f");
        burst(b.x, b.y - 40, "#ff0", 30);
        game.boss = null;
        stageCleared();
      }
    }

    // ----- projectiles & pickups -----
    for (const pr of projectiles) pr.update(p);
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
    for (const pk of pickups) pk.update(p);
    for (let i = pickups.length - 1; i >= 0; i--) if (pickups[i].dead) pickups.splice(i, 1);

    if (p.health <= 0) playerDown();
    if (game.shake > 0) game.shake--;
    if (game.banner > 0) game.banner--;
    updateFx();
    updateHUD();
  }

  function updateHUD() {
    const p = game.player;
    document.getElementById("health-fill").style.width = Math.max(0, (p.health / p.cfg.maxHealth) * 100) + "%";
    document.getElementById("special-fill").style.width = p.special + "%";
    document.getElementById("score").textContent = "SCORE " + game.score;
    document.getElementById("lives").textContent = "🐢 x " + game.lives;
  }

  /* =======================================================================
     RENDER
     ======================================================================= */
  function render() {
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);

    drawBackground(ctx, game.stage ? game.stage.theme : "city");

    if (game.state === STATE.PLAY || game.state === STATE.CLEAR) {
      // depth sort
      const ents = [...game.enemies, ...pickups, game.player];
      if (game.boss) ents.push(game.boss);
      ents.sort((a, b) => (a.y || 0) - (b.y || 0));
      for (const e of ents) e.draw(ctx);
      for (const pr of projectiles) pr.draw(ctx);
      drawFx(ctx);

      // "advance" arrow when the path is open
      if (!game.encActive && !game.boss && camera.x < camera.limit - 4 && game.banner <= 0) {
        const a = Math.sin(performance.now() / 150) * 6;
        ctx.fillStyle = "#ffd23f"; ctx.font = "bold 30px Trebuchet MS"; ctx.textAlign = "right";
        ctx.fillText("GO  ▶", W - 30 + a, 120);
      }
      // "STOP" when locked with enemies remaining
      if (game.encActive) {
        ctx.fillStyle = "rgba(255,60,60,0.9)"; ctx.font = "bold 20px Trebuchet MS"; ctx.textAlign = "center";
        if (Math.floor(performance.now() / 350) % 2 === 0) ctx.fillText("◆ DEFEAT THE FOOT CLAN ◆", W / 2, 116);
      }
    }

    // banners
    if (game.banner > 0 || game.state === STATE.CLEAR) {
      ctx.globalAlpha = game.state === STATE.CLEAR ? 1 : Math.min(1, game.banner / 30);
      ctx.fillStyle = "#ffd23f"; ctx.font = "bold 48px Trebuchet MS"; ctx.textAlign = "center";
      ctx.fillText(game.bannerText, W / 2, H / 2 - 16);
      ctx.font = "bold 22px Trebuchet MS"; ctx.fillStyle = "#fff";
      ctx.fillText(game.bannerSub, W / 2, H / 2 + 18);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function loop() { update(); render(); requestAnimationFrame(loop); }

  /* =======================================================================
     MENU / CHARACTER SELECT
     ======================================================================= */
  function buildRoster() {
    const roster = document.getElementById("roster");
    Object.keys(TURTLES).forEach((key) => {
      const t = TURTLES[key];
      const card = document.createElement("div");
      card.className = "turtle-card"; card.dataset.key = key;
      const c = document.createElement("canvas"); c.width = 90; c.height = 96;
      const g = c.getContext("2d"); g.translate(45, 52); drawTurtle(g, t.color, 0, 1.5, "idle");
      card.appendChild(c);
      card.insertAdjacentHTML("beforeend",
        `<div class="tname" style="color:${t.color}">${t.short}</div>
         <div class="tweap">${t.weap}</div>
         <div class="tstat">${t.desc}<br/>PWR ${t.power} · RNG ${t.range}</div>`);
      card.addEventListener("click", () => {
        document.querySelectorAll(".turtle-card").forEach((x) => x.classList.remove("selected"));
        card.classList.add("selected"); game.selected = key;
        const btn = document.getElementById("start-btn");
        btn.disabled = false; btn.textContent = "FIGHT AS " + t.short;
      });
      roster.appendChild(card);
    });
  }

  function updatePortrait(type) {
    const t = TURTLES[type];
    const el = document.getElementById("portrait");
    const c = document.createElement("canvas"); c.width = 46; c.height = 46;
    const g = c.getContext("2d"); g.translate(23, 32); drawTurtle(g, t.color, 0, 0.85, "idle");
    el.style.background = "#1d3d1d"; el.innerHTML = ""; el.appendChild(c);
  }

  document.getElementById("start-btn").addEventListener("click", () => {
    if (game.selected) { Sound.init(); beginGame(game.selected); }
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
  });

  buildRoster();
  loop();

  /* Optional test hook — only active when the URL ends in "#debug".
     Lets automated playtests fast-forward to a boss. No effect on normal play. */
  if (typeof location !== "undefined" && location.hash.indexOf("debug") !== -1) {
    window.__TMNT = {
      game, beginGame,
      skipToBoss() {
        if (game.state !== STATE.PLAY) return;
        game.enemies = []; game.spawnQueue = []; game.encActive = false;
        game.encIdx = game.stage.encounters.length;
        camera.limit = game.stage.length - W;
        camera.x = camera.limit;
        game.player.x = camera.x + 200;
      },
      hurtBoss(n) { if (game.boss) game.boss.takeDamage(n); },
    };
  }
})();
