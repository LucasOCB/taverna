// Quadro de Missões: GitHub Issues como livro de missões.
// O token vive cifrado no cofre.json; só a frase de acesso certa o abre.

const $ = (s, el = document) => el.querySelector(s);
const MARCA = /<!--\s*quadro:v1\s*(\{.*?\})\s*-->/s;
const AUTOR = /<!--\s*quadro:autor\s+(\w+)\s*-->/;
const RARIDADES = { comum: "Comum", rara: "Rara", epica: "Épica", lendaria: "Lendária" };
const CHAVE_SESSAO = "quadro-sessao";
const DEMO = new URLSearchParams(location.search).has("demo");

let cfg = {}, sessao, missoes = [], abaAtual = "quadro";
const recentes = new Map();

/* ---------------- cofre ---------------- */
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

/* ---------------- GitHub ---------------- */
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

/* ---------------- desenho ---------------- */
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
  quadro: "O quadro está vazio. Nenhum dragão à vista… por enquanto.",
  jornada: "Nenhum herói na estrada agora.",
  concluidas: "Ainda não há feitos para os bardos cantarem.",
};
const ESTAMPA = { jornada: "Em jornada", cumprida: "Cumprida", recusada: "Recusada" };

function desenhar() {
  for (const b of document.querySelectorAll(".aba")) {
    b.classList.toggle("ativa", b.dataset.aba === abaAtual);
    b.setAttribute("aria-selected", b.dataset.aba === abaAtual);
    b.querySelector("span").textContent = missoes.filter(NA_ABA[b.dataset.aba]).length;
  }
  const lista = $("#lista");
  const itens = missoes.filter(NA_ABA[abaAtual]);
  lista.replaceChildren(...(itens.length ? itens.map(cartao) : [el("p", { class: "vazio" }, VAZIO[abaAtual])]));
}

function cartao(m, i) {
  const giro = [-1.6, 1.2, -0.6, 1.8, -1.1, 0.7][i % 6];
  const b = el("button", { class: `cartao r-${m.raridade}`, style: `--giro:${giro}deg`, type: "button" },
    el("span", { class: "raridade" }, RARIDADES[m.raridade]),
    el("h3", {}, m.titulo),
    m.descricao ? el("p", { class: "resumo" }, m.descricao) : null,
    el("div", { class: "rodape" },
      m.recompensa ? el("span", {}, el("b", {}, "Recompensa "), m.recompensa) : null,
      m.prazo ? el("span", {}, el("b", {}, "Prazo "), dataBR(m.prazo)) : null,
      !m.recompensa && !m.prazo ? el("span", {}, `Lançada em ${dataBR(m.criada)}`) : null),
    ESTAMPA[m.estado] ? el("span", { class: `estampa ${m.estado}` }, ESTAMPA[m.estado]) : null);
  b.addEventListener("click", () => abrirDetalhe(m));
  return b;
}

/* ---------------- detalhe ---------------- */
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
  const acao = (rotulo, fn, classe = "botao-pequeno") => {
    const b = el("button", { class: classe, type: "button" }, rotulo);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await fn(); dlg.close(); await carregar(); } catch (e) { alert(e.message); b.disabled = false; }
    });
    botoes.push(b);
  };
  if (ehHeroi && m.estado === "quadro") acao("Aceitar missão", () => gh(`/issues/${m.numero}/labels`, { method: "POST", body: JSON.stringify({ labels: ["em-jornada"] }) }), "botao");
  if (ehHeroi && (m.estado === "quadro" || m.estado === "jornada")) {
    acao("Missão cumprida", () => gh(`/issues/${m.numero}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) }), "botao");
    acao("Recusar", () => gh(`/issues/${m.numero}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) }));
  }
  if (!ehHeroi && (m.estado === "quadro" || m.estado === "jornada")) {
    acao("Retirar do quadro", () => gh(`/issues/${m.numero}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) }));
  }
  if (m.estado === "cumprida" || m.estado === "recusada") {
    acao("Pregar de novo no quadro", () => gh(`/issues/${m.numero}`, { method: "PATCH", body: JSON.stringify({ state: "open" }) }));
  }

  const recados = el("div", {}, el("p", { class: "status" }, "Consultando os corvos…"));
  const campo = el("textarea", { placeholder: ehHeroi ? `Recado para ${cfg.dama}…` : `Recado para ${cfg.heroi}…`, maxlength: "2000" });
  const enviar = el("button", { class: "botao-pequeno", type: "button" }, "Enviar recado");
  enviar.addEventListener("click", async () => {
    const texto = campo.value.trim(); if (!texto) return;
    enviar.disabled = true;
    try {
      await gh(`/issues/${m.numero}/comments`, { method: "POST", body: JSON.stringify({ body: `<!-- quadro:autor ${sessao.papel} -->\n${texto}` }) });
      campo.value = ""; await carregarRecados(m, recados); carregar();
    } catch (e) { alert(e.message); }
    enviar.disabled = false;
  });
  const fechar = el("button", { class: "botao-pequeno", type: "button" }, "Fechar");
  fechar.addEventListener("click", () => dlg.close());

  art.replaceChildren(
    el("span", { class: `raridade r-${m.raridade}` }, `Missão ${RARIDADES[m.raridade]}`),
    el("h2", {}, m.titulo),
    el("p", { class: "status" }, STATUS[m.estado]),
    m.descricao ? el("p", { class: "corpo" }, m.descricao) : null,
    el("dl", {},
      el("dt", {}, "Recompensa"), el("dd", {}, m.recompensa || "A gratidão eterna da corte"),
      el("dt", {}, "Prazo"), el("dd", {}, m.prazo ? dataBR(m.prazo) : "Sem pressa"),
      el("dt", {}, "Lançada"), el("dd", {}, dataBR(m.criada)),
      m.fechada ? [el("dt", {}, "Encerrada"), el("dd", {}, dataBR(m.fechada))] : null),
    el("h3", {}, "Recados"), recados, campo,
    el("div", { class: "acoes" }, enviar),
    el("div", { class: "acoes", style: "margin-top:16px" }, ...botoes, fechar));
  dlg.showModal();
  art.scrollIntoView({ block: "start" });
  carregarRecados(m, recados);
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

/* ---------------- nova missão ---------------- */
function prepararNova() {
  const dlg = $("#dlg-nova"), form = $("#form-nova");
  $("#nova").addEventListener("click", () => { form.reset(); $("#erro-nova").textContent = ""; dlg.showModal(); });
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
      const c = $("#carimbo"); c.hidden = false; setTimeout(() => (c.hidden = true), 1900);
      abaAtual = "quadro";
      // a busca por rótulo do GitHub demora alguns segundos para ver a issue nova:
      // entra no quadro pela resposta da criação e a lista confirma depois
      if (nova?.number) { recentes.set(nova.number, { missao: lerMissao(nova), ts: Date.now() }); missoes = [lerMissao(nova), ...missoes]; desenhar(); setTimeout(() => carregar().catch(() => {}), 8000); }
      else await carregar();
    } catch (e) { $("#erro-nova").textContent = e.message; }
    btn.disabled = false; btn.textContent = "Selar e enviar";
  });
}

/* ---------------- entrada ---------------- */
function entrar() {
  // repo e nomes vêm de dentro do cofre: o repositório público não identifica ninguém
  cfg = { repo: sessao.repo, dama: sessao.dama || "Dama", heroi: sessao.heroi || "Herói" };
  $("#portao").hidden = true;
  $("#quadro").hidden = false;
  $("#saudacao").textContent = sessao.papel === "heroi"
    ? `Bem-vindo de volta, ${cfg.heroi}. A corte aguarda.`
    : `Saudações, ${cfg.dama}. Que missão o herói enfrentará hoje?`;
  $("#nova").hidden = sessao.papel !== "dama";
  carregar().catch((e) => $("#lista").replaceChildren(el("p", { class: "vazio" }, `Os corvos não voltaram: ${e.message}`)));
}

async function iniciar() {
  for (const b of document.querySelectorAll(".aba")) b.addEventListener("click", () => { abaAtual = b.dataset.aba; desenhar(); });
  $("#sair").addEventListener("click", () => { apagarSessao(); location.reload(); });
  prepararNova();
  window.addEventListener("focus", () => sessao && carregar().catch(() => {}));
  setInterval(() => sessao && !document.hidden && carregar().catch(() => {}), 60_000);

  if (DEMO) { sessao = { token: "demo", papel: new URLSearchParams(location.search).get("demo") || "dama", dama: "Dama", heroi: "Herói" }; return entrar(); }
  sessao = lerSessao();
  if (sessao) return entrar();

  $("#form-portao").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector("button"); btn.disabled = true; btn.textContent = "Consultando o guardião…";
    $("#erro-portao").textContent = "";
    try {
      const s = await abrirCofre($("#frase").value);
      if (!s) { $("#erro-portao").textContent = "Essas palavras não abrem esta porta."; return; }
      sessao = s; guardarSessao(s, $("#lembrar").checked); entrar();
    } catch (e) { $("#erro-portao").textContent = `O guardião dormiu: ${e.message}`; }
    finally { btn.disabled = false; btn.textContent = "Entrar na taverna"; }
  });
  $("#frase").focus();
}

/* ---------------- modo demonstração (?demo ou ?demo=heroi) ---------------- */
let demoIssues = null;
function demo(caminho, opcoes) {
  const agora = Date.now(), dia = 864e5;
  demoIssues ??= [
    { number: 4, title: "Resgatar a encomenda nos Correios", body: '<!-- quadro:v1 {"raridade":"epica","recompensa":"Um beijo e um café","prazo":"2026-11-24"} -->\nA agência fecha às 17h. Levar documento.', labels: [{ name: "missao" }], state: "open", created_at: new Date(agora - dia).toISOString(), comments: 1 },
    { number: 3, title: "Montar a prateleira da sala", body: '<!-- quadro:v1 {"raridade":"lendaria","recompensa":"Jantar à escolha do herói","prazo":""} -->\nOs parafusos estão na gaveta da cozinha.', labels: [{ name: "missao" }, { name: "em-jornada" }], state: "open", created_at: new Date(agora - 3 * dia).toISOString(), comments: 0 },
    { number: 2, title: "Trazer pão quentinho", body: '<!-- quadro:v1 {"raridade":"comum","recompensa":"","prazo":""} -->\n6 pães e 1 queijo minas.', labels: [{ name: "missao" }], state: "open", created_at: new Date(agora - 2 * dia).toISOString(), comments: 0 },
    { number: 1, title: "Derrotar a pilha de louça", body: '<!-- quadro:v1 {"raridade":"rara","recompensa":"Escolher o filme","prazo":""} -->\nInclusive a panela de ontem.', labels: [{ name: "missao" }], state: "closed", state_reason: "completed", created_at: new Date(agora - 6 * dia).toISOString(), closed_at: new Date(agora - 5 * dia).toISOString(), comments: 0 },
  ];
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
  const n = Number((caminho.match(/^\/issues\/(\d+)/) || [])[1]);
  const issue = demoIssues.find((i) => i.number === n);
  if (caminho.startsWith("/issues?")) return Promise.resolve(structuredClone(demoIssues));
  if (caminho === "/issues") { demoIssues.unshift({ number: demoIssues.length + 1, ...corpo, labels: [{ name: "missao" }], state: "open", created_at: new Date().toISOString(), comments: 0 }); return Promise.resolve({}); }
  if (caminho.endsWith("/comments") && opcoes.method === "POST") { issue.comments++; (issue._c ??= []).push({ body: corpo.body, created_at: new Date().toISOString() }); return Promise.resolve({}); }
  if (caminho.includes("/comments")) return Promise.resolve(issue._c ?? (n === 4 ? [{ body: "<!-- quadro:autor heroi -->\nAmanhã cedo eu passo lá.", created_at: new Date().toISOString() }] : []));
  if (caminho.endsWith("/labels")) { issue.labels.push({ name: "em-jornada" }); return Promise.resolve({}); }
  if (opcoes.method === "PATCH") { Object.assign(issue, corpo, { closed_at: new Date().toISOString() }); if (corpo.state === "open") issue.labels = [{ name: "missao" }]; return Promise.resolve({}); }
  return Promise.resolve([]);
}

iniciar();
