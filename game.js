/* =========================================================================
   TEENAGE MUTANT NINJA TURTLES — SEWER SHOWDOWN
   A 90s-style beat-'em-up homage (Turtles in Time / Arcade).
   Pure canvas + Web Audio. No external assets.

   Features:
     • 1 or 2 player co-op
     • Side-scrolling brawl stages with "STOP" enemy gates
     • Grab & throw, jump kicks, running slide, combos, special spin
     • A Mode-7-style "Neon Night Riders" hoverboard stage
     • Bosses: Bebop, Rocksteady, Rat King, Baxter the Fly, Krang, Shredder
     • Pizza pickups, synthesized arcade sound
     • Keyboard, gamepad, and on-screen touch controls
   ========================================================================= */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FLOOR_TOP = 330, FLOOR_BOT = 505;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =======================================================================
     AUDIO
     ======================================================================= */
  const Sound = (() => {
    let ac = null, master = null, noiseBuf = null, enabled = true;
    function init() {
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
      const n = ac.sampleRate * 0.4;
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    function tone(freq, dur, type, vol, slideTo) {
      if (!ac || !enabled) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, vol, hp) {
      if (!ac || !enabled) return;
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol || 0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 800;
      s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ac.currentTime + dur);
    }
    return {
      init, setEnabled(v) { enabled = v; },
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
      shot()  { tone(900, 0.1, "square", 0.15, 300); },
      hurt()  { tone(200, 0.2, "sawtooth", 0.25, 80); },
      die()   { tone(300, 0.6, "sawtooth", 0.3, 60); },
      clear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, "square", 0.22), i * 130)); },
      warn()  { tone(140, 0.5, "sawtooth", 0.28, 110); },
    };
  })();

  /* =======================================================================
     TURTLES
     ======================================================================= */
  const TURTLES = {
    leo:  { name: "LEONARDO",     short: "LEO",  weap: "Katana",   color: "#1f6fff", speed: 3.0, power: 10, range: 60, maxHealth: 100, desc: "Balanced leader" },
    raph: { name: "RAPHAEL",      short: "RAPH", weap: "Sai",      color: "#d11f2f", speed: 3.1, power: 13, range: 50, maxHealth: 112, desc: "Hard hitter" },
    don:  { name: "DONATELLO",    short: "DON",  weap: "Bo Staff", color: "#7a3fd1", speed: 2.7, power: 9,  range: 82, maxHealth: 96,  desc: "Long reach" },
    mike: { name: "MICHELANGELO", short: "MIKE", weap: "Nunchaku", color: "#ff8a1f", speed: 3.4, power: 9,  range: 54, maxHealth: 100, desc: "Fast & wild" },
  };

  /* =======================================================================
     RAW KEYBOARD
     ======================================================================= */
  const keys = {}, pressed = {}, tapHist = {};
  const ALL_GAME_KEYS = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright",
    "a", "w", "s", "d", "f", "g", "h", "j", "k", "l", ",", ".", "/"]);
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!keys[k]) {
      pressed[k] = true;
      const a = tapHist[k] || [0, 0]; tapHist[k] = [a[1], performance.now()];
    }
    keys[k] = true;
    if (ALL_GAME_KEYS.has(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  function consume(k) { if (pressed[k]) { pressed[k] = false; return true; } return false; }

  /* =======================================================================
     GAMEPAD + TOUCH
     ======================================================================= */
  const padPrev = [{}, {}];
  function getPad(i) {
    if (i == null) return null;
    const gp = navigator.getGamepads ? navigator.getGamepads() : [];
    return gp[i] || null;
  }
  function padBtn(gp, b) { return gp.buttons[b] && gp.buttons[b].pressed; }

  const touchState = { up: false, down: false, left: false, right: false };
  const touchEdge = {};   // attack/jump/special one-shots
  let touchActive = false;
  function setupTouch() {
    const wrap = document.getElementById("touch");
    const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || location.hash.indexOf("touch") !== -1;
    document.querySelectorAll(".tb").forEach((btn) => {
      const act = btn.dataset.act;
      const press = (e) => {
        e.preventDefault(); touchActive = true; wrap.classList.remove("hidden");
        if (act === "up" || act === "down" || act === "left" || act === "right") touchState[act] = true;
        else touchEdge[act] = true;
      };
      const release = (e) => { e.preventDefault(); if (touchState[act] !== undefined) touchState[act] = false; };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    });
    if (isTouch) { touchActive = true; }
  }

  /* =======================================================================
     CONTROL SCHEMES + PER-PLAYER INPUT
     ======================================================================= */
  const SCHEMES = {
    solo: { left: ["arrowleft", "a"], right: ["arrowright", "d"], up: ["arrowup", "w"], down: ["arrowdown", "s"], attack: ["j", " "], jump: ["k"], special: ["l"] },
    p1:   { left: ["a"], right: ["d"], up: ["w"], down: ["s"], attack: ["f"], jump: ["g"], special: ["h"] },
    p2:   { left: ["arrowleft"], right: ["arrowright"], up: ["arrowup"], down: ["arrowdown"], attack: ["."], jump: ["/"], special: [","] },
  };
  const kd = (arr) => arr.some((k) => keys[k]);
  const kp = (arr) => { for (const k of arr) if (consume(k)) return true; return false; };
  function runHeld(s) {
    for (const side of [["right", 1], ["left", -1]]) {
      for (const k of s[side[0]]) {
        if (keys[k] && tapHist[k] && (tapHist[k][1] - tapHist[k][0]) < 280 && tapHist[k][1] > 0) return side[1];
      }
    }
    return 0;
  }

  // builds {mx,my,run,atk,jmp,spc} for a player
  function readInput(idx, scheme, padIndex) {
    const v = { mx: 0, my: 0, run: 0, atk: false, jmp: false, spc: false };
    if (kd(scheme.left)) v.mx -= 1;
    if (kd(scheme.right)) v.mx += 1;
    if (kd(scheme.up)) v.my -= 1;
    if (kd(scheme.down)) v.my += 1;
    v.atk = kp(scheme.attack); v.jmp = kp(scheme.jump); v.spc = kp(scheme.special);
    v.run = runHeld(scheme);

    const gp = getPad(padIndex);
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.35 || padBtn(gp, 14)) v.mx = -1; else if (ax > 0.35 || padBtn(gp, 15)) v.mx = 1;
      if (ay < -0.35 || padBtn(gp, 12)) v.my = -1; else if (ay > 0.35 || padBtn(gp, 13)) v.my = 1;
      if (Math.abs(ax) > 0.7) v.run = Math.sign(ax);
      const prev = padPrev[idx] || (padPrev[idx] = {});
      const edge = (b) => { const now = padBtn(gp, b); const was = prev[b]; prev[b] = now; return now && !was; };
      if (edge(0)) v.atk = true;
      if (edge(1)) v.jmp = true;
      if (edge(2) || edge(3)) v.spc = true;
      else { edge(2); edge(3); } // keep prev state fresh
    }

    if (idx === 0 && touchActive) {
      if (touchState.left) v.mx = -1; if (touchState.right) v.mx = 1;
      if (touchState.up) v.my = -1; if (touchState.down) v.my = 1;
      if (touchEdge.attack) { v.atk = true; touchEdge.attack = false; }
      if (touchEdge.jump) { v.jmp = true; touchEdge.jump = false; }
      if (touchEdge.special) { v.spc = true; touchEdge.special = false; }
    }
    return v;
  }

  /* =======================================================================
     CAMERA  (brawl only; rider uses screen coords with camera.x = 0)
     ======================================================================= */
  const camera = { x: 0, limit: 0 };
  const toScreenX = (x) => x - camera.x;

  /* =======================================================================
     SPRITES
     ======================================================================= */
  function drawShadow(g, rx) { g.fillStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.ellipse(0, 36, rx, rx * 0.32, 0, 0, Math.PI * 2); g.fill(); }

  function drawTurtle(g, color, frame, scale, pose) {
    scale = scale || 1; pose = pose || "idle";
    g.save(); g.scale(scale, scale);
    const walk = pose === "walk";
    const bob = walk ? Math.sin(frame * 0.3) * 1.6 : Math.sin(frame * 0.12) * 0.8;
    const stride = walk ? Math.sin(frame * 0.3) * 4 : 0;
    drawShadow(g, 20);
    g.fillStyle = "#2e7d32";
    g.fillRect(-11 - stride * 0.3, 18, 8, 16); g.fillRect(3 + stride * 0.3, 18, 8, 16);
    g.fillStyle = "#163417";
    g.fillRect(-13 - stride * 0.3, 32, 12, 4); g.fillRect(1 + stride * 0.3, 32, 12, 4);
    g.fillStyle = "#6b3e16"; g.beginPath(); g.ellipse(0, 4 + bob, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#8a5320"; g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5a3212"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-9, -6 + bob); g.lineTo(9, -6 + bob); g.moveTo(-11, 4 + bob); g.lineTo(11, 4 + bob); g.moveTo(-9, 14 + bob); g.lineTo(9, 14 + bob); g.stroke();
    g.fillStyle = "#43a047"; g.beginPath(); g.ellipse(0, 6 + bob, 14, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#cfe9b0"; g.beginPath(); g.ellipse(0, 8 + bob, 9, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#43a047";
    if (pose === "attack") { g.fillRect(8, -4 + bob, 22, 7); g.fillRect(-17, 2 + bob, 7, 14); }
    else if (pose === "grab") { g.fillRect(12, -2 + bob, 16, 7); g.fillRect(12, 8 + bob, 16, 7); }
    else { g.fillRect(-17, 2 + bob, 7, 16); g.fillRect(10, 2 + bob, 7, 16); }
    g.fillStyle = "#4caf50"; g.beginPath(); g.ellipse(0, -16 + bob, 12, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.fillRect(-12, -20 + bob, 24, 7);
    g.beginPath(); g.moveTo(11, -19 + bob); g.lineTo(26, -23 + bob); g.lineTo(24, -14 + bob); g.lineTo(11, -13 + bob); g.closePath(); g.fill();
    g.fillStyle = "#fff"; g.fillRect(-7, -18 + bob, 5, 4); g.fillRect(3, -18 + bob, 5, 4);
    g.fillStyle = "#000"; g.fillRect(-5, -17 + bob, 2, 2); g.fillRect(5, -17 + bob, 2, 2);
    g.restore();
  }

  const FOOT_COLORS = {
    purple: { suit: "#5b2a86", trim: "#caa6f0", eye: "#ff5cf0" },
    red:    { suit: "#7a1d1d", trim: "#f0a6a6", eye: "#ff6a6a" },
    blue:   { suit: "#1d3a7a", trim: "#a6c4f0", eye: "#6ab0ff" },
  };
  function drawFoot(g, frame, scale, kind, grabbed) {
    if (kind === "rat") return drawRat(g, frame, scale);
    scale = scale || 1; const c = FOOT_COLORS[kind] || FOOT_COLORS.purple;
    g.save(); g.scale(scale, scale);
    const bob = grabbed ? 0 : Math.sin(frame * 0.25) * 1.5;
    const stride = grabbed ? 0 : Math.sin(frame * 0.25) * 3;
    drawShadow(g, 15);
    g.fillStyle = c.suit; g.fillRect(-9 - stride * 0.3, 16, 7, 18); g.fillRect(2 + stride * 0.3, 16, 7, 18);
    g.beginPath(); g.ellipse(0, 4 + bob, 12, 16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.trim; g.fillRect(-12, 6 + bob, 24, 4);
    g.fillStyle = c.suit;
    if (grabbed) { g.fillRect(-16, -4 + bob, 6, 18); g.fillRect(10, -4 + bob, 6, 18); }
    else { g.fillRect(-15, 0 + bob, 6, 15); g.fillRect(9, 0 + bob, 6, 15); }
    g.beginPath(); g.ellipse(0, -14 + bob, 10, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.trim; g.fillRect(-10, -16 + bob, 20, 6);
    g.fillStyle = c.eye; g.fillRect(-6, -15 + bob, 4, 3); g.fillRect(2, -15 + bob, 4, 3);
    g.fillStyle = c.suit; g.beginPath(); g.moveTo(-9, -16 + bob); g.lineTo(-22, -21 + bob); g.lineTo(-19, -11 + bob); g.closePath(); g.fill();
    g.restore();
  }
  function drawRat(g, frame, scale) {
    g.save(); g.scale(scale || 1, scale || 1);
    const bob = Math.sin(frame * 0.4) * 1.2;
    drawShadow(g, 12);
    g.fillStyle = "#6b5a4a";
    g.beginPath(); g.ellipse(0, 10 + bob, 13, 9, 0, 0, Math.PI * 2); g.fill();       // body
    g.beginPath(); g.ellipse(11, 4 + bob, 7, 6, 0, 0, Math.PI * 2); g.fill();         // head
    g.fillStyle = "#e7a9c0"; g.beginPath(); g.arc(8, -2 + bob, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(14, -2 + bob, 3, 0, Math.PI * 2); g.fill(); // ears
    g.strokeStyle = "#e7a9c0"; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, 10 + bob); g.quadraticCurveTo(-22, 6, -20, 16); g.stroke(); // tail
    g.fillStyle = "#c00"; g.fillRect(15, 2 + bob, 2, 2);                              // eye
    g.fillStyle = "#222"; g.fillRect(18, 5 + bob, 2, 2);                              // nose
    g.restore();
  }

  function drawPizza(g, frame) {
    g.save(); g.translate(0, Math.sin(frame * 0.1) * 3); drawShadow(g, 14);
    g.fillStyle = "#d9c089"; g.fillRect(-15, -12, 30, 22);
    g.fillStyle = "#b89a5a"; g.fillRect(-15, -12, 30, 5);
    g.fillStyle = "#e8b84a"; g.beginPath(); g.moveTo(0, -10); g.lineTo(-11, 6); g.lineTo(11, 6); g.closePath(); g.fill();
    g.fillStyle = "#c0392b"; [[-4, 0], [4, 1], [0, 4]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); });
    g.restore();
  }

  /* ---- Boss art ---- */
  function drawBebop(g, frame, hurt) {
    g.save(); const bob = Math.sin(frame * 0.18) * 2; drawShadow(g, 30);
    const skin = hurt ? "#fff" : "#6d5a8a";
    g.fillStyle = "#2a2a2a"; g.fillRect(-16, 22, 12, 22); g.fillRect(4, 22, 12, 22);
    g.fillStyle = skin; g.beginPath(); g.ellipse(0, 6 + bob, 26, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1a1a2a"; g.fillRect(-22, -2 + bob, 12, 30); g.fillRect(10, -2 + bob, 12, 30);
    g.fillStyle = skin; g.fillRect(-32, bob, 12, 24); g.fillRect(20, bob, 12, 24);
    g.beginPath(); g.ellipse(0, -22 + bob, 16, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#7d6a9a"; g.fillRect(-6, -18 + bob, 12, 8);
    g.fillStyle = "#fff"; g.fillRect(-7, -12 + bob, 3, 6); g.fillRect(4, -12 + bob, 3, 6);
    g.fillStyle = "#ff2db5"; for (let i = -10; i <= 10; i += 5) { g.beginPath(); g.moveTo(i, -34 + bob); g.lineTo(i + 2, -46 + bob); g.lineTo(i + 5, -34 + bob); g.closePath(); g.fill(); }
    g.fillStyle = "#111"; g.fillRect(-12, -26 + bob, 24, 5);
    g.restore();
  }
  function drawRocksteady(g, frame, hurt) {
    g.save(); const bob = Math.sin(frame * 0.16) * 2; drawShadow(g, 32);
    const skin = hurt ? "#fff" : "#8a8a6a";
    g.fillStyle = "#3a3322"; g.fillRect(-17, 22, 13, 24); g.fillRect(4, 22, 13, 24);
    g.fillStyle = skin; g.beginPath(); g.ellipse(0, 6 + bob, 28, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#caa72a"; g.fillRect(-26, bob, 52, 6);
    g.fillStyle = skin; g.fillRect(-36, bob, 13, 26); g.fillRect(23, bob, 13, 26);
    g.beginPath(); g.ellipse(0, -22 + bob, 17, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e8e0c0"; g.beginPath(); g.moveTo(-4, -30 + bob); g.lineTo(0, -44 + bob); g.lineTo(4, -30 + bob); g.closePath(); g.fill();
    g.fillStyle = "#3a5a2a"; g.fillRect(-16, -34 + bob, 32, 7);
    g.fillStyle = "#c00"; g.fillRect(-9, -24 + bob, 5, 4); g.fillRect(4, -24 + bob, 5, 4);
    g.restore();
  }
  function drawShredder(g, frame, hurt) {
    g.save(); const bob = Math.sin(frame * 0.2) * 1.5; drawShadow(g, 26);
    const metal = hurt ? "#fff" : "#c0c4cc";
    g.fillStyle = "#5a1a6a"; g.beginPath(); g.moveTo(-22, -20 + bob); g.lineTo(-30, 36); g.lineTo(30, 36); g.lineTo(22, -20 + bob); g.closePath(); g.fill();
    g.fillStyle = "#2a2a3a"; g.fillRect(-12, 20, 9, 20); g.fillRect(3, 20, 9, 20);
    g.fillStyle = metal; g.beginPath(); g.ellipse(0, 4 + bob, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#9aa0aa"; g.beginPath(); g.ellipse(0, 6 + bob, 11, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = metal; g.fillRect(-26, -2 + bob, 9, 20); g.fillRect(17, -2 + bob, 9, 20);
    g.fillStyle = "#eef";
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(-26 + i * 3, 18 + bob); g.lineTo(-25 + i * 3, 30 + bob); g.lineTo(-23 + i * 3, 18 + bob); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(17 + i * 3, 18 + bob); g.lineTo(18 + i * 3, 30 + bob); g.lineTo(20 + i * 3, 18 + bob); g.closePath(); g.fill();
    }
    g.fillStyle = metal; g.beginPath(); g.ellipse(0, -18 + bob, 13, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e8ecf2";
    g.beginPath(); g.moveTo(-13, -22 + bob); g.lineTo(-18, -34 + bob); g.lineTo(-9, -24 + bob); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(13, -22 + bob); g.lineTo(18, -34 + bob); g.lineTo(9, -24 + bob); g.closePath(); g.fill();
    g.fillStyle = "#3a2a1a"; g.fillRect(-9, -16 + bob, 18, 8);
    g.fillStyle = "#ff3030"; g.fillRect(-7, -15 + bob, 5, 4); g.fillRect(3, -15 + bob, 5, 4);
    g.restore();
  }
  function drawRatKing(g, frame, hurt) {
    g.save(); const bob = Math.sin(frame * 0.16) * 2; drawShadow(g, 24);
    const cloth = hurt ? "#fff" : "#cfc6b0";
    g.fillStyle = cloth; // tattered robe
    g.beginPath(); g.moveTo(-20, -10 + bob); g.lineTo(-26, 38); g.lineTo(26, 38); g.lineTo(20, -10 + bob); g.closePath(); g.fill();
    for (let i = -22; i < 22; i += 8) { g.beginPath(); g.moveTo(i, 38); g.lineTo(i + 4, 30); g.lineTo(i + 8, 38); g.closePath(); g.fillStyle = "#0c0e0a"; g.fill(); }
    g.fillStyle = cloth; g.fillRect(-28, -6 + bob, 10, 26); g.fillRect(18, -6 + bob, 10, 26); // arms wrapped
    g.fillStyle = "#9a8a6a"; g.beginPath(); g.ellipse(0, -20 + bob, 13, 12, 0, 0, Math.PI * 2); g.fill(); // rat head
    g.fillStyle = "#9a8a6a"; g.beginPath(); g.moveTo(-13, -22 + bob); g.lineTo(-20, -34 + bob); g.lineTo(-7, -26 + bob); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(13, -22 + bob); g.lineTo(20, -34 + bob); g.lineTo(7, -26 + bob); g.closePath(); g.fill();
    g.fillStyle = "#e7a9c0"; g.beginPath(); g.moveTo(0, -16 + bob); g.lineTo(8, -10 + bob); g.lineTo(0, -8 + bob); g.closePath(); g.fill(); // snout
    g.fillStyle = "#c00"; g.fillRect(-7, -22 + bob, 4, 3); g.fillRect(3, -22 + bob, 4, 3);
    g.restore();
  }
  function drawBaxter(g, frame, hurt) {
    g.save(); const flap = Math.sin(frame * 0.6) * 8; drawShadow(g, 22);
    const body = hurt ? "#fff" : "#3f6b3a";
    // wings
    g.fillStyle = "rgba(200,230,255,0.5)";
    g.beginPath(); g.ellipse(-22, -8 - flap, 18, 9, -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(22, -8 - flap, 18, 9, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = body; g.beginPath(); g.ellipse(0, 8, 16, 20, 0, 0, Math.PI * 2); g.fill(); // body
    g.fillStyle = "#2a3a28"; g.fillRect(-14, 26, 6, 14); g.fillRect(8, 26, 6, 14);   // dangling legs
    g.fillStyle = body; g.beginPath(); g.ellipse(0, -14, 13, 12, 0, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = "#c0202a"; g.beginPath(); g.ellipse(-7, -16, 7, 8, 0, 0, Math.PI * 2); g.fill(); // compound eyes
    g.beginPath(); g.ellipse(7, -16, 7, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(-9, -18, 2, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(5, -18, 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#111"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 2); g.stroke(); // proboscis
    g.restore();
  }
  function drawKrang(g, frame, hurt) {
    g.save(); const bob = Math.sin(frame * 0.12) * 1.5; drawShadow(g, 36);
    const metal = hurt ? "#fff" : "#b8bcc4";
    g.fillStyle = "#7a8088"; g.fillRect(-22, 24, 16, 22); g.fillRect(6, 24, 16, 22); // legs
    g.fillStyle = "#8a9098"; g.fillRect(-26, 36, 22, 8); g.fillRect(4, 36, 22, 8);   // feet
    g.fillStyle = metal; g.beginPath(); g.ellipse(0, 4 + bob, 30, 28, 0, 0, Math.PI * 2); g.fill(); // torso
    g.fillStyle = metal; g.fillRect(-40, -4 + bob, 14, 30); g.fillRect(26, -4 + bob, 14, 30); // arms
    g.fillStyle = "#9aa0a8"; g.beginPath(); g.arc(-33, 28 + bob, 9, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(33, 28 + bob, 9, 0, Math.PI * 2); g.fill(); // fists
    // exposed brain (Krang) in the belly
    g.fillStyle = "#f4a7c0"; g.beginPath(); g.ellipse(0, 8 + bob, 14, 12, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#d97aa0"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(-4, 6 + bob, 4, 0, Math.PI); g.arc(5, 6 + bob, 4, 0, Math.PI); g.arc(0, 12 + bob, 4, 0, Math.PI); g.stroke();
    g.fillStyle = "#000"; g.fillRect(-7, 8 + bob, 3, 3); g.fillRect(4, 8 + bob, 3, 3); // eyes
    g.fillStyle = "#7a1020"; g.fillRect(-5, 14 + bob, 10, 2); // mouth
    // small android head on top
    g.fillStyle = metal; g.beginPath(); g.ellipse(0, -24 + bob, 10, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#39f"; g.fillRect(-6, -26 + bob, 4, 3); g.fillRect(2, -26 + bob, 4, 3);
    g.restore();
  }
  const BOSS_DRAW = { bebop: drawBebop, rocksteady: drawRocksteady, shredder: drawShredder, ratking: drawRatKing, baxter: drawBaxter, krang: drawKrang };

  /* =======================================================================
     PARTICLES
     ======================================================================= */
  const fx = [];
  const screenMode = () => game.mode === "rider";
  function fxX(x) { return screenMode() ? x : toScreenX(x); }
  function popText(x, y, txt, color) { fx.push({ x, y, vy: -1.4, life: 42, txt, color: color || "#fff" }); }
  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 8); i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 24, dot: true, color }); }
  }
  function updateFx() { for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.x += p.vx || 0; p.y += p.vy; if (p.dot) p.vy += 0.18; if (--p.life <= 0) fx.splice(i, 1); } }
  function drawFx(g) {
    for (const p of fx) {
      g.globalAlpha = Math.min(1, p.life / 18);
      if (p.dot) { g.fillStyle = p.color; g.fillRect(fxX(p.x) - 2, p.y - 2, 4, 4); }
      else { g.fillStyle = p.color; g.textAlign = "center"; g.font = "bold 18px Trebuchet MS"; g.fillText(p.txt, fxX(p.x), p.y); }
    }
    g.globalAlpha = 1;
  }

  /* =======================================================================
     PLAYER
     ======================================================================= */
  class Player {
    constructor(type, idx, scheme, padIndex) {
      const t = TURTLES[type];
      this.type = type; this.cfg = t; this.idx = idx;
      this.scheme = scheme; this.padIndex = padIndex;
      this.x = 120 + idx * 60; this.y = 430 + idx * 20;
      this.z = 0; this.vz = 0; this.facing = 1;
      this.health = t.maxHealth; this.special = 0; this.frame = 0;
      this.attackTimer = 0; this.attackCooldown = 0; this.combo = 0; this.comboTimer = 0; this.didHit = false;
      this.hitTimer = 0; this.flash = 0; this.jumpKick = false; this.spinTimer = 0; this.slide = 0;
      this.grabbed = null; this.grabTimer = 0; this.pose = "idle"; this.out = false;
      this.in = { mx: 0, my: 0, run: 0, atk: false, jmp: false, spc: false };
    }
    update() {
      if (this.out) return;
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;
      if (this.hitTimer > 0) this.hitTimer--;
      if (this.flash > 0) this.flash--;
      if (this.spinTimer > 0) this.spinTimer--;
      if (this.comboTimer > 0) this.comboTimer--; else this.combo = 0;

      const v = this.in;
      const grounded = this.z === 0;
      const rider = game.mode === "rider";

      // ----- holding an enemy (brawl only) -----
      if (this.grabbed) {
        if (v.mx !== 0) this.facing = v.mx > 0 ? 1 : -1;
        const e = this.grabbed; e.x = this.x + this.facing * 26; e.y = this.y;
        if (--this.grabTimer <= 0) {
          e.takeDamage(6, this.facing, true); popText(e.x, e.y - 54, "-6", "#fff"); Sound.punch();
          this.grabTimer = 28; if (e.dead) this.releaseGrab(false);
        }
        if (v.atk) this.throwGrabbed();
        this.pose = "grab"; this.frame += 0.2; return;
      }

      // ----- movement -----
      const running = v.run !== 0 && this.attackTimer === 0;
      let sp = this.cfg.speed * (this.attackTimer > 0 ? 0.15 : 1);
      if (running && grounded && !rider) sp *= 1.7;
      this.x += v.mx * sp;
      this.y += v.my * (sp * 0.8);
      if (v.mx !== 0) this.facing = v.mx > 0 ? 1 : -1;

      if (rider) {
        this.x = clamp(this.x, 44, W - 44);
        this.y = clamp(this.y, H - 170, H - 64);
      } else {
        this.y = clamp(this.y, FLOOR_TOP, FLOOR_BOT);
        this.x = clamp(this.x, camera.x + 24, camera.x + W - 24);
      }

      // ----- jump -----
      if (v.jmp && grounded && this.attackTimer === 0) { this.vz = 9.2; Sound.jump(); }
      if (this.z > 0 || this.vz !== 0) { this.z += this.vz; this.vz -= 0.6; if (this.z <= 0) { this.z = 0; this.vz = 0; this.jumpKick = false; Sound.land(); } }

      // ----- attack -----
      if (v.atk && this.attackCooldown === 0 && this.spinTimer === 0) {
        if (!grounded) { this.jumpKick = true; this.attackTimer = 14; this.attackCooldown = 16; this.didHit = false; Sound.whiff(); }
        else if (running && !rider) { this.attackTimer = 16; this.attackCooldown = 22; this.combo = 0; this.didHit = false; this.slide = 10; Sound.whiff(); }
        else {
          this.attackTimer = 12; this.attackCooldown = 16;
          this.combo = (this.comboTimer > 0) ? Math.min(this.combo + 1, 3) : 1;
          this.comboTimer = 42; this.didHit = false; Sound.whiff();
        }
      }
      if (this.slide > 0) { this.x += this.facing * this.slide; this.slide--; }

      // ----- special -----
      if (v.spc && this.spinTimer === 0 && this.health > 12) {
        this.spinTimer = 36; this.health -= 8; this.flash = 8; Sound.special(); burst(this.x, this.y - 20, this.cfg.color, 16);
      }

      this.pose = this.spinTimer > 0 || this.attackTimer > 0 ? "attack" : (v.mx || v.my) ? "walk" : "idle";
      this.frame += this.pose === "walk" ? (running ? 1.5 : 1) : 0.4;
    }
    startGrab(e) { this.grabbed = e; e.grabbedBy = this; e.state = "grabbed"; this.grabTimer = 24; Sound.grab(); }
    releaseGrab(thrown) { if (!this.grabbed) return; const e = this.grabbed; e.grabbedBy = null; if (!thrown) e.state = "active"; this.grabbed = null; }
    throwGrabbed() { const e = this.grabbed; e.becomeThrown(this.facing); Sound.thrw(); popText(e.x, e.y - 54, "THROW!", "#ffd23f"); this.grabbed = null; }
    hitbox() {
      if (this.out) return null;
      if (this.spinTimer > 0 && this.spinTimer % 6 === 0) return { x: this.x - 70, y: this.y - 30, w: 140, h: 80, dmg: this.cfg.power * 1.4, spin: true, owner: this };
      if (this.attackTimer === 0) return null;
      if (this.jumpKick) { if (this.attackTimer > 9) return null; return { x: this.facing === 1 ? this.x : this.x - 56, y: this.y - 40, w: 56, h: 70, dmg: this.cfg.power * 1.3, kick: true, owner: this }; }
      if (this.attackTimer > 8) return null;
      const r = this.cfg.range + (this.slide > 0 ? 20 : 0);
      return { x: this.facing === 1 ? this.x : this.x - r, y: this.y - 24, w: r, h: 60, dmg: this.cfg.power * (1 + this.combo * 0.22), finisher: this.combo >= 3, owner: this };
    }
    takeDamage(d) {
      if (this.out || this.hitTimer > 0 || this.spinTimer > 0) return;
      if (this.grabbed) this.releaseGrab(false);
      this.health -= d; this.hitTimer = 44; this.flash = 14; Sound.hurt(); popText(this.x, this.y - 70, "-" + d, "#ff7070");
    }
    draw(g) {
      if (this.out) return;
      const sx = screenMode() ? this.x : toScreenX(this.x);
      g.save(); g.translate(sx, this.y - this.z);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.flash > 0 && Math.floor(this.flash / 2) % 2 === 0) g.globalAlpha = 0.4;
      if (this.spinTimer > 0) { g.save(); g.globalAlpha = 0.4; g.fillStyle = this.cfg.color; g.beginPath(); g.ellipse(0, 0, 64, 44, 0, 0, Math.PI * 2); g.fill(); g.restore(); g.rotate((36 - this.spinTimer) * 0.5); }
      drawTurtle(g, this.cfg.color, this.frame, 1.2, this.pose);
      if (this.attackTimer > 6 && !this.jumpKick && this.spinTimer === 0) { g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 4; g.beginPath(); g.arc(30, -6, this.cfg.range * 0.7, -1.0, 0.9); g.stroke(); }
      g.restore();
      // player marker (which is which)
      g.fillStyle = this.cfg.color; g.font = "bold 11px Trebuchet MS"; g.textAlign = "center";
      g.fillText("P" + (this.idx + 1), sx, this.y - this.z - 62);
      if (this.combo > 1 && this.comboTimer > 0) { g.fillStyle = "#ffd23f"; g.font = "bold 15px Trebuchet MS"; g.fillText(this.combo + " HIT", sx, this.y - this.z - 76); }
    }
  }

  /* =======================================================================
     FOOT SOLDIER
     ======================================================================= */
  class Foot {
    constructor(x, y, kind, hpBonus) {
      this.x = x; this.y = y; this.w = 38; this.h = 60; this.kind = kind || "purple";
      const base = kind === "red" ? 40 : kind === "blue" ? 26 : kind === "rat" ? 16 : 30;
      this.health = base + (hpBonus || 0); this.maxHealth = this.health;
      this.speed = (kind === "red" ? 1.7 : kind === "blue" ? 1.1 : kind === "rat" ? 2.2 : 1.3) + Math.random() * 0.3;
      this.facing = -1; this.frame = Math.random() * 10;
      this.attackTimer = 0; this.attackCooldown = 40 + Math.random() * 50; this.hitFlash = 0; this.stun = 0;
      this.state = "active"; this.grabbedBy = null;
      this.vx = 0; this.vz = 0; this.z = 0; this.dead = false;
      this.shootCd = 60 + Math.random() * 80;
      this.value = kind === "red" ? 300 : kind === "blue" ? 200 : kind === "rat" ? 80 : 150;
    }
    becomeThrown(dir) { this.state = "thrown"; this.vx = dir * 11; this.vz = 7; this.z = 0.1; this.facing = -dir; this.stun = 0; }
    update(players, enemies) {
      this.frame += 0.5; if (this.hitFlash > 0) this.hitFlash--;
      if (this.state === "thrown") {
        this.x += this.vx; this.vx *= 0.99; this.z += this.vz; this.vz -= 0.5;
        for (const o of enemies) {
          if (o === this || o.dead || o.state === "thrown") continue;
          if (Math.abs(o.x - this.x) < 30 && Math.abs(o.y - this.y) < 26 && o.state !== "knockdown") { o.takeDamage(14, Math.sign(this.vx) || 1, true); o.knockdown(); popText(o.x, o.y - 54, "-14", "#9cf"); burst(o.x, o.y - 20, "#caa6f0", 6); }
        }
        if (this.z <= 0) { this.z = 0; this.takeDamage(10, 0, true); Sound.hit(); burst(this.x, this.y - 10, "#caa6f0", 8); if (!this.dead) this.knockdown(); }
        return;
      }
      if (this.state === "knockdown") { this.stun--; this.z = Math.max(0, this.z + (this.vz -= 0.5)); this.x += this.vx; this.vx *= 0.85; if (this.stun <= 0) { this.state = "active"; this.z = 0; } return; }
      if (this.state === "grabbed") { this.frame += 0.3; return; }
      if (this.stun > 0) { this.stun--; this.state = "stunned"; if (this.stun === 0) this.state = "active"; return; }
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackTimer > 0) this.attackTimer--;

      const p = nearestPlayer(this.x, this.y); if (!p) return;
      const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx > 0 ? 1 : -1;

      if (this.kind === "blue") {
        this.shootCd--; const want = 150;
        if (dist > want + 30) { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; }
        else if (dist < want - 30) this.x -= (dx / dist) * this.speed;
        else if (this.shootCd <= 0 && Math.abs(dy) < 50) { this.shootCd = 110 + Math.random() * 60; projectiles.push(new Shuriken(this.x, this.y - 18, this.facing)); Sound.shot(); }
        this.y = clamp(this.y, FLOOR_TOP, FLOOR_BOT); return;
      }
      if (dist > 44) { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; }
      else if (this.attackCooldown === 0) { this.attackTimer = 18; this.attackCooldown = 70 + Math.random() * 50; this._pending = true; }
      if (this.attackTimer === 9 && this._pending) { if (Math.abs(p.x - this.x) < 48 && Math.abs(p.y - this.y) < 38) p.takeDamage(this.kind === "red" ? 12 : this.kind === "rat" ? 6 : 8); this._pending = false; }
      this.y = clamp(this.y, FLOOR_TOP, FLOOR_BOT);
    }
    knockdown() { this.state = "knockdown"; this.stun = 50; this.vz = 5; this.z = 0.1; this.vx = this.facing * -3; }
    takeDamage(d, dir, noKnock) {
      this.health -= d; this.hitFlash = 8;
      if (this.health <= 0) { this.dead = true; burst(this.x, this.y - 20, "#fff", 10); Sound.hit(); return; }
      if (!noKnock) { this.stun = 22; this.state = "stunned"; this.x += dir * 6; }
      Sound.hit();
    }
    grabbable() { return (this.state === "stunned" || this.stun > 0) && this.kind !== "blue" && this.kind !== "rat"; }
    draw(g) {
      g.save(); g.translate(toScreenX(this.x), this.y - this.z);
      if (this.facing === -1) g.scale(-1, 1);
      if (this.state === "knockdown") g.rotate(Math.PI / 2 * (1 - this.stun / 50) * 0.9);
      if (this.hitFlash > 0) drawFootFlash(g, this.frame, 1.05, this.kind); else drawFoot(g, this.frame, 1.05, this.kind, this.state === "grabbed");
      g.restore();
      if (this.health < this.maxHealth && this.state !== "knockdown" && this.state !== "thrown") {
        const w = 32, sx = toScreenX(this.x);
        g.fillStyle = "#000"; g.fillRect(sx - w / 2 - 1, this.y - 54, w + 2, 5);
        g.fillStyle = this.kind === "red" ? "#f55" : this.kind === "blue" ? "#5af" : this.kind === "rat" ? "#fa5" : "#c9f";
        g.fillRect(sx - w / 2, this.y - 53, w * Math.max(0, this.health / this.maxHealth), 3);
      }
    }
  }
  function drawFootFlash(g, frame, scale, kind) { drawFoot(g, frame, scale, kind, false); g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(-30, -42, 60, 92); g.globalCompositeOperation = "source-over"; }

  /* =======================================================================
     PROJECTILES
     ======================================================================= */
  const projectiles = [];
  class Shuriken {
    constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.spin = 0; this.dead = false; }
    update() { this.x += this.dir * 5.2; this.spin += 0.5; const p = nearestPlayer(this.x, this.y); if (p && Math.abs(p.x - this.x) < 26 && Math.abs((p.y - p.z) - this.y) < 30) { p.takeDamage(7); this.dead = true; } if (toScreenX(this.x) < -40 || toScreenX(this.x) > W + 40) this.dead = true; }
    draw(g) { g.save(); g.translate(toScreenX(this.x), this.y); g.rotate(this.spin); g.fillStyle = "#cfd8e0"; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(8, -3); g.lineTo(11, 0); g.lineTo(8, 3); g.closePath(); g.fill(); } g.restore(); }
  }
  class Blob {
    constructor(x, y, dir, dmg, color, speed) { this.x = x; this.y = y; this.dir = dir; this.dmg = dmg; this.dead = false; this.frame = 0; this.color = color || "#6cff4a"; this.speed = speed || 4; }
    update() { this.x += this.dir * this.speed; this.frame++; const p = nearestPlayer(this.x, this.y); if (p && Math.abs(p.x - this.x) < 28 && Math.abs((p.y - p.z) - this.y) < 32) { p.takeDamage(this.dmg); this.dead = true; } if (toScreenX(this.x) < -40 || toScreenX(this.x) > W + 40) this.dead = true; }
    draw(g) { g.save(); g.translate(toScreenX(this.x), this.y); g.fillStyle = this.color; const r = 8 + Math.sin(this.frame * 0.4) * 2; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.4; g.beginPath(); g.arc(-this.dir * 8, 0, r * 0.7, 0, Math.PI * 2); g.fill(); g.restore(); }
  }

  /* =======================================================================
     PIZZA
     ======================================================================= */
  const pickups = [];
  class Pizza {
    constructor(x, y) { this.x = x; this.y = y; this.frame = 0; this.dead = false; this.life = 700; }
    update() { this.frame++; if (--this.life <= 0) this.dead = true; const p = nearestPlayer(this.x, this.y); if (p && Math.abs(p.x - this.x) < 34 && Math.abs(p.y - this.y) < 30) { const heal = Math.min(40, p.cfg.maxHealth - p.health); p.health = Math.min(p.cfg.maxHealth, p.health + 40); this.dead = true; Sound.pizza(); popText(this.x, this.y - 30, heal > 0 ? "+" + heal + " PIZZA POWER!" : "COWABUNGA!", "#7CFC00"); } }
    draw(g) { g.save(); g.translate(toScreenX(this.x), this.y); drawPizza(g, this.frame); g.restore(); }
  }

  /* =======================================================================
     BOSS  (brawl)
     ======================================================================= */
  class Boss {
    constructor(cfg, x) {
      this.cfg = cfg; this.kind = cfg.kind; this.x = x; this.y = 430; this.w = 70; this.h = 110;
      this.health = cfg.hp; this.maxHealth = cfg.hp; this.facing = -1; this.frame = 0;
      this.state = "intro"; this.timer = 80; this.hitFlash = 0; this.dead = false; this.vulnerable = true; this.value = 2000; this.z = 0; this.vz = 0;
    }
    chooseAttack() {
      switch (this.kind) {
        case "shredder": return Math.random() < 0.5 ? "teleport" : "windup";
        case "krang": return Math.random() < 0.5 ? "stomp" : "beam";
        case "ratking": { const r = Math.random(); return r < 0.4 ? "summon" : r < 0.7 ? "windup_dash" : "windup"; }
        case "rocksteady": { const r = Math.random(); return r < 0.4 ? "windup_dash" : r < 0.7 ? "beam" : "windup"; }
        default: return Math.random() < 0.45 ? "windup_dash" : "windup";
      }
    }
    update() {
      this.frame += 0.6; if (this.hitFlash > 0) this.hitFlash--;
      const p = nearestPlayer(this.x, this.y); if (!p) return;
      this.facing = p.x > this.x ? 1 : -1; this.timer--;
      switch (this.state) {
        case "intro": if (this.timer <= 0) { this.state = "approach"; this.timer = 50; } break;
        case "approach": {
          this.vulnerable = true;
          const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
          const spd = this.kind === "krang" ? 1.1 : 1.7;
          if (d > 70) { this.x += (dx / d) * spd; this.y += (dy / d) * (spd * 0.8); }
          this.y = clamp(this.y, FLOOR_TOP, FLOOR_BOT);
          if (this.timer <= 0) { this.state = this.chooseAttack(); this.timer = this.state === "stomp" ? 22 : 28; }
          break;
        }
        case "windup": this.vulnerable = true; if (this.timer <= 0) { this.state = "swipe"; this.timer = 16; this._pending = true; } break;
        case "swipe":
          if (this.timer === 8 && this._pending) { if (Math.abs(p.x - this.x) < 88 && Math.abs(p.y - this.y) < 48 && p.z < 30) p.takeDamage(this.cfg.dmg); this._pending = false; }
          if (this.timer <= 0) { this.state = "recover"; this.timer = 40; } break;
        case "windup_dash": this.vulnerable = false; if (this.timer <= 0) { this.state = "dash"; this.timer = 26; this.dashV = this.facing * 9; } break;
        case "dash":
          this.vulnerable = false; this.x += this.dashV;
          if (Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 50 && p.z < 30) { p.takeDamage(this.cfg.dmg + 4); this.dashV *= -0.4; }
          if (this.timer <= 0) { this.state = "recover"; this.timer = 46; } break;
        case "beam":
          this.vulnerable = true;
          if (this.timer <= 0) { projectiles.push(new Blob(this.x + this.facing * 30, this.y - 30, this.facing, this.cfg.dmg, this.kind === "krang" ? "#5cf" : "#ff0", 6)); Sound.shot(); this.state = "recover"; this.timer = 44; }
          break;
        case "stomp":
          this.vulnerable = false; this.z += (this.vz -= 0.6); if (this.vz === -0.6) this.vz = 8; // first frame jump
          if (this.z <= 0 && this.timer < 18) { this.z = 0; // landed
            projectiles.push(new Blob(this.x, this.y - 8, 1, this.cfg.dmg, "#ddd", 5)); projectiles.push(new Blob(this.x, this.y - 8, -1, this.cfg.dmg, "#ddd", 5));
            game.shake = 8; Sound.bossHit(); this.state = "recover"; this.timer = 40;
          }
          break;
        case "summon":
          this.vulnerable = true;
          if (this.timer <= 0) { for (let i = 0; i < 2; i++) game.enemies.push(new Foot(this.x + (i ? 40 : -40), this.y + 10, "rat", 0)); popText(this.x, this.y - 120, "RATS!", "#fa8"); Sound.warn(); this.state = "recover"; this.timer = 46; }
          break;
        case "recover": this.vulnerable = true; if (this.timer <= 0) { this.state = "approach"; this.timer = 40 + Math.random() * 40; } break;
      }
      this.x = clamp(this.x, camera.x + 40, camera.x + W - 40);
    }
    takeDamage(d) {
      const mult = this.state === "recover" ? 1.6 : 1;
      if (!this.vulnerable && this.state !== "recover") d *= 0.25;
      this.health -= d * mult; this.hitFlash = 7; Sound.bossHit();
      if (this.health <= 0) this.dead = true;
    }
    hurtbox() { return { x: this.x - 36, y: this.y - 84 - this.z, w: 72, h: 96 }; }
    draw(g) {
      g.save(); g.translate(toScreenX(this.x), this.y - this.z);
      if (this.facing === 1) g.scale(-1, 1);
      const scale = this.kind === "shredder" ? 1.5 : this.kind === "krang" ? 1.4 : 1.7;
      g.scale(scale, scale);
      if (this.state === "teleport") g.globalAlpha = 0.3 + 0.3 * Math.sin(this.frame);
      BOSS_DRAW[this.kind](g, this.frame, this.hitFlash > 0);
      g.restore();
      if (this.state.indexOf("windup") === 0 || this.state === "stomp") { g.fillStyle = "#ff0"; g.font = "bold 22px Trebuchet MS"; g.textAlign = "center"; if (Math.floor(this.frame) % 2 === 0) g.fillText("!", toScreenX(this.x), this.y - 130); }
    }
  }

  /* =======================================================================
     RIDER STAGE — pseudo-3D hoverboard run ("Neon Night Riders")
     ======================================================================= */
  const HORIZON = 150;
  const rider = { enemies: [], boss: null, spawnTimer: 0, defeated: 0, quota: 0, bossActive: false, dist: 0 };
  function riderProject(x, prog) {
    // prog 0 = horizon (far), 1 = foreground (near). x is a target screen x at near.
    const persp = prog * prog;
    const sy = HORIZON + (H - 40 - HORIZON) * persp;
    const sx = W / 2 + (x - W / 2) * (0.25 + 0.75 * persp);
    const scale = 0.3 + 1.0 * persp;
    return { sx, sy, scale };
  }
  class Rider {
    constructor(kind) {
      this.kind = kind; this.prog = 0; this.targetX = W / 2 + (Math.random() - 0.5) * 500;
      this.x = W / 2 + (Math.random() - 0.5) * 120; this.health = kind === "red" ? 24 : 14; this.dead = false;
      this.speed = 0.0042 + Math.random() * 0.0022; this.hitFlash = 0; this.frame = Math.random() * 10; this.hitPlayer = false;
      this.value = kind === "red" ? 250 : 150;
    }
    update(players) {
      this.frame += 0.4; if (this.hitFlash > 0) this.hitFlash--;
      this.prog += this.speed; this.x += (this.targetX - this.x) * 0.03;
      const pr = riderProject(this.x, this.prog);
      // collide with players near foreground
      if (this.prog > 0.86 && !this.hitPlayer) {
        for (const p of players) { if (p.out) continue; if (Math.abs(p.x - pr.sx) < 46 && Math.abs(p.y - pr.sy) < 60) { p.takeDamage(10); this.hitPlayer = true; burst(this.x, pr.sy, "#caa6f0", 8); } }
      }
      if (this.prog >= 1.06) this.dead = true;
    }
    takeDamage(d) { this.health -= d; this.hitFlash = 6; if (this.health <= 0) { this.dead = true; burst(this.x, riderProject(this.x, this.prog).sy, "#fff", 12); Sound.hit(); } else Sound.hit(); }
    draw(g) {
      const pr = riderProject(this.x, this.prog);
      g.save(); g.translate(pr.sx, pr.sy); g.scale(pr.scale, pr.scale);
      // hoverboard
      g.fillStyle = "#ff2db5"; g.beginPath(); g.ellipse(0, 40, 26, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(120,220,255,0.5)"; g.beginPath(); g.ellipse(0, 46, 22, 5, 0, 0, Math.PI * 2); g.fill();
      g.translate(0, -4);
      if (this.hitFlash > 0) drawFootFlash(g, this.frame, 1, this.kind); else drawFoot(g, this.frame, 1, this.kind, false);
      g.restore();
    }
  }
  class RiderBoss {
    constructor(cfg) { this.cfg = cfg; this.kind = cfg.kind; this.health = cfg.hp; this.maxHealth = cfg.hp; this.x = W / 2; this.y = HORIZON + 40; this.frame = 0; this.state = "hover"; this.timer = 120; this.dead = false; this.hitFlash = 0; this.z = 0; this.value = 2500; this.vulnerable = false; this.dir = 1; }
    update(players) {
      this.frame += 0.7; if (this.hitFlash > 0) this.hitFlash--; this.timer--;
      const p = nearestPlayer2(players, this.x);
      switch (this.state) {
        case "hover":
          this.vulnerable = false; this.x += this.dir * 2.4; if (this.x < 120 || this.x > W - 120) this.dir *= -1;
          this.y = HORIZON + 40 + Math.sin(this.frame * 0.1) * 10;
          if (this.timer <= 0) { this.state = Math.random() < 0.5 ? "swoop" : "spit"; this.timer = this.state === "swoop" ? 90 : 40; if (this.state === "swoop") this.tx = p ? p.x : W / 2; }
          break;
        case "swoop": // dive toward the foreground (becomes hittable)
          this.vulnerable = true;
          this.x += ((this.tx || W / 2) - this.x) * 0.04;
          this.y += (H - 130 - this.y) * 0.06;
          if (this.timer <= 0) { this.state = "retreat"; this.timer = 60; }
          break;
        case "retreat": this.vulnerable = true; this.y += (HORIZON + 40 - this.y) * 0.05; if (this.timer <= 0) { this.state = "hover"; this.timer = 80 + Math.random() * 60; } break;
        case "spit":
          this.vulnerable = false; this.y = HORIZON + 40;
          if (this.timer <= 0) { if (p) { const ang = Math.atan2(p.y - this.y, p.x - this.x); riderShots.push({ x: this.x, y: this.y, vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 5, dead: false, dmg: this.cfg.dmg }); Sound.shot(); } this.state = "hover"; this.timer = 70; }
          break;
      }
      this.x = clamp(this.x, 90, W - 90);
    }
    takeDamage(d) { if (!this.vulnerable) { d *= 0.2; } this.health -= d; this.hitFlash = 7; Sound.bossHit(); if (this.health <= 0) this.dead = true; }
    hurtbox() { return { x: this.x - 40, y: this.y - 40, w: 80, h: 80 }; }
    draw(g) {
      g.save(); g.translate(this.x, this.y);
      const sc = 1.6 + (this.y - HORIZON) / 300;
      g.scale(sc, sc);
      BOSS_DRAW[this.kind](g, this.frame, this.hitFlash > 0);
      g.restore();
      if (this.state === "spit") { g.fillStyle = "#ff0"; g.font = "bold 20px Trebuchet MS"; g.textAlign = "center"; if (Math.floor(this.frame) % 2 === 0) g.fillText("!", this.x, this.y - 56); }
    }
  }
  const riderShots = [];

  /* =======================================================================
     STAGES
     ======================================================================= */
  const STAGES = [
    { name: "BIG APPLE, 3 AM", theme: "city", length: 2600,
      encounters: [
        { camX: 300, spawns: [{ kind: "purple", n: 3 }] },
        { camX: 760, spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 1 }], pizza: true },
        { camX: 1250, spawns: [{ kind: "purple", n: 3 }, { kind: "blue", n: 2 }] },
      ], boss: { kind: "bebop", name: "BEBOP", hp: 220, dmg: 12 } },
    { name: "SEWER SURFIN'", theme: "sewer", length: 2600,
      encounters: [
        { camX: 320, spawns: [{ kind: "purple", n: 2 }, { kind: "blue", n: 2 }] },
        { camX: 800, spawns: [{ kind: "red", n: 2 }, { kind: "purple", n: 2 }], pizza: true },
        { camX: 1280, spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 1 }, { kind: "blue", n: 1 }] },
      ], boss: { kind: "rocksteady", name: "ROCKSTEADY", hp: 280, dmg: 13 } },
    { name: "NEON NIGHT RIDERS", theme: "rider", quota: 16,
      boss: { kind: "baxter", name: "BAXTER STOCKMAN", hp: 240, dmg: 11 } },
    { name: "SEWER LAIR OF THE RAT KING", theme: "sewer", length: 2600,
      encounters: [
        { camX: 320, spawns: [{ kind: "rat", n: 3 }, { kind: "purple", n: 2 }] },
        { camX: 800, spawns: [{ kind: "red", n: 2 }, { kind: "rat", n: 3 }], pizza: true },
        { camX: 1280, spawns: [{ kind: "purple", n: 2 }, { kind: "red", n: 2 }, { kind: "blue", n: 1 }] },
      ], boss: { kind: "ratking", name: "THE RAT KING", hp: 300, dmg: 12 } },
    { name: "TECHNODROME: LET'S KICK SHELL", theme: "techno", length: 3000,
      encounters: [
        { camX: 340, spawns: [{ kind: "red", n: 2 }, { kind: "blue", n: 2 }] },
        { camX: 820, spawns: [{ kind: "purple", n: 3 }, { kind: "red", n: 2 }], pizza: true },
        { camX: 1320, spawns: [{ kind: "red", n: 3 }, { kind: "blue", n: 2 }], pizza: true },
        { camX: 1820, spawns: [{ kind: "krang_boss" }] }, // mid-boss Krang handled as boss below
      ], boss: { kind: "shredder", name: "SHREDDER", hp: 360, dmg: 14 }, midBoss: { kind: "krang", name: "KRANG", hp: 300, dmg: 13 } },
  ];

  /* =======================================================================
     BACKGROUNDS
     ======================================================================= */
  function drawBackground(g, theme) {
    const cx = camera.x;
    if (theme === "city") {
      const sky = g.createLinearGradient(0, 0, 0, FLOOR_TOP); sky.addColorStop(0, "#0b1030"); sky.addColorStop(1, "#3a2a5a");
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR_TOP);
      g.fillStyle = "#f5f3c0"; g.beginPath(); g.arc(W - 120, 70, 34, 0, Math.PI * 2); g.fill();
      for (let i = -1; i < 14; i++) { const bx = ((i * 150 - cx * 0.3) % 2250 + 2250) % 2250 - 100; const bh = 90 + ((i * 53) % 90); g.fillStyle = "#1b2240"; g.fillRect(bx, FLOOR_TOP - bh, 120, bh); g.fillStyle = "#ffd86b"; for (let wy = FLOOR_TOP - bh + 12; wy < FLOOR_TOP - 8; wy += 20) for (let wx = bx + 10; wx < bx + 105; wx += 22) if ((wx + wy + i) % 3 === 0) g.fillRect(wx, wy, 8, 10); }
      for (let i = -1; i < 10; i++) { const bx = ((i * 230 - cx * 0.6) % 2530 + 2530) % 2530 - 120; const bh = 150 + ((i * 71) % 80); g.fillStyle = "#121830"; g.fillRect(bx, FLOOR_TOP - bh, 180, bh); }
      drawFloor(g, "#2a2a30", "#141418");
    } else if (theme === "sewer") {
      g.fillStyle = "#0c1a14"; g.fillRect(0, 0, W, FLOOR_TOP);
      for (let i = -1; i < 8; i++) { const bx = ((i * 320 - cx * 0.5) % 2880 + 2880) % 2880 - 160; g.strokeStyle = "#2a4a3a"; g.lineWidth = 20; g.beginPath(); g.arc(bx + 130, FLOOR_TOP + 40, 150, Math.PI, Math.PI * 2); g.stroke(); }
      g.fillStyle = "#3a5a4a"; g.fillRect(0, 150, W, 16);
      for (let x = 80 - (cx * 0.5 % 200); x < W + 100; x += 200) { g.fillStyle = "#4a6a5a"; g.beginPath(); g.arc(x, 158, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = "#16261c"; g.beginPath(); g.arc(x, 158, 5, 0, Math.PI * 2); g.fill(); }
      drawFloor(g, "#1f2a22", "#0f1712"); g.fillStyle = "rgba(60,180,80,0.18)"; g.fillRect(0, FLOOR_TOP, W, 12);
    } else { // techno
      const sky = g.createLinearGradient(0, 0, 0, FLOOR_TOP); sky.addColorStop(0, "#14001a"); sky.addColorStop(1, "#2a0030");
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR_TOP);
      g.strokeStyle = "rgba(255,40,200,0.25)"; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) { const lx = ((i * 120 - cx * 0.4) % 2280 + 2280) % 2280 - 60; g.beginPath(); g.moveTo(lx, 30); g.lineTo(lx, 120); g.lineTo(lx + 40, 160); g.stroke(); g.fillStyle = "#ff28c8"; g.fillRect(lx + 38, 158, 5, 5); }
      for (let i = -1; i < 9; i++) { const bx = ((i * 260 - cx * 0.6) % 2600 + 2600) % 2600 - 130; g.fillStyle = "#220028"; g.fillRect(bx, 80, 200, FLOOR_TOP - 80); g.fillStyle = "rgba(0,220,255,0.15)"; g.fillRect(bx + 16, 100, 168, 120); }
      drawFloor(g, "#241026", "#120612");
    }
  }
  function drawFloor(g, c0, c1) {
    const fg = g.createLinearGradient(0, FLOOR_TOP, 0, H); fg.addColorStop(0, c0); fg.addColorStop(1, c1);
    g.fillStyle = fg; g.fillRect(0, FLOOR_TOP, W, H - FLOOR_TOP);
    g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 2; const off = camera.x % 80;
    for (let x = -off; x < W; x += 80) { g.beginPath(); g.moveTo(x, FLOOR_TOP); g.lineTo(W / 2 + (x - W / 2) * 2.2, H); g.stroke(); }
    for (let j = 1; j < 4; j++) { const y = FLOOR_TOP + (j / 4) * (H - FLOOR_TOP); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }
  function drawRiderBg(g) {
    const sky = g.createLinearGradient(0, 0, 0, HORIZON); sky.addColorStop(0, "#10002a"); sky.addColorStop(1, "#5a0d6a");
    g.fillStyle = sky; g.fillRect(0, 0, W, HORIZON);
    // sun grid horizon
    g.fillStyle = "#ff5ea8"; g.beginPath(); g.arc(W / 2, HORIZON, 60, Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = "#1a0030"; g.lineWidth = 3; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(W / 2 - 60, HORIZON - i * 10); g.lineTo(W / 2 + 60, HORIZON - i * 10); g.stroke(); }
    // ground
    const grd = g.createLinearGradient(0, HORIZON, 0, H); grd.addColorStop(0, "#1a0833"); grd.addColorStop(1, "#0a0418");
    g.fillStyle = grd; g.fillRect(0, HORIZON, W, H - HORIZON);
    // moving perspective road
    g.strokeStyle = "rgba(0,240,255,0.5)"; g.lineWidth = 2;
    const scroll = (rider.dist * 0.06) % 1;
    for (let i = 0; i < 14; i++) {
      const t = ((i + scroll) / 14); const persp = t * t; const y = HORIZON + (H - HORIZON) * persp;
      g.globalAlpha = 0.2 + 0.5 * persp; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.globalAlpha = 1;
    for (let l = -3; l <= 3; l++) { g.strokeStyle = "rgba(255,40,200,0.5)"; g.beginPath(); g.moveTo(W / 2 + l * 40, HORIZON); g.lineTo(W / 2 + l * 260, H); g.stroke(); }
  }

  /* =======================================================================
     GAME STATE + HELPERS
     ======================================================================= */
  const STATE = { MENU: 0, PLAY: 1, CLEAR: 2, OVER: 3, WIN: 4 };
  const game = {
    state: STATE.MENU, mode: "brawl", players: [], numPlayers: 1, selected: [null, null], activeSlot: 0,
    stageIdx: 0, stage: null, enemies: [], boss: null,
    encIdx: 0, encActive: false, spawnQueue: [], spawnTimer: 0, curEnc: null, midBossPending: false,
    score: 0, lives: 3, banner: 0, bannerText: "", bannerSub: "", shake: 0, clearTimer: 0,
  };
  function alivePlayers() { return game.players.filter((p) => !p.out); }
  function nearestPlayer(x) { let best = null, bd = 1e9; for (const p of game.players) { if (p.out) continue; const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } } return best; }
  function nearestPlayer2(players, x) { let best = null, bd = 1e9; for (const p of players) { if (p.out) continue; const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } } return best; }

  /* ---------------- brawl stage flow ---------------- */
  function loadStage(i) {
    const s = STAGES[i]; game.stage = s; game.stageIdx = i;
    game.enemies = []; game.boss = null; projectiles.length = 0; pickups.length = 0; fx.length = 0;
    riderShots.length = 0;
    game.encIdx = 0; game.encActive = false; game.spawnQueue = []; game.midBossPending = false;
    document.getElementById("boss-hud").classList.add("hidden");
    document.getElementById("wave").textContent = s.name;
    game.banner = 150; game.bannerText = "STAGE " + (i + 1); game.bannerSub = s.name;
    Sound.warn();
    if (s.theme === "rider") {
      game.mode = "rider"; camera.x = 0; camera.limit = 0;
      rider.enemies = []; rider.boss = null; rider.spawnTimer = 40; rider.defeated = 0; rider.quota = s.quota; rider.bossActive = false; rider.dist = 0;
      for (const p of game.players) { p.x = W / 2 + (p.idx ? 70 : -70); p.y = H - 100; p.z = 0; }
    } else {
      game.mode = "brawl";
      camera.x = 0; camera.limit = s.encounters[0].camX;
      for (const p of game.players) { p.x = 120 + p.idx * 60; p.y = 430 + p.idx * 20; p.z = 0; }
    }
  }
  function startEncounter(enc) {
    game.curEnc = enc;
    // mid-boss marker encounter
    if (enc.spawns && enc.spawns[0] && enc.spawns[0].kind === "krang_boss") { spawnMidBoss(); game.encActive = true; game.spawnQueue = []; return; }
    game.encActive = true; game.spawnQueue = [];
    for (const sp of enc.spawns) for (let k = 0; k < sp.n; k++) game.spawnQueue.push(sp.kind);
    game.spawnTimer = 0;
  }
  function spawnFromQueue() {
    if (game.spawnQueue.length === 0 || game.enemies.length >= 5) return;
    if (--game.spawnTimer > 0) return;
    const kind = game.spawnQueue.shift(); const side = Math.random() < 0.5 ? -1 : 1;
    const x = side === -1 ? camera.x - 30 : camera.x + W + 30; const y = FLOOR_TOP + Math.random() * (FLOOR_BOT - FLOOR_TOP);
    game.enemies.push(new Foot(x, y, kind, game.stageIdx * 6)); game.spawnTimer = 40;
  }
  function spawnMidBoss() {
    const b = game.stage.midBoss; game.boss = new Boss(b, camera.x + W - 90);
    document.getElementById("boss-name").textContent = b.name; document.getElementById("boss-fill").style.width = "100%";
    document.getElementById("boss-hud").classList.remove("hidden");
    game.banner = 90; game.bannerText = b.name + "!"; game.bannerSub = ""; game.midBossPending = true; Sound.warn();
  }
  function spawnBoss() {
    const b = game.stage.boss; game.boss = new Boss(b, camera.x + W - 90);
    document.getElementById("boss-name").textContent = b.name; document.getElementById("boss-fill").style.width = "100%";
    document.getElementById("boss-hud").classList.remove("hidden");
    game.banner = 90; game.bannerText = b.name + "!"; game.bannerSub = ""; Sound.warn();
  }

  function beginGame() {
    game.players = [];
    const n = game.numPlayers;
    if (n === 1) game.players.push(new Player(game.selected[0], 0, SCHEMES.solo, 0));
    else { game.players.push(new Player(game.selected[0], 0, SCHEMES.p1, 0)); game.players.push(new Player(game.selected[1], 1, SCHEMES.p2, 1)); }
    game.score = 0; game.lives = n === 2 ? 5 : 3; game.state = STATE.PLAY;
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("hud").classList.remove("hidden");
    document.getElementById("pinfo2").classList.toggle("hidden", n === 1);
    if (touchActive) document.getElementById("touch").classList.remove("hidden");
    for (let i = 0; i < game.players.length; i++) updatePortrait(i, game.players[i].type);
    loadStage(0);
  }
  function playerDown(p) {
    if (game.lives > 0) { game.lives--; p.health = p.cfg.maxHealth; p.hitTimer = 90; p.flash = 90; p.z = 0; p.spinTimer = 0; p.grabbed = null; p.x = camera.x + 100 + p.idx * 50; p.y = game.mode === "rider" ? H - 100 : 440; }
    else { p.out = true; popText(game.mode === "rider" ? p.x : p.x, p.y - 80, "OUT!", "#f55"); if (alivePlayers().length === 0) endGame(false); }
  }
  function endGame(won) {
    game.state = won ? STATE.WIN : STATE.OVER;
    document.getElementById("hud").classList.add("hidden"); document.getElementById("boss-hud").classList.add("hidden");
    document.getElementById("touch").classList.add("hidden");
    document.getElementById("go-title").textContent = won ? "YOU SAVED THE CITY!" : "GAME OVER";
    document.getElementById("go-title").style.color = won ? "#4ddb4d" : "#ff4d4d";
    document.getElementById("go-score").textContent = "Final Score: " + game.score + (won ? "   •   Cowabunga!" : "   •   Reached Stage " + (game.stageIdx + 1));
    document.getElementById("gameover").classList.remove("hidden");
    if (won) Sound.clear(); else Sound.die();
  }
  function stageCleared() {
    if (game.stageIdx + 1 >= STAGES.length) { endGame(true); return; }
    game.state = STATE.CLEAR; game.score += 5000; Sound.clear();
    game.bannerText = "STAGE CLEAR!"; game.bannerSub = "+5000"; game.clearTimer = 160;
  }

  /* =======================================================================
     UPDATE
     ======================================================================= */
  function update() {
    // feed inputs
    for (const p of game.players) p.in = readInput(p.idx, p.scheme, p.padIndex);

    if (game.state === STATE.CLEAR) { if (--game.clearTimer <= 0) { game.state = STATE.PLAY; loadStage(game.stageIdx + 1); } return; }
    if (game.state !== STATE.PLAY) return;

    if (game.mode === "rider") return updateRider();

    for (const p of game.players) p.update();

    // camera (scrolls right; follows furthest-right alive player)
    let lead = 0; for (const p of alivePlayers()) lead = Math.max(lead, p.x);
    const want = lead - W * 0.42;
    camera.x = Math.max(0, Math.max(camera.x, Math.min(camera.limit, want)));

    // encounter gates
    if (!game.encActive && !game.boss) {
      if (game.encIdx < game.stage.encounters.length) { const enc = game.stage.encounters[game.encIdx]; if (camera.x >= camera.limit - 2) startEncounter(enc); }
      else { camera.limit = game.stage.length - W; if (camera.x >= camera.limit - 2 && !game.boss) spawnBoss(); }
    }
    if (game.encActive && !game.midBossPending) {
      spawnFromQueue();
      if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
        game.encActive = false;
        if (game.curEnc.pizza) pickups.push(new Pizza(camera.x + W / 2, 430));
        game.encIdx++;
        camera.limit = game.encIdx < game.stage.encounters.length ? game.stage.encounters[game.encIdx].camX : game.stage.length - W;
      }
    }

    // player melee + grab vs enemies
    const hbs = game.players.map((p) => p.hitbox());
    for (const e of game.enemies) {
      e.update(game.players, game.enemies);
      for (let pi = 0; pi < game.players.length; pi++) {
        const p = game.players[pi]; if (p.out) continue;
        if (!p.grabbed && p.spinTimer === 0 && p.attackTimer === 0 && e.grabbable() && Math.abs(p.x - e.x) < 40 && Math.abs(p.y - e.y) < 26 && (e.x - p.x) * p.facing >= -6) p.startGrab(e);
        const hb = hbs[pi];
        if (hb && !e.dead && e.state !== "thrown" && e.state !== "grabbed") {
          const eb = { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h + 10 };
          if (hb.x < eb.x + eb.w && hb.x + hb.w > eb.x && hb.y < eb.y + eb.h && hb.y + hb.h > eb.y && (hb.spin || !p.didHit)) {
            e.takeDamage(hb.dmg, p.facing, false); if (!hb.spin) p.didHit = true;
            popText(e.x, e.y - 54, "-" + Math.round(hb.dmg), hb.kick ? "#9cf" : "#fff"); game.shake = 4;
            if (hb.finisher || hb.kick) e.knockdown();
            if (!hb.spin) p.special = Math.min(100, p.special + 5);
            if (e.dead) { game.score += e.value; popText(e.x, e.y - 64, "+" + e.value, "#ffd23f"); }
          }
        }
      }
    }
    game.enemies = game.enemies.filter((e) => !e.dead);

    // boss
    if (game.boss) {
      const b = game.boss; b.update();
      for (let pi = 0; pi < game.players.length; pi++) {
        const p = game.players[pi], hb = hbs[pi]; if (!hb || p.out || b.state === "intro") continue;
        const bb = b.hurtbox();
        if (hb.x < bb.x + bb.w && hb.x + hb.w > bb.x && hb.y < bb.y + bb.h && hb.y + hb.h > bb.y && (hb.spin || !p.didHit)) {
          b.takeDamage(hb.dmg); if (!hb.spin) p.didHit = true; game.shake = 5; p.special = Math.min(100, p.special + 4);
          popText(b.x, b.y - 130, "-" + Math.round(hb.dmg * (b.state === "recover" ? 1.6 : 1)), "#ff0");
        }
      }
      document.getElementById("boss-fill").style.width = Math.max(0, (b.health / b.maxHealth) * 100) + "%";
      if (b.dead) {
        game.score += b.value; popText(b.x, b.y - 100, "+" + b.value, "#ffd23f"); burst(b.x, b.y - 40, "#ff0", 30);
        const wasMid = game.midBossPending; game.boss = null;
        if (wasMid) { // resume stage after mid-boss
          game.midBossPending = false; game.encActive = false; document.getElementById("boss-hud").classList.add("hidden");
          game.encIdx++; camera.limit = game.encIdx < game.stage.encounters.length ? game.stage.encounters[game.encIdx].camX : game.stage.length - W;
          pickups.push(new Pizza(camera.x + W / 2, 430));
        } else stageCleared();
      }
    }

    for (const pr of projectiles) pr.update();
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
    for (const pk of pickups) pk.update();
    for (let i = pickups.length - 1; i >= 0; i--) if (pickups[i].dead) pickups.splice(i, 1);

    for (const p of game.players) if (!p.out && p.health <= 0) playerDown(p);
    if (game.shake > 0) game.shake--; if (game.banner > 0) game.banner--;
    updateFx(); updateHUD();
  }

  function updateRider() {
    rider.dist += 4;
    for (const p of game.players) p.update();

    // spawn riders until quota, then boss
    if (!rider.bossActive) {
      if (rider.defeated < rider.quota) {
        if (--rider.spawnTimer <= 0 && rider.enemies.length < 5) {
          const kind = Math.random() < 0.3 ? "red" : "purple";
          rider.enemies.push(new Rider(kind)); rider.spawnTimer = 36 - Math.min(18, rider.defeated);
        }
      } else if (rider.enemies.length === 0) {
        rider.bossActive = true; rider.boss = new RiderBoss(game.stage.boss);
        document.getElementById("boss-name").textContent = game.stage.boss.name; document.getElementById("boss-fill").style.width = "100%";
        document.getElementById("boss-hud").classList.remove("hidden");
        game.banner = 90; game.bannerText = game.stage.boss.name + "!"; game.bannerSub = ""; Sound.warn();
      }
    }

    const hbs = game.players.map((p) => p.hitbox());
    for (const e of rider.enemies) {
      e.update(game.players);
      const pr = riderProject(e.x, e.prog);
      for (let pi = 0; pi < game.players.length; pi++) {
        const p = game.players[pi], hb = hbs[pi]; if (!hb || p.out) continue;
        if (e.prog > 0.55 && Math.abs(pr.sx - p.x) < 64 && Math.abs(pr.sy - p.y) < 70 && (hb.spin || !p.didHit)) {
          e.takeDamage(hb.spin ? 12 : 16); if (!hb.spin) p.didHit = true; game.shake = 3;
          if (e.dead) { rider.defeated++; game.score += e.value; popText(e.x, pr.sy - 30, "+" + e.value, "#ffd23f"); }
        }
      }
    }
    rider.enemies = rider.enemies.filter((e) => !e.dead);
    rider.enemies.sort((a, b) => a.prog - b.prog);

    // rider boss shots
    for (const s of riderShots) { s.x += s.vx; s.y += s.vy; const p = nearestPlayer2(game.players, s.x); if (p && Math.abs(p.x - s.x) < 28 && Math.abs(p.y - s.y) < 32) { p.takeDamage(s.dmg); s.dead = true; } if (s.y > H || s.x < -20 || s.x > W + 20) s.dead = true; }
    for (let i = riderShots.length - 1; i >= 0; i--) if (riderShots[i].dead) riderShots.splice(i, 1);

    if (rider.boss) {
      const b = rider.boss; b.update(game.players);
      const bb = b.hurtbox();
      for (let pi = 0; pi < game.players.length; pi++) {
        const p = game.players[pi], hb = hbs[pi]; if (!hb || p.out) continue;
        // in rider mode hb uses player x/y screen coords
        if (hb.x < bb.x + bb.w && hb.x + hb.w > bb.x && p.y - 40 < bb.y + bb.h && p.y + 20 > bb.y && (hb.spin || !p.didHit)) {
          b.takeDamage(hb.dmg); if (!hb.spin) p.didHit = true; game.shake = 4; popText(b.x, b.y - 50, "-" + Math.round(hb.dmg), "#ff0");
        }
      }
      document.getElementById("boss-fill").style.width = Math.max(0, (b.health / b.maxHealth) * 100) + "%";
      if (b.dead) { game.score += b.value; burst(b.x, b.y, "#ff0", 30); rider.boss = null; stageCleared(); }
    }

    for (const p of game.players) if (!p.out && p.health <= 0) playerDown(p);
    if (game.shake > 0) game.shake--; if (game.banner > 0) game.banner--;
    updateFx(); updateHUD();
  }

  function updateHUD() {
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i], s = i === 0 ? "" : "2";
      const hf = document.getElementById("health-fill" + s), sf = document.getElementById("special-fill" + s);
      if (hf) hf.style.width = Math.max(0, (p.health / p.cfg.maxHealth) * 100) + "%";
      if (sf) sf.style.width = p.special + "%";
    }
    document.getElementById("score").textContent = "SCORE " + game.score;
    document.getElementById("lives").textContent = "🐢 x " + game.lives;
  }

  /* =======================================================================
     RENDER
     ======================================================================= */
  function render() {
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);

    if (game.mode === "rider") renderRider();
    else renderBrawl();

    // banners
    if (game.banner > 0 || game.state === STATE.CLEAR) {
      ctx.globalAlpha = game.state === STATE.CLEAR ? 1 : Math.min(1, game.banner / 30);
      ctx.fillStyle = "#ffd23f"; ctx.font = "bold 48px Trebuchet MS"; ctx.textAlign = "center";
      ctx.fillText(game.bannerText, W / 2, H / 2 - 16);
      ctx.font = "bold 22px Trebuchet MS"; ctx.fillStyle = "#fff"; ctx.fillText(game.bannerSub, W / 2, H / 2 + 18);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function renderBrawl() {
    drawBackground(ctx, game.stage ? game.stage.theme : "city");
    if (game.state === STATE.PLAY || game.state === STATE.CLEAR) {
      const ents = [...game.enemies, ...pickups, ...game.players.filter((p) => !p.out)];
      if (game.boss) ents.push(game.boss);
      ents.sort((a, b) => (a.y || 0) - (b.y || 0));
      for (const e of ents) e.draw(ctx);
      for (const pr of projectiles) pr.draw(ctx);
      drawFx(ctx);
      if (!game.encActive && !game.boss && camera.x < camera.limit - 4 && game.banner <= 0) { const a = Math.sin(performance.now() / 150) * 6; ctx.fillStyle = "#ffd23f"; ctx.font = "bold 30px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText("GO  ▶", W - 30 + a, 120); }
      if (game.encActive && !game.midBossPending && Math.floor(performance.now() / 350) % 2 === 0) { ctx.fillStyle = "rgba(255,60,60,0.9)"; ctx.font = "bold 20px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("◆ DEFEAT THE FOOT CLAN ◆", W / 2, 116); }
    }
  }
  function renderRider() {
    drawRiderBg(ctx);
    if (game.state === STATE.PLAY || game.state === STATE.CLEAR) {
      for (const e of rider.enemies) e.draw(ctx);
      if (rider.boss) rider.boss.draw(ctx);
      // players (draw after far enemies; they're in foreground)
      for (const p of game.players.filter((p) => !p.out).sort((a, b) => a.y - b.y)) p.draw(ctx);
      // boss shots
      ctx.fillStyle = "#6cff4a"; for (const s of riderShots) { ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill(); }
      drawFx(ctx);
      // progress
      ctx.fillStyle = "#ffd23f"; ctx.font = "bold 16px Trebuchet MS"; ctx.textAlign = "center";
      if (!rider.bossActive) ctx.fillText("RIDERS DOWN: " + rider.defeated + " / " + rider.quota, W / 2, 116);
    }
  }

  function loop() { update(); render(); requestAnimationFrame(loop); }

  /* =======================================================================
     MENU
     ======================================================================= */
  function refreshSlots() {
    const slotsEl = document.getElementById("slots");
    slotsEl.classList.toggle("hidden", game.numPlayers === 1);
    document.getElementById("controls-1p").classList.toggle("hidden", game.numPlayers !== 1);
    document.getElementById("controls-2p").classList.toggle("hidden", game.numPlayers !== 2);
    if (game.numPlayers === 2) {
      slotsEl.innerHTML = "";
      for (let i = 0; i < 2; i++) {
        const sel = game.selected[i];
        const d = document.createElement("div");
        d.className = "slot" + (i === game.activeSlot ? " active" : "") + (sel ? " filled" : "");
        d.style.color = sel ? TURTLES[sel].color : "";
        d.textContent = "P" + (i + 1) + ": " + (sel ? TURTLES[sel].short : "—");
        slotsEl.appendChild(d);
      }
    }
    updateStartBtn();
  }
  function updateStartBtn() {
    const btn = document.getElementById("start-btn");
    if (game.numPlayers === 1) { btn.disabled = !game.selected[0]; btn.textContent = game.selected[0] ? "FIGHT AS " + TURTLES[game.selected[0]].short : "SELECT A TURTLE"; }
    else { const ready = game.selected[0] && game.selected[1]; btn.disabled = !ready; btn.textContent = ready ? "START CO-OP!" : "PICK P" + (game.activeSlot + 1) + "'S TURTLE"; }
  }
  function pickTurtle(key) {
    if (game.numPlayers === 1) { game.selected[0] = key; document.querySelectorAll(".turtle-card").forEach((x) => x.classList.toggle("selected", x.dataset.key === key)); }
    else { game.selected[game.activeSlot] = key; game.activeSlot = game.activeSlot === 0 ? 1 : 0; }
    refreshSlots();
  }
  function buildRoster() {
    const roster = document.getElementById("roster");
    Object.keys(TURTLES).forEach((key) => {
      const t = TURTLES[key];
      const card = document.createElement("div"); card.className = "turtle-card"; card.dataset.key = key;
      const c = document.createElement("canvas"); c.width = 90; c.height = 96; const g = c.getContext("2d"); g.translate(45, 52); drawTurtle(g, t.color, 0, 1.5, "idle");
      card.appendChild(c);
      card.insertAdjacentHTML("beforeend", `<div class="tname" style="color:${t.color}">${t.short}</div><div class="tweap">${t.weap}</div><div class="tstat">${t.desc}<br/>PWR ${t.power} · RNG ${t.range}</div>`);
      card.addEventListener("click", () => pickTurtle(key));
      roster.appendChild(card);
    });
  }
  function updatePortrait(idx, type) {
    const t = TURTLES[type]; const el = document.getElementById(idx === 0 ? "portrait" : "portrait2"); if (!el) return;
    const c = document.createElement("canvas"); c.width = 42; c.height = 42; const g = c.getContext("2d"); g.translate(21, 30); drawTurtle(g, t.color, 0, 0.8, "idle");
    el.style.background = "#1d3d1d"; el.innerHTML = ""; el.appendChild(c);
  }

  document.querySelectorAll(".mode-btn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((x) => x.classList.remove("selected")); b.classList.add("selected");
    game.numPlayers = parseInt(b.dataset.np, 10); game.activeSlot = 0; game.selected = [null, null];
    document.querySelectorAll(".turtle-card").forEach((x) => x.classList.remove("selected"));
    document.getElementById("pick-label").textContent = game.numPlayers === 2 ? "Pick a turtle for each player:" : "Choose your turtle:";
    refreshSlots();
  }));
  document.getElementById("start-btn").addEventListener("click", () => { const ready = game.numPlayers === 1 ? game.selected[0] : (game.selected[0] && game.selected[1]); if (ready) { Sound.init(); beginGame(); } });
  document.getElementById("restart-btn").addEventListener("click", () => { document.getElementById("gameover").classList.add("hidden"); document.getElementById("menu").classList.remove("hidden"); });

  setupTouch();
  buildRoster();
  refreshSlots();
  loop();

  /* Debug hook — only with "#debug" in URL. No effect on normal play. */
  if (typeof location !== "undefined" && location.hash.indexOf("debug") !== -1) {
    window.__TMNT = {
      game, rider,
      start(np, a, b) { game.numPlayers = np || 1; game.selected = [a || "leo", b || "raph"]; Sound.init(); beginGame(); },
      loadStage,
      skipToBoss() {
        if (game.state !== STATE.PLAY) return;
        if (game.mode === "rider") { rider.defeated = rider.quota; rider.enemies = []; return; }
        game.enemies = []; game.spawnQueue = []; game.encActive = false; game.midBossPending = false;
        game.encIdx = game.stage.encounters.length; camera.limit = game.stage.length - W; camera.x = camera.limit;
        for (const p of game.players) p.x = camera.x + 200 + p.idx * 50;
      },
      hurtBoss(n) { if (game.boss) game.boss.takeDamage(n); if (rider.boss) rider.boss.health -= n; },
    };
  }
})();
