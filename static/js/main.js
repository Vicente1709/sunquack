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
document.querySelectorAll("[data-open]").forEach((b) =>
  b.addEventListener("click", () => document.getElementById(b.dataset.open).showModal()));
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

/* ---------- interruptor gangorra ---------- */
const sw = $("#gs-switch"), panel = $("#gs-panel");
sw.addEventListener("click", () => {
  const on = sw.getAttribute("aria-checked") !== "true";
  sw.setAttribute("aria-checked", String(on));
  panel.classList.toggle("open", on);
  panel.inert = !on;
  SFX.rocker(on);
});

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
