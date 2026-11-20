"use strict";
const $ = (s, r = document) => r.querySelector(s);
const csrf = () => $('meta[name="csrf-token"]').content;

async function api(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
    body: JSON.stringify(body || {}),
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch { /* sem JSON */ }
  return { ok: res.ok && data.ok, data };
}

/* ---------- autenticação ---------- */
function setUser(name) {
  const logged = Boolean(name);
  $("#who").hidden = !logged;
  $("#who").textContent = logged ? `Olá, ${name}` : ""; // textContent evita XSS
  $("#btn-login").hidden = $("#btn-signin").hidden = logged;
  $("#btn-logout").hidden = !logged;
}
const authDlg = $("#dlg-auth");
function showPane(name, animate) {
  document.querySelectorAll("#dlg-auth form").forEach((f) => {
    const on = f.dataset.pane === name;
    f.hidden = !on;
    if (on && animate) { f.classList.remove("pane-in"); void f.offsetWidth; f.classList.add("pane-in"); }
  });
  const form = $(`#form-${name}`);
  $(".msg", form).textContent = "";
  const first = $("input", form); if (first) first.focus();
}
document.querySelectorAll("[data-auth]").forEach((b) =>
  b.addEventListener("click", () => { authDlg.showModal(); showPane(b.dataset.auth, false); }));
document.querySelectorAll("[data-swap]").forEach((b) =>
  b.addEventListener("click", () => showPane(b.dataset.swap, true)));
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest("dialog").close()));

const rules = { // validação de UX; o servidor revalida tudo
  username: (v) => /^[A-Za-z0-9_]{3,20}$/.test(v) || "Usuário: 3 a 20 caracteres (letras, números e _).",
  email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) || "E-mail inválido.",
  password: (v) => (v.length >= 8 && v.length <= 72) || "A senha deve ter de 8 a 72 caracteres.",
};
document.querySelectorAll("form[data-api]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(".msg", form);
    const payload = Object.fromEntries(new FormData(form));
    if (form.dataset.api.endsWith("register")) {
      for (const k of Object.keys(rules)) {
        const r = rules[k](String(payload[k] || "").trim());
        if (r !== true) { msg.textContent = r; return; }
      }
    }
    msg.textContent = "";
    const { ok, data } = await api(form.dataset.api, payload);
    if (!ok) { msg.textContent = data.error || "Erro inesperado."; return; }
    form.reset();
    form.closest("dialog").close();
    setUser(data.user);
    loadBest();
  });
});
$("#btn-logout").addEventListener("click", async () => { await api("/api/logout"); setUser(null); loadBest(); });
fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setUser(d.user)).catch(() => {});

/* ---------- interruptor gangorra + sequência da luminária ---------- */
const sw = $("#gs-switch"), panel = $("#gs-panel"), lampEl = $("#lamp"), beam = $("#beam"), ledge = $("#ledge");
const BEAM_TOP = 160; // y (px) onde o feixe nasce, junto à lâmpada
let sceneTimer = 0, lit = false;

function placeBeam() { // o feixe termina na prateleira, acompanhando-a enquanto ela se posiciona
  const r = ledge.getBoundingClientRect(), w = $(".panel-inner", panel).getBoundingClientRect().width;
  beam.style.height = Math.max(0, r.bottom - BEAM_TOP) + "px";
  beam.style.width = Math.min(innerWidth * .94, Math.max(540, w * 1.5)) + "px";
}
function trackBeam(ms) {
  const t0 = performance.now();
  (function step() { placeBeam(); if (performance.now() - t0 < ms) requestAnimationFrame(step); })();
}
addEventListener("resize", () => lit && placeBeam());

function setLit(on) {
  lit = on;
  clearTimeout(sceneTimer);
  sw.setAttribute("aria-checked", String(on)); // estado único: símbolos, tecla e cena derivam dele
  document.body.classList.toggle("lit", on);
  panel.inert = !on;
  SFX.rocker(on); SFX.lamp(on);
  if (on) {
    lampEl.dataset.s = "on";
    panel.classList.remove("settled"); panel.classList.add("open");
    trackBeam(3200); Moths.start();
    sceneTimer = setTimeout(() => panel.classList.add("settled"), 2700);
  } else {
    panel.classList.remove("open", "settled");
    lampEl.dataset.s = "out"; trackBeam(1000); Moths.stop();
    sceneTimer = setTimeout(() => { lampEl.dataset.s = "off"; }, 650);
  }
}
sw.addEventListener("click", () => setLit(sw.getAttribute("aria-checked") !== "true"));

/* ---------- jogo: card expande até a tela cheia ---------- */
const screen = $("#game-screen"), cover = $("#cover-bg"), over = $("#game-over"), card = $("#card-duck");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let duck = null, busy = false;

const cardClip = () => {
  const r = card.getBoundingClientRect();
  return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 16px)`;
};
const setBackground = (inert) => { $("#page").inert = inert; };

async function loadBest() {
  if (!duck) return;
  try {
    const d = await (await fetch("/api/score/duck", { credentials: "same-origin" })).json();
    if (d.ok) duck.setBest(d.best);
  } catch { /* offline: segue sem recorde salvo */ }
}
function ensureDuck() {
  if (duck) return;
  duck = DuckRun($("#game"), {
    onOver: async (score, best) => {
      $("#go-score").textContent = score;
      $("#go-best").textContent = best;
      over.hidden = false;
      const { ok, data } = await api("/api/score", { game: "duck", score });
      if (ok) { duck.setBest(data.best); $("#go-best").textContent = data.best; }
    },
    onRestart: () => { over.hidden = true; },
  });
}

async function openGame() {
  if (busy) return;
  busy = true;
  SFX.enter();
  ensureDuck();
  over.hidden = true;
  cover.classList.remove("gone");
  screen.hidden = false;
  setBackground(true);
  const a = screen.animate(
    [{ clipPath: cardClip() }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }],
    { duration: reduce ? 1 : 650, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
  await a.finished;
  a.cancel();
  duck.start();
  cover.classList.add("gone");
  loadBest();
  $("#game-close").focus();
  busy = false;
}

async function closeGame() {
  if (busy || screen.hidden) return;
  busy = true;
  duck.stop();
  over.hidden = true;
  cover.classList.remove("gone");
  const a = screen.animate(
    [{ clipPath: "inset(0px 0px 0px 0px round 0px)" }, { clipPath: cardClip() }],
    { duration: reduce ? 1 : 520, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
  await a.finished;
  a.cancel();
  screen.hidden = true;
  setBackground(false);
  card.focus();
  busy = false;
}

card.addEventListener("click", openGame);
$("#game-close").addEventListener("click", closeGame);
$("#go-restart").addEventListener("click", () => duck.restart());
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !screen.hidden) { e.preventDefault(); closeGame(); } });

/* ---------- som ---------- */
const sndBtns = [$("#btn-sound"), $("#game-sound")];
function syncSound() {
  const muted = SFX.isMuted();
  sndBtns.forEach((b) => { b.textContent = muted ? "Som desligado" : "Som ligado"; b.setAttribute("aria-pressed", String(!muted)); });
}
sndBtns.forEach((b) => b.addEventListener("click", () => { SFX.setMuted(!SFX.isMuted()); if (!SFX.isMuted()) SFX.click(); syncSound(); }));
syncSound();
document.addEventListener("click", (e) => { if (e.target.closest(".btn:not(#btn-sound):not(#game-sound)")) SFX.click(); });
