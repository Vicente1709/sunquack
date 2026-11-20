"use strict";
/* Mariposas orbitando a lâmpada (canvas 420x300, centro = lâmpada). */
window.Moths = (function () {
  const cv = document.getElementById("moths"), ctx = cv.getContext("2d");
  const CW = 420, CH = 300, CX = 210, CY = 150, dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = CW * dpr; cv.height = CH * dpr;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let raf = 0, run = false, target = 0, alpha = 0, t = 0, last = 0, timer = 0;
  const swarm = Array.from({ length: 5 }, (_, i) => ({
    a: rnd(0, 6.28), sp: (i % 2 ? -1 : 1) * rnd(.8, 1.5), rx: rnd(52, 108), ry: rnd(26, 58),
    ph: rnd(0, 6), fl: rnd(15, 21), sc: rnd(.85, 1.15), tilt: rnd(-.5, .5),
  }));

  function pos(m, a) { // órbita elíptica inclinada, com leve oscilação orgânica
    const rx = m.rx + Math.sin(t * .7 + m.ph) * 8, ry = m.ry + Math.cos(t * .5 + m.ph) * 5;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry, c = Math.cos(m.tilt), s = Math.sin(m.tilt);
    return [CX + x * c - y * s, CY + x * s + y * c];
  }
  function moth(x, y, ang, flap, sc) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22); // brilho da luz sobre as asas
    g.addColorStop(0, "rgba(255,220,160,.35)"); g.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.3); ctx.fill();
    const open = Math.abs(Math.cos(flap)) * .85 + .15; // abertura das asas (batida)
    [-1, 1].forEach((side) => {
      ctx.save(); ctx.scale(side * open, 1);
      let w = ctx.createLinearGradient(0, 0, 14, 12); w.addColorStop(0, "#f3e6cf"); w.addColorStop(1, "#c9a57a");
      ctx.fillStyle = w; ctx.beginPath(); ctx.moveTo(1, 1); ctx.bezierCurveTo(8, 2, 15, 8, 12, 15); ctx.bezierCurveTo(8, 16, 3, 11, 1, 6); ctx.closePath(); ctx.fill();
      w = ctx.createLinearGradient(0, -10, 20, 2); w.addColorStop(0, "#fff3dc"); w.addColorStop(1, "#b88c5a");
      ctx.fillStyle = w; ctx.beginPath(); ctx.moveTo(1, -3); ctx.bezierCurveTo(8, -14, 20, -12, 21, -6); ctx.bezierCurveTo(21, -1, 12, 4, 1, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(110,70,30,.45)"; ctx.lineWidth = .6; ctx.beginPath();
      ctx.moveTo(1, -1); ctx.lineTo(18, -8); ctx.moveTo(1, 0); ctx.lineTo(19, -3); ctx.moveTo(1, 3); ctx.lineTo(11, 12); ctx.stroke();
      ctx.fillStyle = "rgba(90,55,25,.55)"; ctx.beginPath(); ctx.arc(13, -6, 2.2, 0, 6.3); ctx.fill();
      ctx.restore();
    });
    ctx.fillStyle = "#6b4a2b"; ctx.beginPath(); ctx.ellipse(0, 2, 2.2, 7, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -6, 2, 0, 6.3); ctx.fill();
    ctx.strokeStyle = "#6b4a2b"; ctx.lineWidth = .7; ctx.beginPath();
    ctx.moveTo(-.8, -7.5); ctx.quadraticCurveTo(-3, -13, -6, -14); ctx.moveTo(.8, -7.5); ctx.quadraticCurveTo(3, -13, 6, -14); ctx.stroke();
    ctx.restore();
  }
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; t += dt;
    alpha += (target - alpha) * (1 - Math.exp(-3 * dt));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, CW, CH);
    if (alpha > .01) swarm.forEach((m) => {
      m.a += m.sp * dt;
      const [x, y] = pos(m, m.a), [x2, y2] = pos(m, m.a + .03 * Math.sign(m.sp)), d = Math.sin(m.a); // d<0: "atrás" da lâmpada
      ctx.globalAlpha = alpha * (.72 + .28 * (d + 1) / 2);
      moth(x, y, Math.atan2(y2 - y, x2 - x) + Math.PI / 2, t * m.fl + m.ph, m.sc * (1 + .12 * d));
    });
    ctx.globalAlpha = 1;
    raf = run || alpha > .01 ? requestAnimationFrame(frame) : 0;
  }
  return {
    start() { run = true; clearTimeout(timer); timer = setTimeout(() => { target = 1; }, 900); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { run = false; clearTimeout(timer); target = 0; },
  };
})();
