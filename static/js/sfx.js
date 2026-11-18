"use strict";
/* SFX — Web Audio API, tudo sintetizado (sem arquivos). Sons curtos, filtrados e com envelope para evitar estalos. */
window.SFX = (function () {
  let ctx = null, master = null, white = null, brown = null, amb = null, muted = false;
  try { muted = sessionStorage.getItem("sq_muted") === "1"; } catch (e) { /* sem storage */ }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function ok() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    white = ctx.createBuffer(1, len, ctx.sampleRate); brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const r = Math.random() * 2 - 1; w[i] = r; last = (last + 0.02 * r) / 1.02; b[i] = last * 3.5; }
    return true;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(type, freq, q, dur, vol, delay) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = white; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.03);
  }

  /* ---------- ambiente: rio + pássaros (dia) + grilos (noite) ---------- */
  function ambienceStart() {
    if (!ok() || amb) return;
    const river = ctx.createBufferSource(); river.buffer = brown; river.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800;
    const rg = ctx.createGain(); rg.gain.value = 0.0001;
    river.connect(lp); lp.connect(rg); rg.connect(master);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.18; lg.gain.value = 220;
    lfo.connect(lg); lg.connect(lp.frequency);
    const cr = ctx.createOscillator(); cr.frequency.value = 4300;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const tr = ctx.createOscillator(), trg = ctx.createGain(); tr.frequency.value = 11; trg.gain.value = 0.5; tr.connect(trg); trg.connect(am.gain);
    const tg = ctx.createGain(); tg.gain.value = 0.5;
    const slow = ctx.createOscillator(), sg = ctx.createGain(); slow.frequency.value = 0.8; sg.gain.value = 0.5; slow.connect(sg); sg.connect(tg.gain);
    const ng = ctx.createGain(); ng.gain.value = 0.0001;
    cr.connect(am); am.connect(tg); tg.connect(ng); ng.connect(master);
    [river, lfo, cr, tr, slow].forEach((n) => n.start());
    amb = { river, lfo, cr, tr, slow, rg, lp, ng, dayW: 1, timer: 0 };
    rg.gain.setTargetAtTime(0.06, ctx.currentTime, 0.6);
    amb.timer = setInterval(() => {
      if (amb && amb.dayW > 0.15 && Math.random() < 0.7) {
        const base = 2300 + Math.random() * 700, v = 0.016 * amb.dayW;
        for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) tone(base, base * 1.45, 0.09, "sine", v, i * 0.12);
      }
    }, 2200);
  }
  function ambience(p) {
    if (!amb || !ctx) return;
    const t = ctx.currentTime, day = clamp(1 - p * 1.8, 0, 1), night = clamp((p - 0.35) * 1.8, 0, 1);
    amb.dayW = day;
    amb.ng.gain.setTargetAtTime(Math.max(0.0001, 0.012 * night), t, 0.8);
    amb.lp.frequency.setTargetAtTime(900 - 380 * p, t, 0.8); // rio mais grave à noite
  }
  function ambienceStop() {
    if (!amb || !ctx) return;
    const a = amb; amb = null; clearInterval(a.timer);
    a.rg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); a.ng.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => [a.river, a.lfo, a.cr, a.tr, a.slow].forEach((n) => { try { n.stop(); } catch (e) { /* já parado */ } }), 700);
  }

  return {
    click() { tone(1500, 700, 0.05, "triangle", 0.07); noise("highpass", 3000, 0.7, 0.02, 0.05); },
    rocker(on) {
      tone(on ? 170 : 140, 55, 0.11, "sine", 0.22); noise("bandpass", 1800, 1.2, 0.03, 0.18);
      noise("highpass", 4000, 0.8, 0.015, 0.1, 0.06); tone(on ? 900 : 700, 400, 0.04, "triangle", 0.04, 0.06);
    },
    enter() { tone(392, 587, 0.18, "sine", 0.08); tone(587, 784, 0.22, "sine", 0.07, 0.09); noise("bandpass", 1200, 0.8, 0.35, 0.03); },
    jump() { tone(320, 760, 0.15, "sine", 0.13); },
    dive() { tone(520, 170, 0.22, "sine", 0.11); noise("lowpass", 700, 0.7, 0.18, 0.08); },
    splash() { noise("lowpass", 2400, 0.5, 0.25, 0.12); noise("highpass", 2500, 0.5, 0.12, 0.04); },
    point() { tone(880, 880, 0.07, "triangle", 0.07); tone(1320, 1320, 0.12, "triangle", 0.07, 0.07); },
    bite() {
      tone(150, 60, 0.12, "sine", 0.25); noise("lowpass", 900, 0.7, 0.1, 0.25);
      tone(120, 50, 0.14, "sine", 0.3, 0.24); noise("lowpass", 700, 1, 0.16, 0.3, 0.24); tone(300, 120, 0.2, "sine", 0.1, 0.5);
    },
    thud() { tone(130, 42, 0.18, "sine", 0.3); noise("bandpass", 500, 1, 0.1, 0.25); noise("highpass", 1800, 1, 0.04, 0.12, 0.02); },
    fall() { tone(760, 140, 0.55, "sine", 0.1); noise("lowpass", 2200, 0.5, 0.28, 0.12, 0.62); },
    over() { tone(330, 330, 0.22, "triangle", 0.07); tone(262, 262, 0.22, "triangle", 0.07, 0.2); tone(196, 196, 0.4, "triangle", 0.08, 0.4); },
    ambienceStart, ambience, ambienceStop,
    setMuted(m) {
      muted = !!m;
      try { sessionStorage.setItem("sq_muted", muted ? "1" : "0"); } catch (e) { /* sem storage */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.03);
    },
    isMuted() { return muted; },
  };
})();
