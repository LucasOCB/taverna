// Quadro de Missões: GitHub Issues como livro de missões.
// O token vive cifrado no cofre.json; só a frase de acesso certa o abre.

const $ = (s, el = document) => el.querySelector(s);
const MARCA = /<!--\s*quadro:v1\s*(\{.*?\})\s*-->/s;
const AUTOR = /<!--\s*quadro:autor\s+(\w+)\s*-->/;
const RARIDADES = { comum: "Comum", rara: "Rara", epica: "Épica", lendaria: "Lendária" };
const CHAVE_SESSAO = "quadro-sessao";
const CHAVE_SOM = "quadro-som";
const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has("demo");
const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let cfg = {}, sessao, missoes = [], abaAtual = "quadro", primeiroDesenho = true;
const recentes = new Map();

/* ================= som ================= */
const SONS = Object.fromEntries(["lacre", "pena", "prego", "papel"].map((n) => {
  const a = new Audio(`assets/som/${n}.mp3`); a.preload = "auto"; if (n === "pena") { a.loop = true; a.volume = .55; } return [n, a];
}));
let somLigado = (() => { try { return localStorage.getItem(CHAVE_SOM) !== "0"; } catch { return true; } })();
function tocar(nome, { volume = 1 } = {}) {
  if (!somLigado) return;
  const a = nome === "pena" ? SONS.pena : SONS[nome].cloneNode();
  if (nome !== "pena") a.volume = volume;
  if (nome === "pena") a.currentTime = Math.random() * 2;
  a.play().catch(() => {});
}
const calar = (nome) => SONS[nome].pause();
function destravarSom() { // iOS só libera áudio tocado dentro de um toque
  for (const a of Object.values(SONS)) { const v = a.volume; a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = v; }).catch(() => { a.volume = v; }); }
}
function pintarBotaoSom() {
  const b = $("#som"); b.setAttribute("aria-pressed", somLigado); b.setAttribute("aria-label", somLigado ? "Som ligado" : "Som desligado");
}

/* ================= escrita a pena ================= */
let pularEscrita = false;
const pena = () => $("#pena");
function moverPena(alvo) {
  const r = alvo.getBoundingClientRect();
  const giro = -4 + Math.random() * 8;
  pena().style.transform = `translate(${r.right - 4}px, ${r.bottom - 88}px) rotate(${giro}deg)`;
}
async function escrever(el, { vel = 32 } = {}) {
  const texto = el.dataset.texto ?? el.textContent;
  el.dataset.texto = texto;
  if (SEM_MOVIMENTO) { el.textContent = texto; el.classList.add("escrito"); return; }
  el.textContent = "";
  el.classList.add("escrito");
  const letras = [];
  texto.split(/(\s+)/).forEach((pedaco) => {
    if (!pedaco) return;
    if (/^\s+$/.test(pedaco)) { const s = document.createElement("span"); s.className = "tinta"; s.textContent = pedaco; el.append(s); letras.push(s); return; }
    const palavra = document.createElement("span"); palavra.className = "palavra";
    for (const c of pedaco) { const s = document.createElement("span"); s.className = "tinta"; s.textContent = c; palavra.append(s); letras.push(s); }
    el.append(palavra);
  });
  const camada = el.closest("dialog[open]") || document.body;
  if (pena().parentElement !== camada) camada.append(pena());
  pena().classList.add("ativa");
  tocar("pena");
  for (const s of letras) {
    if (pularEscrita) break;
    s.classList.add("on");
    if (s.textContent.trim()) moverPena(s);
    await espera(s.textContent.trim() ? vel * (0.6 + Math.random() * 0.8) : vel * 1.6);
  }
  letras.forEach((s) => s.classList.add("on"));
  calar("pena");
  pena().classList.remove("ativa");
}

/* ================= brasas ================= */
function brasas() {
  if (SEM_MOVIMENTO) return;
  const cv = $("#brasas"), ctx = cv.getContext("2d");
  let w, h; const dpr = Math.min(devicePixelRatio || 1, 2);
  const tam = () => { w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr; };
  tam(); addEventListener("resize", tam);
  const novo = (inicio) => ({ x: Math.random() * w, y: inicio ? Math.random() * h : h + 10, r: (0.5 + Math.random() * 0.6) * dpr,
    vy: (0.25 + Math.random() * 0.6) * dpr, vx: (Math.random() - 0.5) * 0.3 * dpr, f: Math.random() * 6.28, vida: 0.4 + Math.random() * 0.6 });
  const ps = Array.from({ length: innerWidth < 600 ? 11 : 20 }, () => novo(true));
  (function quadro() {
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.vy; p.f += 0.02; p.x += p.vx + Math.sin(p.f) * 0.25 * dpr;
        if (p.y < -10) Object.assign(p, novo(false));
        const a = p.vida * Math.min(1, p.y / h * 1.6) * (0.6 + 0.4 * Math.sin(p.f * 3));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = `rgba(214,130,60,${(a * .45).toFixed(3)})`;
        ctx.shadowColor = "rgba(255,120,40,.8)"; ctx.shadowBlur = 8 * dpr; ctx.fill();
      }
    }
    requestAnimationFrame(quadro);
  })();
}

/* ================= cofre ================= */
const normalizar = (f) => f.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function abrirCofre(frase) {
  const r = await fetch("cofre.json", { cache: "no-store" });
  if (!r.ok) throw new Error("o cofre ainda não foi forjado (falta o cofre.json)");
  const cofre = await r.json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizar(frase)), "PBKDF2", false, ["deriveKey"]);
  for (const p of cofre.portas) {
    const chave = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: deB64(p.sal), iterations: cofre.iteracoes },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    try {
      const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(p.iv) }, chave, deB64(p.ct));
      return JSON.parse(new TextDecoder().decode(claro));
    } catch { /* porta errada, tenta a próxima */ }
  }
  return null;
}

function lerSessao() {
  for (const store of [sessionStorage, localStorage]) {
    try { const s = JSON.parse(store.getItem(CHAVE_SESSAO)); if (s?.token) return s; } catch {}
  }
  return null;
}
function guardarSessao(s, lembrar) {
  try { (lembrar ? localStorage : sessionStorage).setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch {}
}
function apagarSessao() {
  for (const store of [sessionStorage, localStorage]) { try { store.removeItem(CHAVE_SESSAO); } catch {} }
}

/* ================= GitHub ================= */
async function gh(caminho, opcoes = {}) {
  if (DEMO) return demo(caminho, opcoes);
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}${caminho}`, {
    ...opcoes,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${sessao.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (r.status === 401) { apagarSessao(); location.reload(); throw new Error("sessão expirada"); }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

function lerMissao(issue) {
  const corpo = issue.body || "";
  let meta = {};
  const m = corpo.match(MARCA);
  if (m) { try { meta = JSON.parse(m[1]); } catch {} }
  const rotulos = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  let estado = "quadro";
  if (issue.state === "closed") estado = issue.state_reason === "not_planned" ? "recusada" : "cumprida";
  else if (rotulos.includes("em-jornada")) estado = "jornada";
  return {
    numero: issue.number,
    titulo: issue.title,
    descricao: corpo.replace(MARCA, "").trim(),
    raridade: RARIDADES[meta.raridade] ? meta.raridade : "comum",
    recompensa: meta.recompensa || "",
    prazo: meta.prazo || "",
    criada: issue.created_at,
    fechada: issue.closed_at,
    recados: issue.comments,
    estado,
  };
}

async function carregar() {
  const issues = await gh("/issues?state=all&labels=missao&per_page=100&sort=created&direction=desc");
  missoes = issues.filter((i) => !i.pull_request).map(lerMissao);
  // missões recém-lançadas que a busca ainda não enxerga continuam no quadro por 2 min
  for (const [n, r] of recentes) {
    if (missoes.some((m) => m.numero === n) || Date.now() - r.ts > 120_000) recentes.delete(n);
    else missoes.unshift(r.missao);
  }
  desenhar();
}

/* ================= desenho ================= */
const dataBR = (iso) => {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
};
function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f);
  return e;
}

const NA_ABA = {
  quadro: (m) => m.estado === "quadro",
  jornada: (m) => m.estado === "jornada",
  concluidas: (m) => m.estado === "cumprida" || m.estado === "recusada",
};
const VAZIO = {
  quadro: "O quadro está vazio. Nenhum monstro à vista… por enquanto.",
  jornada: "Nenhum herói na estrada agora.",
  concluidas: "Ainda não há feitos para os bardos cantarem.",
};
const ESTAMPA = { jornada: "Em jornada", cumprida: "Cumprida", recusada: "Recusada" };

function desenhar({ animar = false } = {}) {
  for (const b of document.querySelectorAll(".aba")) {
    b.classList.toggle("ativa", b.dataset.aba === abaAtual);
    b.setAttribute("aria-selected", b.dataset.aba === abaAtual);
    b.querySelector("span").textContent = missoes.filter(NA_ABA[b.dataset.aba]).length;
  }
  const itens = missoes.filter(NA_ABA[abaAtual]);
  const pregar = animar || primeiroDesenho;
  primeiroDesenho = false;
  $("#lista").replaceChildren(...(itens.length ? itens.map((m, i) => cartao(m, i, pregar)) : [el("p", { class: "vazio" }, VAZIO[abaAtual])]));
  if (pregar && !SEM_MOVIMENTO) itens.slice(0, 4).forEach((_, i) => setTimeout(() => tocar("prego", { volume: .7 }), 380 + i * 110));
}

function cartao(m, i, pregar) {
  const giro = [-3.2, 2.6, -1.4, 3.5, -2.4, 1.6][i % 6];
  const celular = innerWidth < 600;
  const desvio = celular ? [12, -12, 8, -10][i % 4] : [0, -8, 6, -4][i % 4];
  const largura = [300, 260, 340, 280][i % 4];
  const desce = celular ? 0 : [0, 26, 8, 34][i % 4];
  const papel = ["papel-a", "papel-b"][(m.numero + i) % 2];
  const estilo = `--giro:${giro}deg;--atraso:${i * 110}ms;--desvio:${desvio}px;--largura:${largura}px;--desce:${desce}px;--papel:url("assets/${papel}.webp");--prego:${(m.numero * 37) % 90}deg`;
  const b = el("button", { class: `cartao r-${m.raridade}${pregar ? " pregando" : ""}`, style: estilo, type: "button" },
    el("span", { class: "raridade" }, RARIDADES[m.raridade]),
    el("h3", {}, m.titulo),
    m.descricao ? el("p", { class: "resumo" }, m.descricao) : null,
    el("div", { class: "rodape" },
      m.recompensa ? el("span", {}, el("b", {}, "Recompensa"), m.recompensa) : null,
      m.prazo ? el("span", {}, el("b", {}, "Prazo"), dataBR(m.prazo)) : null,
      !m.recompensa && !m.prazo ? el("span", {}, `Pregada em ${dataBR(m.criada)}`) : null),
    ESTAMPA[m.estado] ? el("span", { class: `estampa ${m.estado}` }, ESTAMPA[m.estado]) : null);
  b.addEventListener("click", () => abrirDetalhe(m));
  return b;
}

/* ================= detalhe ================= */
const STATUS = {
  quadro: "Pregada no quadro, à espera do herói",
  jornada: "O herói partiu em jornada",
  cumprida: "Missão cumprida",
  recusada: "Missão recusada",
};

async function abrirDetalhe(m) {
  const dlg = $("#dlg-detalhe"), art = $("#detalhe");
  const ehHeroi = sessao.papel === "heroi";
  const botoes = [];
  const acao = (rotulo, fn, classe = "link") => {
    const b = el("button", { class: classe, type: "button" }, rotulo);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await fn(); dlg.close(); await carregar(); } catch (e) { alert(e.message); b.disabled = false; }
    });
    botoes.push(b);
  };
  const fechar = (estado, motivo) => () => gh(`/issues/${m.numero}`, { method: "PATCH", body: JSON.stringify(motivo ? { state: estado, state_reason: motivo } : { state: estado }) });
  if (ehHeroi && m.estado === "quadro") acao("Aceitar missão", () => gh(`/issues/${m.numero}/labels`, { method: "POST", body: JSON.stringify({ labels: ["em-jornada"] }) }), "botao");
  if (ehHeroi && (m.estado === "quadro" || m.estado === "jornada")) {
    acao("Missão cumprida", fechar("closed", "completed"), "botao");
    acao("recusar", fechar("closed", "not_planned"));
  }
  if (!ehHeroi && (m.estado === "quadro" || m.estado === "jornada")) acao("retirar do quadro", fechar("closed", "not_planned"));
  if (m.estado === "cumprida" || m.estado === "recusada") acao("pregar de novo", fechar("open"));

  const recados = el("div", {}, el("p", { class: "status" }, "Consultando os corvos…"));
  const campo = el("textarea", { placeholder: ehHeroi ? `Recado para ${cfg.dama}` : `Recado para ${cfg.heroi}`, maxlength: "2000" });
  const enviar = el("button", { class: "link", type: "button" }, "enviar recado");
  enviar.addEventListener("click", async () => {
    const texto = campo.value.trim(); if (!texto) return;
    enviar.disabled = true;
    try {
      await gh(`/issues/${m.numero}/comments`, { method: "POST", body: JSON.stringify({ body: `<!-- quadro:autor ${sessao.papel} -->\n${texto}` }) });
      campo.value = ""; await carregarRecados(m, recados); carregar();
    } catch (e) { alert(e.message); }
    enviar.disabled = false;
  });
  const fecharBtn = el("button", { class: "link", type: "button" }, "fechar");
  fecharBtn.addEventListener("click", () => dlg.close());

  const titulo = el("h2", { "data-pena": "" }, m.titulo);
  art.replaceChildren(
    el("p", { class: `raridade r-${m.raridade}` }, `Missão ${RARIDADES[m.raridade]}`),
    titulo,
    el("div", { class: "depois" },
      el("p", { class: "status" }, STATUS[m.estado]),
      m.descricao ? el("p", { class: "corpo" }, m.descricao) : null,
      el("dl", {},
        el("dt", {}, "Recompensa"), el("dd", {}, m.recompensa || "A gratidão eterna da corte"),
        el("dt", {}, "Prazo"), el("dd", {}, m.prazo ? dataBR(m.prazo) : "Sem pressa"),
        el("dt", {}, "Pregada"), el("dd", {}, dataBR(m.criada)),
        m.fechada ? [el("dt", {}, "Encerrada"), el("dd", {}, dataBR(m.fechada))] : null),
      el("h3", {}, "Recados"), recados, campo,
      el("div", { class: "acoes" }, enviar),
      el("div", { class: "acoes", style: "margin-top:14px" }, ...botoes, fecharBtn)));
  tocar("papel");
  dlg.showModal();
  dlg.scrollTop = 0;
  carregarRecados(m, recados);
  pularEscrita = false;
  await espera(260);
  escrever(titulo, { vel: 38 });
}

async function carregarRecados(m, alvo) {
  try {
    const lista = await gh(`/issues/${m.numero}/comments?per_page=100`);
    alvo.replaceChildren(...(lista.length ? lista.map((c) => {
      const papel = (c.body.match(AUTOR) || [, "heroi"])[1];
      const nome = papel === "dama" ? cfg.dama : cfg.heroi;
      return el("div", { class: `recado ${papel}` },
        el("small", {}, `${nome} · ${dataBR(c.created_at)}`),
        el("p", {}, c.body.replace(AUTOR, "").trim()));
    }) : [el("p", { class: "status" }, "Nenhum recado ainda.")]));
  } catch (e) { alvo.replaceChildren(el("p", { class: "erro" }, e.message)); }
}

/* ================= nova missão ================= */
function prepararNova() {
  const dlg = $("#dlg-nova"), form = $("#form-nova");
  $("#nova").addEventListener("click", async () => {
    form.reset(); $("#erro-nova").textContent = "";
    tocar("papel"); dlg.showModal(); pularEscrita = false;
    await espera(240); escrever($(".folha-titulo", form), { vel: 45 });
  });
  form.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "enviar") return;
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const btn = $("#btn-enviar"); btn.disabled = true; btn.textContent = "Selando…";
    const meta = { raridade: d.raridade, recompensa: d.recompensa.trim(), prazo: d.prazo };
    try {
      const nova = await gh("/issues", {
        method: "POST",
        body: JSON.stringify({
          title: d.titulo.trim(),
          body: `<!-- quadro:v1 ${JSON.stringify(meta).replace(/--/g, "- -")} -->\n${d.descricao.trim()}`,
          labels: ["missao"],
        }),
      });
      dlg.close();
      await carimbar();
      abaAtual = "quadro";
      // a busca por rótulo do GitHub demora alguns segundos para ver a issue nova:
      // entra no quadro pela resposta da criação e a lista confirma depois
      if (nova?.number) {
        recentes.set(nova.number, { missao: lerMissao(nova), ts: Date.now() });
        missoes = [lerMissao(nova), ...missoes]; desenhar({ animar: true });
        setTimeout(() => carregar().catch(() => {}), 8000);
      } else { await carregar(); desenhar({ animar: true }); }
    } catch (e) { $("#erro-nova").textContent = e.message; }
    btn.disabled = false; btn.textContent = "Selar e pregar";
  });
}

async function carimbar() {
  const c = $("#carimbo");
  c.hidden = false; tocar("prego");
  await espera(SEM_MOVIMENTO ? 900 : 1700);
  c.hidden = true;
}

/* ================= abertura ================= */
async function desenrolar() {
  const carta = $("#carta"), papel = $(".carta-papel"), cil = $(".cilindro");
  carta.hidden = false;
  if (SEM_MOVIMENTO) { cil.hidden = true; return; }
  const alt = papel.offsetHeight;
  const dur = 1100, curva = "cubic-bezier(.3,.7,.25,1)";
  // sem fill: ao terminar o clip-path some e a sombra da folha não é recortada
  papel.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }], { duration: dur, easing: curva, fill: "backwards" });
  cil.animate([{ transform: "translateY(-40%)" }, { transform: `translateY(${alt - cil.offsetHeight * 0.55}px)` }],
    { duration: dur, easing: curva, fill: "both" });
  await espera(dur + 120);
}

async function abrirLacre() {
  const lacre = $("#lacre");
  destravarSom();
  tocar("lacre");
  pularEscrita = false;
  if (!SEM_MOVIMENTO) { lacre.classList.add("rompendo"); await espera(560); }
  lacre.hidden = true;
  await desenrolar();
  const lembrada = lerSessao();
  if (lembrada) $("#carta-fala").textContent = lembrada.papel === "heroi"
    ? `Bem-vindo de volta, ${lembrada.heroi || "herói"}. A corte aguarda.`
    : `Bem-vinda de volta, ${lembrada.dama || "Dama"}. O herói aguarda suas ordens.`;
  await escrever($(".carta-titulo"), { vel: 70 });
  await escrever($("#carta-fala"), { vel: 30 });
  const alvo = lembrada ? $("#bem-vinda") : $("#form-portao");
  alvo.hidden = false;
  requestAnimationFrame(() => alvo.classList.add("visivel"));
  if (!lembrada) $("#frase").focus({ preventScroll: true });
}

function entrar() {
  cfg = { repo: sessao.repo, dama: sessao.dama || "Dama", heroi: sessao.heroi || "Herói" };
  document.body.classList.replace("no-portao", "no-quadro");
  $("#portao").hidden = true;
  $("#quadro").hidden = false;
  $("#saudacao").textContent = sessao.papel === "heroi"
    ? `Bem-vindo de volta, ${cfg.heroi}. A corte aguarda.`
    : `Saudações, ${cfg.dama}. Que missão o herói enfrentará hoje?`;
  $("#nova").hidden = sessao.papel !== "dama";
  primeiroDesenho = true;
  carregar().catch((e) => $("#lista").replaceChildren(el("p", { class: "vazio" }, `Os corvos não voltaram: ${e.message}`)));
}

function iniciar() {
  pintarBotaoSom();
  brasas();
  $("#som").addEventListener("click", () => {
    somLigado = !somLigado; try { localStorage.setItem(CHAVE_SOM, somLigado ? "1" : "0"); } catch {}
    if (!somLigado) calar("pena");
    pintarBotaoSom();
  });
  // toque durante a escrita termina a frase na hora
  document.addEventListener("pointerdown", (ev) => { if (pena().classList.contains("ativa") && !ev.target.closest("#som")) pularEscrita = true; });

  for (const b of document.querySelectorAll(".aba")) b.addEventListener("click", () => { abaAtual = b.dataset.aba; desenhar({ animar: true }); });
  $("#sair").addEventListener("click", () => { apagarSessao(); location.reload(); });
  prepararNova();
  addEventListener("focus", () => sessao && carregar().catch(() => {}));
  setInterval(() => sessao && !document.hidden && carregar().catch(() => {}), 60_000);

  if (DEMO) {
    try { localStorage.removeItem(CHAVE_SESSAO); } catch {}
    sessao = { token: "demo", papel: PARAMS.get("demo") || "dama", dama: "Dama", heroi: "Herói" };
    if (PARAMS.has("direto")) return entrar();
  }

  $("#lacre").addEventListener("click", abrirLacre, { once: true });
  $("#ver-quadro").addEventListener("click", () => { sessao = lerSessao(); entrar(); });
  $("#trocar").addEventListener("click", () => { apagarSessao(); location.reload(); });

  $("#form-portao").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (DEMO) return entrar();
    const btn = ev.target.querySelector("button"); btn.disabled = true; btn.textContent = "Consultando…";
    $("#erro-portao").textContent = "";
    try {
      const s = await abrirCofre($("#frase").value);
      if (!s) { $("#erro-portao").textContent = "Essas palavras não abrem esta porta."; return; }
      sessao = s; guardarSessao(s, $("#lembrar").checked); entrar();
    } catch (e) { $("#erro-portao").textContent = `O guardião dormiu: ${e.message}`; }
    finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
}

/* ================= modo demonstração (?demo, ?demo=heroi, &direto) ================= */
let demoIssues = null;
function demo(caminho, opcoes) {
  const agora = Date.now(), dia = 864e5;
  demoIssues ??= [
    { number: 4, title: "Resgatar a encomenda nos Correios", body: '<!-- quadro:v1 {"raridade":"epica","recompensa":"Um beijo e um café","prazo":"2026-11-24"} -->\nA agência fecha às 17h. Levar documento.', labels: [{ name: "missao" }], state: "open", created_at: new Date(agora - dia).toISOString(), comments: 1 },
    { number: 3, title: "Montar a prateleira da sala", body: '<!-- quadro:v1 {"raridade":"lendaria","recompensa":"Jantar à escolha do herói","prazo":""} -->\nOs parafusos estão na gaveta da cozinha.', labels: [{ name: "missao" }, { name: "em-jornada" }], state: "open", created_at: new Date(agora - 3 * dia).toISOString(), comments: 0 },
    { number: 2, title: "Trazer pão quentinho", body: '<!-- quadro:v1 {"raridade":"comum","recompensa":"","prazo":""} -->\n6 pães e 1 queijo minas.', labels: [{ name: "missao" }], state: "open", created_at: new Date(agora - 2 * dia).toISOString(), comments: 0 },
    { number: 5, title: "Caçar a aranha do banheiro", body: '<!-- quadro:v1 {"raridade":"lendaria","recompensa":"Glória eterna","prazo":"2026-11-22"} -->\nEla está atrás do espelho. Sem matar, levar para fora.', labels: [{ name: "missao" }], state: "open", created_at: new Date(agora - dia / 2).toISOString(), comments: 0 },
    { number: 1, title: "Derrotar a pilha de louça", body: '<!-- quadro:v1 {"raridade":"rara","recompensa":"Escolher o filme","prazo":""} -->\nInclusive a panela de ontem.', labels: [{ name: "missao" }], state: "closed", state_reason: "completed", created_at: new Date(agora - 6 * dia).toISOString(), closed_at: new Date(agora - 5 * dia).toISOString(), comments: 0 },
  ];
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
  const n = Number((caminho.match(/^\/issues\/(\d+)/) || [])[1]);
  const issue = demoIssues.find((i) => i.number === n);
  if (caminho.startsWith("/issues?")) return Promise.resolve(structuredClone(demoIssues));
  if (caminho === "/issues") { const nova = { number: 100 + demoIssues.length, ...corpo, labels: [{ name: "missao" }], state: "open", created_at: new Date().toISOString(), comments: 0 }; demoIssues.unshift(nova); return Promise.resolve(structuredClone(nova)); }
  if (caminho.endsWith("/comments") && opcoes.method === "POST") { issue.comments++; (issue._c ??= []).push({ body: corpo.body, created_at: new Date().toISOString() }); return Promise.resolve({}); }
  if (caminho.includes("/comments")) return Promise.resolve(issue._c ?? (n === 4 ? [{ body: "<!-- quadro:autor heroi -->\nAmanhã cedo eu passo lá.", created_at: new Date().toISOString() }] : []));
  if (caminho.endsWith("/labels")) { issue.labels.push({ name: "em-jornada" }); return Promise.resolve({}); }
  if (opcoes.method === "PATCH") { Object.assign(issue, corpo, { closed_at: new Date().toISOString() }); if (corpo.state === "open") issue.labels = [{ name: "missao" }]; return Promise.resolve({}); }
  return Promise.resolve([]);
}

iniciar();
