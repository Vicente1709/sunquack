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
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  return { ok: res.ok && data.ok, data };
}

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

// Validação no cliente (só UX). O servidor revalida tudo.
const rules = {
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
  });
});

$("#btn-logout").addEventListener("click", async () => {
  await api("/api/logout");
  setUser(null);
});

fetch("/api/me", { credentials: "same-origin" })
  .then((r) => r.json()).then((d) => setUser(d.user)).catch(() => {});
