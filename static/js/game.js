"use strict";
/* Yellow Duck River Run — Canvas 2D. Mundo lógico de altura 540; largura se adapta à tela. */
window.DuckRun = function (canvas, hooks) {
  const ctx = canvas.getContext("2d");
  let W = 960; const H = 540, WATER = 330, DX = 250, G = 1900, JUMP = 600, DIVE = 94;
  const sfx = (n, ...a) => { try { if (window.SFX) window.SFX[n](...a); } catch (e) { /* áudio indisponível */ } };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return "rgb(" + A.map((v, i) => Math.round(lerp(v, B[i], t))).join(",") + ")"; };
  const stars = Array.from({ length: 110 }, () => ({ x: rnd(0, 1300), y: rnd(0, WATER - 70), r: rnd(.6, 1.8), f: rnd(0, 6) }));

  // Relógio do ciclo dia/noite: contínuo durante a sessão (não reinicia no game over nem ao fechar o jogo)
  let t0 = Date.now();
  try { const v = sessionStorage.getItem("sq_t0"); if (v) t0 = +v || t0; else sessionStorage.setItem("sq_t0", String(t0)); } catch (e) { /* sem storage */ }
  const phase = () => 0.5 - 0.5 * Math.cos(((Date.now() - t0) / 150000) * Math.PI * 2); // 0 = pôr do sol, 1 = noite

  let s, best = 0, raf = 0, last = 0, running = false, diving = false;
  function reset() {
    s = { t: 0, x: 0, cam: -DX, speed: 340, h: 0, vy: 0, depth: 0, obs: [], parts: [], rip: [], spawn: 1.6, over: false, shake: 0, death: null, nextPt: 100, ripT: 0, ambT: 0, final: 0 };
  }
  const score = () => Math.floor(s.x / 25);
  const duckY = () => WATER - 14 - s.h + s.depth * DIVE;

  /* ---------- entrada ---------- */
  function setDive(v) { if (v && !diving && s.h === 0 && !s.over) sfx("dive"); diving = v; }
  function jump() { if (!s.over && s.h === 0 && s.depth < .3) { s.vy = JUMP; s.h = .01; sfx("jump"); } }
  function onKey(e) {
    if (!running) return;
    const k = e.key;
    if (e.type === "keydown") {
      if (s.over) { if (s.death && s.death.done && (k === "Enter" || k === " " || k === "r" || k === "R")) { e.preventDefault(); restart(); } return; }
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); if (!e.repeat) jump(); }
      if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); setDive(true); }
    } else if (k === "ArrowDown" || k === "s" || k === "S") diving = false;
  }
  function onPointer(e) {
    if (e.type !== "pointerdown") { diving = false; return; }
    if (s.over) return;
    const r = canvas.getBoundingClientRect();
    if (e.clientY - r.top < r.height / 2) jump(); else setDive(true);
  }
  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKey);
  ["pointerdown", "pointerup", "pointercancel"].forEach((n) => canvas.addEventListener(n, onPointer));
  document.addEventListener("visibilitychange", () => {
    if (!running) return;
    sfx(document.hidden ? "ambienceStop" : "ambienceStart");
  });

  /* ---------- partículas ---------- */
  function splash(x, y, n) { for (let i = 0; i < n; i++) s.parts.push({ x, y, vx: rnd(-120, 120), vy: rnd(-260, -80), life: rnd(.4, .8), r: rnd(1.5, 3.5), k: 0 }); }
  function bubble(x, y) { s.parts.push({ x, y, vx: rnd(-20, 20), vy: rnd(-70, -30), life: rnd(.6, 1.1), r: rnd(2, 4), k: 1 }); }
  function burst(x, y, n, c, sp, r0, r1) { for (let i = 0; i < n; i++) s.parts.push({ x, y, vx: rnd(-sp, sp), vy: rnd(-sp * 1.6, -sp * .2), life: rnd(.5, 1), r: rnd(r0, r1), k: 3, c }); }

  /* ---------- simulação ---------- */
  function update(dt) {
    s.t += dt;
    s.parts = s.parts.filter((p) => (p.life -= dt) > 0);
    s.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k !== 1) p.vy += 700 * dt; });
    s.rip.forEach((r) => (r.age += dt)); s.rip = s.rip.filter((r) => r.age < 1.2);
    if (s.t - s.ambT > .25) { s.ambT = s.t; sfx("ambience", phase()); }
    if (s.over) { s.shake = Math.max(0, s.shake - dt * 2.5); updateDeath(dt); return; }

    s.speed = 340 + Math.min(320, s.x / 60);
    s.x += s.speed * dt;
    const target = s.x - DX - s.speed * 0.12;
    s.cam += (target - s.cam) * (1 - Math.exp(-6 * dt));
    s.cam = clamp(s.cam, s.x - (W - 220), s.x - 120);

    if (s.h > 0 || s.vy > 0) {
      s.vy -= (G + (diving ? 2600 : 0)) * dt;
      s.h += s.vy * dt;
      if (s.h <= 0) { s.h = 0; s.vy = 0; splash(s.x, WATER, 10); sfx("splash"); }
    }
    s.depth += ((diving && s.h === 0 ? 1 : 0) - s.depth) * (1 - Math.exp(-12 * dt));
    if (s.depth > .5 && Math.random() < dt * 16) bubble(s.x - 20, WATER + 20 + s.depth * DIVE);
    s.ripT -= dt;
    if (s.ripT <= 0 && s.h === 0 && s.depth < .5) { s.ripT = .13; s.rip.push({ x: s.x - 22, age: 0 }); }
    if (score() >= s.nextPt) { s.nextPt += 100; sfx("point"); }

    s.spawn -= dt;
    if (s.spawn <= 0) {
      s.spawn = rnd(1.0, 1.7) - Math.min(.35, s.x / 60000);
      const r = Math.random(), x = s.cam + W + 120;
      if (r < .4) s.obs.push({ k: "log", x, w: rnd(110, 140), y0: WATER - 70, y1: WATER + 36, v: 80 });
      else if (r < .7) s.obs.push({ k: "croc", x, w: 130, y0: WATER - 10, y1: WATER + 40, v: 110, ph: rnd(0, 6), e: .3 });
      else s.obs.push({ k: "bird", x, w: 54, y0: WATER - 60, y1: WATER - 20, v: 170, ph: rnd(0, 6) });
    }
    s.obs.forEach((o) => {
      o.x -= o.v * dt;
      if (o.k === "croc") { // espreita: só os olhos; levanta a cabeça quando o pato se aproxima
        const ahead = o.x - s.x, tgt = ahead > -20 && ahead < 230 ? 1 : .2 + .25 * Math.sin(s.t * 1.6 + o.ph);
        o.e += (tgt - o.e) * (1 - Math.exp(-7 * dt));
        o.y0 = WATER - 8 - o.e * 20;
      }
    });
    s.obs = s.obs.filter((o) => o.x + o.w > s.cam - 120);

    const cy = duckY(), bx0 = s.x - 24, bx1 = s.x + 24, by0 = cy - 15, by1 = cy + 15;
    const hit = s.obs.find((o) => bx1 > o.x && bx0 < o.x + o.w && by1 > o.y0 && by0 < o.y1);
    if (hit) die(hit);
  }

  function die(o) {
    s.over = true; diving = false; s.final = score(); best = Math.max(best, s.final);
    const d = (s.death = { k: o.k, t: 0, x: s.x, y: duckY(), vx: 0, vy: 0, yo: 0, rot: 0, o, fx: false, sp: false, done: false });
    if (o.k === "croc") sfx("bite");
    else if (o.k === "log") { sfx("thud"); s.shake = 1; d.vx = -230; d.vy = 330; burst(o.x, WATER - 10, 14, "#a8682f", 150, 1.5, 3.5); }
    else { sfx("fall"); s.shake = .5; d.vx = -110; d.vy = -430; burst(s.x, d.y - 10, 14, "#ffd83a", 170, 2, 4.5); burst(o.x + 27, WATER - 40, 8, "#ff3b5c", 130, 2, 3.5); }
  }
  function updateDeath(dt) {
    const d = s.death; if (!d) return;
    d.t += dt;
    if (d.k === "croc") {
      if (!d.fx && d.t > .4) { d.fx = true; burst(d.x, d.y, 16, "#c4122f", 170, 1.4, 3.2); burst(d.x, d.y, 9, "#ffd83a", 150, 2, 4); sfx("splash"); }
      if (d.t > .75 && Math.random() < dt * 18) bubble(d.x + rnd(-30, 30), WATER + 10);
    } else if (d.k === "log") { // impacto: o pato é arremessado para trás e fica tonto
      d.x += d.vx * dt; d.vx *= Math.exp(-5 * dt);
      d.yo += d.vy * dt; d.vy -= 1500 * dt;
      if (d.yo < 0) { d.yo = 0; d.vy = d.vy < -120 ? -d.vy * .35 : 0; }
      d.rot = lerp(d.rot, -.65 + Math.sin(d.t * 3) * .05, 1 - Math.exp(-8 * dt));
    } else { // pássaro: o pato despenca girando e afunda
      d.vy += 1700 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += (d.sp ? 2 : 9) * dt;
      if (!d.sp && d.y > WATER - 6) { d.sp = true; splash(d.x, WATER, 16); sfx("splash"); d.vy = 90; d.vx = 0; }
      if (d.sp) d.vy *= Math.exp(-2 * dt);
    }
    if (!d.done && d.t > 1.15) { d.done = true; sfx("over"); hooks.onOver && hooks.onOver(s.final, best); }
  }

  /* ---------- cenário ---------- */
  function glow(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.35, `rgba(${rgb},${a * .45})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    if (rgb.startsWith("255")) { ctx.fillStyle = `rgba(255,236,160,${a})`; ctx.beginPath(); ctx.arc(x, y, r * .45, 0, 6.3); ctx.fill(); }
  }
  function drawSky(p) {
    const g = ctx.createLinearGradient(0, 0, 0, WATER);
    g.addColorStop(0, mix("#6a2c9e", "#050a2a", p)); g.addColorStop(.55, mix("#ff5e62", "#10205a", p)); g.addColorStop(1, mix("#ffb347", "#2a3f8f", p));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, WATER + 2);
    const sa = clamp((p - .45) * 2, 0, 1);
    if (sa > 0) stars.forEach((st) => {
      ctx.globalAlpha = sa * (.55 + .45 * Math.sin(s.t * 2 + st.f)); ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.3); ctx.fill();
    });
    ctx.globalAlpha = 1;
    glow(W * .67, lerp(WATER - 175, WATER + 50, clamp(p * 1.7, 0, 1)), 90, "255,200,90", 1 - clamp(p * 1.5, 0, 1) * .3);
    const mx = W * .31, my = lerp(WATER + 70, 95, clamp((p - .3) / .7, 0, 1));
    glow(mx, my, 70, "200,220,255", clamp((p - .3) * 2, 0, 1) * .6);
    ctx.fillStyle = "#f4f1e4"; ctx.beginPath(); ctx.arc(mx, my, 28, 0, 6.3); ctx.fill();
    ctx.fillStyle = "rgba(160,160,150,.35)";
    [[-8, -6, 6], [9, 5, 5], [-2, 12, 3.5]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 6.3); ctx.fill(); });
  }
  function drawHills(p, f, base, amp, c1, c2) {
    ctx.fillStyle = mix(c1, c2, p); ctx.beginPath(); ctx.moveTo(0, WATER);
    for (let x = 0; x <= W + 20; x += 20) { const wx = x + s.cam * f; ctx.lineTo(x, WATER - base - amp * (Math.sin(wx * .004) + .5 * Math.sin(wx * .011 + 2))); }
    ctx.lineTo(W, WATER); ctx.fill();
  }
  function drawWater(p) {
    const g = ctx.createLinearGradient(0, WATER, 0, H);
    g.addColorStop(0, mix("#1fb8c9", "#0b3a6e", p)); g.addColorStop(1, mix("#0a6ea8", "#05173d", p));
    ctx.fillStyle = g; ctx.fillRect(0, WATER, W, H - WATER);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const x = ((i * 137 - s.cam * (.6 + (i % 3) * .2)) % (W + 160) + W + 160) % (W + 160) - 80, y = WATER + 22 + (i * 53) % (H - WATER - 30);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + (i % 4) * 12, y); ctx.stroke();
    }
  }
  function surface(p) {
    ctx.beginPath(); ctx.moveTo(0, WATER);
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, WATER + Math.sin((x + s.cam) * .03 + s.t * 2.2) * 2.4);
    ctx.strokeStyle = mix("#d5fbff", "#6f9bd4", p); ctx.lineWidth = 3; ctx.stroke();
  }
  function ring(x, rx, a) { ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x, WATER + 3, rx, rx * .2, 0, 0, 6.3); ctx.stroke(); }

  /* ---------- personagens ---------- */
  function star(x, y, r, c) {
    ctx.fillStyle = c; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const R = i % 2 ? r * .45 : r, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); }
    ctx.closePath(); ctx.fill();
  }
  function dizzy(x, y) { for (let i = 0; i < 3; i++) { const a = s.t * 5 + i * 2.09; star(x + Math.cos(a) * 22, y - 40 + Math.sin(a) * 6, 5, "#fff2a0"); } }

  // Pato: corpo gordinho, bico longo, olhos grandes e confusos, patas palmadas grandes (design original)
  function drawDuck(x, y, tilt, o) {
    const t = s.t, pd = o.paddle, panic = o.air ? 1 : 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.fillStyle = "#ff9a1f"; ctx.strokeStyle = "#c46a00"; ctx.lineWidth = 1.5; // patas
    [[-10, 0], [12, 1]].forEach(([fx, i]) => {
      const sw = Math.sin(t * (panic ? 16 : 10) + i * Math.PI) * pd;
      ctx.save(); ctx.translate(fx, 16); ctx.rotate(sw * .55);
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-17, 16 + sw * 3); ctx.lineTo(-7, 21); ctx.lineTo(2, 23); ctx.lineTo(13, 18 + sw * 3); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 21); ctx.lineTo(-2, 6); ctx.moveTo(2, 23); ctx.lineTo(1, 6); ctx.stroke(); ctx.restore();
    });
    const g = ctx.createLinearGradient(0, -22, 0, 22); g.addColorStop(0, "#ffe84d"); g.addColorStop(1, "#ffb300"); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-26, -6); ctx.quadraticCurveTo(-44, -14, -38, -26); ctx.quadraticCurveTo(-30, -12, -22, -2); ctx.fill(); // cauda
    ctx.beginPath(); ctx.ellipse(0, 0, 31, 21, 0, 0, 6.3); ctx.fill();                                                  // corpo
    ctx.fillStyle = "#ffa800"; ctx.save(); ctx.translate(-5, 3); ctx.rotate(Math.sin(t * 10) * .3 - (o.air ? .5 : 0)); ctx.beginPath(); ctx.ellipse(0, 0, 16, 9, 0, 0, 6.3); ctx.fill(); ctx.restore(); // asa
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(21, -19, 17, 15, 0, 0, 6.3); ctx.fill();                           // cabeça
    ctx.strokeStyle = "#3a2a00"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(20, -33); ctx.quadraticCurveTo(15, -44, 24, -47); ctx.stroke(); // topete
    const bg = ctx.createLinearGradient(0, -24, 0, -4); bg.addColorStop(0, "#ffe2b0"); bg.addColorStop(1, "#ffaa55"); ctx.fillStyle = bg;   // bico longo
    ctx.beginPath(); ctx.moveTo(30, -21); ctx.quadraticCurveTo(54, -26, 69, -15); ctx.quadraticCurveTo(73, -8, 64, -6); ctx.quadraticCurveTo(46, -3, 30, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,70,0,.55)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(33, -11); ctx.quadraticCurveTo(52, -9, 65, -10); ctx.stroke();
    ctx.fillStyle = "rgba(150,70,0,.6)"; ctx.beginPath(); ctx.arc(55, -17, 1.4, 0, 6.3); ctx.fill();
    [[15, -23, 7], [29, -24, 8.2]].forEach(([ex, ey, r]) => { // olhos grandes e confusos
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3a2a00"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex + Math.sin(t * 2.3 + ex) * 2.2, ey + Math.cos(t * 1.7) * 1.6, panic ? 1.6 : 2.2, 0, 6.3); ctx.fill();
    });
    ctx.restore();
  }
  function drawLog(o) {
    const x = o.x, w = o.w, g = ctx.createLinearGradient(0, WATER - 16, 0, WATER + 36); g.addColorStop(0, "#a8682f"); g.addColorStop(1, "#5a3414");
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, WATER - 16, w, 52, 24); ctx.fill();
    ctx.fillStyle = "#c98a4a"; ctx.beginPath(); ctx.ellipse(x + 14, WATER + 10, 11, 24, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = "#7a4a20"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 14, WATER + 10, 5, 13, 0, 0, 6.3); ctx.stroke();
    ctx.fillStyle = "#6b3f19"; ctx.beginPath(); ctx.moveTo(x + w * .55, WATER - 14); ctx.lineTo(x + w * .6, WATER - 70); ctx.lineTo(x + w * .72, WATER - 62); ctx.lineTo(x + w * .74, WATER - 14); ctx.fill();
    ctx.fillStyle = "#38c24a"; ctx.beginPath(); ctx.ellipse(x + w * .72, WATER - 66, 14, 7, -.5, 0, 6.3); ctx.fill();
  }
  function crocBody(o) { // corpo submerso (desenhado antes do véu de água)
    ctx.save(); ctx.translate(o.x, 0); ctx.fillStyle = "#1f6d2a";
    ctx.beginPath(); ctx.roundRect(0, WATER + 2, o.w, 36, 16); ctx.fill();
    ctx.beginPath(); ctx.moveTo(o.w - 4, WATER + 8); ctx.lineTo(o.w + 42, WATER + 22); ctx.lineTo(o.w - 4, WATER + 34); ctx.fill();
    ctx.fillStyle = "#2b8a33"; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(34 + i * 14, WATER + 4); ctx.lineTo(41 + i * 14, WATER - 3); ctx.lineTo(48 + i * 14, WATER + 4); ctx.fill(); }
    ctx.restore();
  }
  function crocHead(o) { // só o topo da cabeça e os olhos fora d'água
    const top = o.y0; ctx.save(); ctx.translate(o.x, 0);
    ctx.fillStyle = "#3fae3a"; ctx.beginPath(); ctx.roundRect(-6, top + 4, 62, WATER - top + 8, 10); ctx.fill();
    ctx.fillStyle = "#2f8f2f"; ctx.beginPath(); ctx.arc(36, top + 6, 9, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#ffe14d"; ctx.beginPath(); ctx.arc(36, top + 5, 5.5, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#111"; ctx.fillRect(34.5, top, 3, 10);
    ctx.fillStyle = "#1d5a24"; ctx.beginPath(); ctx.arc(2, top + 9, 2, 0, 6.3); ctx.fill();
    ctx.restore();
  }
  function drawBite(d) { // jacaré emerge e abocanha o pato
    const t = d.t, up = t < .22 ? ease(t / .22) : t < .75 ? 1 : 1 - (t - .75) / .35;
    if (up <= 0) return;
    const open = t < .22 ? t / .22 : t < .42 ? 1 - (t - .22) / .2 : 0;
    ctx.save(); ctx.translate(d.x - s.cam + 4, lerp(WATER + 56, WATER + 6, up));
    ctx.fillStyle = "#2f8f2f"; ctx.beginPath(); ctx.roundRect(-52, 0, 104, 28, 10); ctx.fill();
    ctx.fillStyle = "#fff"; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-48 + i * 17, 0); ctx.lineTo(-40 + i * 17, -9); ctx.lineTo(-32 + i * 17, 0); ctx.fill(); }
    ctx.save(); ctx.translate(50, 0); ctx.rotate(open * .75);
    ctx.fillStyle = "#3fae3a"; ctx.beginPath(); ctx.roundRect(-104, -30, 104, 30, 12); ctx.fill();
    ctx.fillStyle = "#fff"; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-98 + i * 17, 0); ctx.lineTo(-90 + i * 17, 9); ctx.lineTo(-82 + i * 17, 0); ctx.fill(); }
    ctx.fillStyle = "#ffe14d"; ctx.beginPath(); ctx.arc(-18, -30, 8, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#111"; ctx.fillRect(-19.5, -37, 3, 14);
    ctx.restore(); ctx.restore();
  }
  function drawBird(o) {
    const y = WATER - 40 + Math.sin(s.t * 6 + o.ph) * 5, fl = Math.sin(s.t * 16 + o.ph) * .8;
    ctx.save(); ctx.translate(o.x + 27, y);
    ctx.fillStyle = "#ff3b5c"; ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.arc(-18, -4, 9, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#ffd400"; ctx.beginPath(); ctx.moveTo(-26, -5); ctx.lineTo(-38, -2); ctx.lineTo(-26, 0); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-20, -6, 1.8, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#c2183a";
    [-1, 1].forEach((d) => { ctx.save(); ctx.translate(2, -4); ctx.rotate(-1 + fl * d * .6); ctx.beginPath(); ctx.ellipse(0, -14, 8, 20, 0, 0, 6.3); ctx.fill(); ctx.restore(); });
    ctx.restore();
  }
  function hud() {
    ctx.save(); ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(18, 16, 210, 62, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "700 26px Quicksand, sans-serif"; ctx.fillText("Pontos  " + score(), 34, 46);
    ctx.font = "600 16px Quicksand, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillText("Recorde  " + Math.max(best, score()), 34, 67);
    if (s.t < 4 && !s.over) { ctx.textAlign = "center"; ctx.fillStyle = `rgba(255,255,255,${clamp(4 - s.t, 0, 1)})`; ctx.font = "600 18px Quicksand, sans-serif"; ctx.fillText("↑ / espaço pula · ↓ mergulha", W / 2, H - 56); }
    ctx.restore();
  }

  function draw() {
    const k = canvas.height / H, p = phase(), cam = s.cam, D = s.death;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (s.shake > 0) ctx.translate(rnd(-1, 1) * s.shake * 8, rnd(-1, 1) * s.shake * 8);
    drawSky(p); drawHills(p, .12, 40, 34, "#8a2f6b", "#0b1238"); drawHills(p, .3, 8, 24, "#5a1f55", "#080d2a"); drawWater(p);
    const vis = (o) => o.x - cam > -220 && o.x - cam < W + 60;
    s.obs.forEach((o) => {
      if (!vis(o) || o.k === "bird" || (D && D.o === o && o.k === "croc")) return;
      ctx.save(); ctx.translate(-cam, 0); (o.k === "log" ? drawLog : crocBody)(o); ctx.restore();
    });
    const dxs = s.x - cam;
    if (!D) {
      const surf = s.h === 0 && s.depth < .3, bob = surf ? Math.sin(s.t * 3.4) * 2.4 : 0;
      ctx.globalAlpha = 1 - s.depth * .35;
      drawDuck(dxs, duckY() + bob, clamp(-s.vy / 1500, -.45, .45) + s.depth * .35 + (surf ? Math.sin(s.t * 3.4 + 1) * .05 : 0), { paddle: s.h > 0 ? 1.6 : 1, air: s.h > 0 });
      ctx.globalAlpha = 1;
    } else if (D.k === "croc") { if (D.t < .4) drawDuck(D.x - cam, D.y, 0, { paddle: 2, air: true }); drawBite(D); }
    else if (D.k === "log") drawDuck(D.x - cam, D.y - D.yo + Math.sin(s.t * 3.4) * 2, D.rot, { paddle: .3 });
    else drawDuck(D.x - cam, D.y, D.rot, { paddle: 2, air: true });

    const wg = ctx.createLinearGradient(0, WATER, 0, H); // véu de água sobre o que está submerso
    wg.addColorStop(0, mix("#1fb8c9", "#0b3a6e", p).replace("rgb", "rgba").replace(")", ",.28)"));
    wg.addColorStop(1, mix("#0a6ea8", "#05173d", p).replace("rgb", "rgba").replace(")", ",.5)"));
    ctx.fillStyle = wg; ctx.fillRect(0, WATER, W, H - WATER);
    surface(p);

    s.rip.forEach((r) => ring(r.x - cam, 8 + r.age * 70, (1 - r.age / 1.2) * .5)); // esteira de ondulações
    if (!D && s.h === 0 && s.depth < .5) { ring(dxs, 36 + Math.sin(s.t * 3.4) * 2.5, .38); ring(dxs, 52 + Math.sin(s.t * 3.4 + 1.5) * 3, .2); }
    s.obs.forEach((o) => {
      if (!vis(o)) return;
      if (o.k === "croc" && !(D && D.o === o)) {
        const ph = (s.t * .8 + o.ph) % 1; ring(o.x + 22 - cam, 18 + ph * 34, (1 - ph) * .5);
        ctx.save(); ctx.translate(-cam, 0); crocHead(o); ctx.restore();
      } else if (o.k === "bird") { ctx.save(); ctx.translate(-cam, 0); drawBird(o); ctx.restore(); }
    });
    if (D && D.k === "log" && D.t > .2) dizzy(D.x - cam, D.y - D.yo);
    s.parts.forEach((q) => {
      ctx.globalAlpha = clamp(q.life * 1.6, 0, 1); ctx.fillStyle = q.c || (q.k ? "rgba(220,250,255,.8)" : "#d8f6ff");
      ctx.beginPath(); ctx.arc(q.x - cam, q.y, q.r, 0, 6.3); ctx.fill();
    });
    ctx.globalAlpha = 1;
    hud();
  }

  /* ---------- laço e controle ---------- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(.033, (now - last) / 1000 || 0); last = now;
    update(dt); draw();
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    const box = canvas.parentElement, vw = box.clientWidth || 960, vh = box.clientHeight || 540;
    const ar = clamp(vw / vh, 1.2, 2.4), cw = Math.min(vw, vh * ar), ch = cw / ar, dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(H * ar);
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  function restart() { reset(); hooks.onRestart && hooks.onRestart(); }
  window.addEventListener("resize", () => running && resize());

  return {
    start() { reset(); running = true; resize(); last = performance.now(); sfx("ambienceStart"); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    stop() { running = false; diving = false; cancelAnimationFrame(raf); sfx("ambienceStop"); },
    restart,
    setBest(n) { best = Math.max(best, n | 0); },
  };
};
