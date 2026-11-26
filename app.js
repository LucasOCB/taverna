// Quadro de Missões: GitHub Issues como livro de missões.
// O token vive cifrado no cofre.json; só a frase de acesso certa o abre.

const $ = (s, el = document) => el.querySelector(s);
const MARCA = /<!--\s*quadro:v1\s*(\{.*?\})\s*-->/s;
const AUTOR = /<!--\s*quadro:autor\s+(\w+)\s*-->/;
const RARIDADES = { comum: "Comum", rara: "Rara", epica: "Épica", lendaria: "Lendária" };
const PRIORIDADES = { baixa: "Quando der", media: "Importante", alta: "Urgente" };
const MARCA_C = /<!--\s*contrato:v1\s*(\{.*?\})\s*-->/s;
const EVENTO = /<!--\s*contrato:evento\s*(\{.*?\})\s*-->/s;
// JSON dentro de comentário HTML não pode ter "--"; o escape \u002d volta a ser "-" no JSON.parse
const seguro = (o) => JSON.stringify(o).replace(/--/g, "-\\u002d");
const SALAS = {
  missoes: { titulo: "Quadro de Missões", abas: { quadro: "No quadro", jornada: "Em jornada", concluidas: "Concluídas" } },
  contratos: { titulo: "Mesa de Contratos", abas: { mesa: "Na mesa", vigor: "Em vigor", arquivo: "Arquivo" } },
};
const CHAVE_SESSAO = "quadro-sessao";
const CHAVE_SOM = "quadro-som";
const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has("demo");
const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let cfg = {}, sessao, missoes = [], contratos = [], abaAtual = "quadro", primeiroDesenho = true;
let sala = "missoes";
const abaPorSala = { missoes: "quadro", contratos: "mesa" };
const eu = () => sessao.papel;
const outro = (p = sessao.papel) => (p === "dama" ? "heroi" : "dama");
const nomeDe = (p) => (p === "dama" ? cfg.dama : cfg.heroi);
const tituloDe = (p) => (p === "dama" ? "a Dama" : "o Herói");
function romano(n) {
  let s = "";
  for (const [v, l] of [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) while (n >= v) { s += l; n -= v; }
  return s;
}
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
    tipo: "missao",
    numero: issue.number,
    titulo: issue.title,
    descricao: corpo.replace(MARCA, "").trim(),
    raridade: RARIDADES[meta.raridade] ? meta.raridade : "comum",
    prioridade: PRIORIDADES[meta.prioridade] ? meta.prioridade : "baixa",
    prazo: meta.prazo || "",
    criada: issue.created_at,
    fechada: issue.closed_at,
    recados: issue.comments,
    estado,
  };
}

function lerContrato(issue) {
  let meta = {};
  const m = (issue.body || "").match(MARCA_C);
  if (m) { try { meta = JSON.parse(m[1]); } catch {} }
  meta.clausulas = Array.isArray(meta.clausulas) ? meta.clausulas.map(String) : [];
  meta.versao = Number(meta.versao) || 1;
  meta.assinaturas = meta.assinaturas && typeof meta.assinaturas === "object" ? meta.assinaturas : {};
  const rotulos = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  let estado = "mesa";
  if (issue.state === "closed") estado = issue.state_reason === "not_planned" ? "rasgado" : "encerrado";
  else if (rotulos.includes("em-vigor")) estado = "vigor";
  return { tipo: "contrato", numero: issue.number, titulo: issue.title, meta, estado,
    criada: issue.created_at, atualizada: issue.updated_at || issue.created_at, fechada: issue.closed_at };
}
const assinou = (c, p) => c.meta.assinaturas[p]?.v === c.meta.versao;
const vezDe = (c) => (c.estado === "mesa" ? ["dama", "heroi"].filter((p) => !assinou(c, p)) : []);
const venceu = (c) => c.meta.vigencia && c.meta.vigencia < new Date().toISOString().slice(0, 10);

function situacao(c) {
  if (c.estado === "mesa") {
    const v = vezDe(c);
    if (v.length !== 1) return "Aguarda as duas assinaturas";
    return v[0] === eu() ? "Sua vez: assinar, contrapropor ou recusar" : `Aguarda a assinatura de ${nomeDe(v[0])}`;
  }
  if (c.estado === "vigor") return venceu(c) ? `Venceu em ${dataBR(c.meta.vigencia)}` : `Em vigor desde ${dataBR(c.meta.vigor_desde || c.criada)}`;
  const quem = c.meta.por ? ` por ${nomeDe(c.meta.por)}` : "";
  const quando = c.fechada ? ` em ${dataBR(c.fechada)}` : "";
  if (c.estado === "rasgado") return (c.meta.retirado ? "Proposta retirada" : "Rasgado") + quem + quando;
  return `Encerrado${quem}${quando}`;
}

async function carregar() {
  const [is, cs] = await Promise.all([
    gh("/issues?state=all&labels=missao&per_page=100&sort=created&direction=desc"),
    gh("/issues?state=all&labels=contrato&per_page=100&sort=updated&direction=desc"),
  ]);
  missoes = is.filter((i) => !i.pull_request).map(lerMissao);
  contratos = cs.filter((i) => !i.pull_request).map(lerContrato);
  // a busca por rótulo do GitHub demora a enxergar o que acabou de mudar:
  // por 2 min vale a versão que a própria resposta da escrita devolveu
  for (const [n, r] of recentes) {
    const lista = r.tipo === "contrato" ? contratos : missoes;
    const i = lista.findIndex((x) => x.numero === n);
    if (Date.now() - r.ts > 120_000 || (i >= 0 && (r.tipo !== "contrato" || lista[i].atualizada >= r.item.atualizada))) recentes.delete(n);
    else if (i >= 0) lista[i] = r.item;
    else lista.unshift(r.item);
  }
  desenhar();
}

function guardarContrato(issue) {
  const c = lerContrato(issue);
  recentes.set(c.numero, { tipo: "contrato", item: c, ts: Date.now() });
  const i = contratos.findIndex((x) => x.numero === c.numero);
  if (i >= 0) contratos[i] = c; else contratos.unshift(c);
  return c;
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
  mesa: (c) => c.estado === "mesa",
  vigor: (c) => c.estado === "vigor",
  arquivo: (c) => c.estado === "rasgado" || c.estado === "encerrado",
};
const VAZIO = {
  quadro: "O quadro está vazio. Nenhum monstro à vista… por enquanto.",
  jornada: "Nenhum herói na estrada agora.",
  concluidas: "Ainda não há feitos para os bardos cantarem.",
  mesa: "A mesa está limpa. Nenhum acordo à espera de pena.",
  vigor: "Nenhum pacto selado ainda.",
  arquivo: "O baú de pergaminhos está vazio.",
};
// o que espera uma ação de quem está olhando (selo vermelho na sala)
const pendentes = {
  missoes: () => (eu() === "heroi" ? missoes.filter((m) => m.estado === "quadro").length : 0),
  contratos: () => contratos.filter((c) => vezDe(c).includes(eu())).length,
};
const ESTAMPA = { jornada: "Em jornada", cumprida: "Cumprida", recusada: "Recusada" };

function desenhar({ animar = false } = {}) {
  const nav = $(".abas");
  if (nav.dataset.sala !== sala) {
    nav.dataset.sala = sala;
    nav.replaceChildren(...Object.entries(SALAS[sala].abas).map(([k, rotulo]) => {
      const b = el("button", { class: "aba", "data-aba": k, role: "tab", type: "button" }, `${rotulo} `, el("span"));
      b.addEventListener("click", () => { abaAtual = k; desenhar({ animar: true }); });
      return b;
    }));
  }
  const todos = sala === "contratos" ? contratos : missoes;
  for (const b of nav.children) {
    b.classList.toggle("ativa", b.dataset.aba === abaAtual);
    b.setAttribute("aria-selected", b.dataset.aba === abaAtual);
    b.querySelector("span").textContent = todos.filter(NA_ABA[b.dataset.aba]).length;
  }
  for (const a of document.querySelectorAll(".sala")) {
    const n = pendentes[a.dataset.sala]();
    a.querySelector("span").textContent = n || "";
    a.querySelector("span").title = n ? `${n} esperando por você` : "";
  }
  let itens = todos.filter(NA_ABA[abaAtual]);
  if (sala === "contratos") itens = [...itens].sort((a, b) => vezDe(b).includes(eu()) - vezDe(a).includes(eu()));
  const pregar = animar || primeiroDesenho;
  primeiroDesenho = false;
  const fazer = sala === "contratos" ? cartaoContrato : cartao;
  $("#lista").classList.toggle("mesa", sala === "contratos");
  $("#lista").replaceChildren(...(itens.length ? itens.map((m, i) => fazer(m, i, pregar)) : [el("p", { class: "vazio" }, VAZIO[abaAtual])]));
  if (pregar && !SEM_MOVIMENTO && itens.length) {
    if (sala === "contratos") setTimeout(() => tocar("papel", { volume: .6 }), 200);
    else itens.slice(0, 4).forEach((_, i) => setTimeout(() => tocar("prego", { volume: .7 }), 380 + i * 110));
  }
}

function irPara(nova, { desenha = true } = {}) {
  if (!SALAS[nova]) nova = "missoes";
  abaPorSala[sala] = abaAtual;
  const mudou = nova !== sala;
  sala = nova; abaAtual = abaPorSala[sala];
  document.body.classList.toggle("na-mesa", sala === "contratos");
  $("#titulo-sala").textContent = SALAS[sala].titulo;
  document.title = SALAS[sala].titulo;
  for (const a of document.querySelectorAll(".sala")) {
    const ativa = a.dataset.sala === sala;
    a.classList.toggle("ativa", ativa);
    if (ativa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const heroi = eu() === "heroi";
  $("#saudacao").textContent = sala === "contratos"
    ? `${heroi ? `Bem-vindo, ${cfg.heroi}` : `Saudações, ${cfg.dama}`}. Palavra empenhada nesta mesa fica selada.`
    : heroi ? `Bem-vindo de volta, ${cfg.heroi}. A corte aguarda.` : `Saudações, ${cfg.dama}. Que missão o herói enfrentará hoje?`;
  $("#nova").hidden = sala === "missoes" && eu() !== "dama";
  $("#nova").textContent = sala === "contratos" ? "Redigir contrato" : "Pregar nova missão";
  if (desenha) desenhar({ animar: mudou });
}

function cartaoContrato(c, i, pregar) {
  const giro = [-1.4, 1.1, -.6, 1.6, -1, .5][i % 6];
  const papel = ["papel-a", "papel-b"][(c.numero + i) % 2];
  const minha = vezDe(c).includes(eu());
  const estilo = `--giro:${giro}deg;--atraso:${i * 90}ms;--desvio:0px;--largura:340px;--desce:0px;--papel:url("assets/${papel}.webp")`;
  const b = el("button", { class: `cartao contrato c-${c.estado}${pregar ? " pregando" : ""}${minha ? " minha-vez" : ""}`, style: estilo, type: "button" },
    el("span", { class: "raridade" }, `Contrato · versão ${c.meta.versao}`),
    el("h3", {}, c.titulo),
    el("p", { class: "resumo" }, c.meta.objeto || c.meta.clausulas[0] || ""),
    el("div", { class: "rodape" },
      el("span", {}, el("b", {}, "Cláusulas"), String(c.meta.clausulas.length)),
      el("span", { class: minha ? "vez" : "" }, el("b", {}, "Situação"), situacao(c))),
    minha ? el("span", { class: "fita" }, "Sua vez") : null,
    c.estado === "vigor" ? el("img", { class: "lacre-mini", src: "assets/selo.webp", alt: "Selado" }) : null,
    c.estado === "rasgado" ? el("span", { class: "estampa recusada" }, c.meta.retirado ? "Retirado" : "Rasgado") : null,
    c.estado === "encerrado" ? el("span", { class: "estampa cumprida" }, "Encerrado") : null);
  b.addEventListener("click", () => abrirContrato(c));
  return b;
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
      el("span", { class: `prioridade p-${m.prioridade}` }, el("b", {}, "Prioridade"), PRIORIDADES[m.prioridade]),
      m.prazo ? el("span", {}, el("b", {}, "Prazo"), dataBR(m.prazo)) : el("span", {}, el("b", {}, "Pregada"), dataBR(m.criada))),
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
  art.classList.remove("contrato-doc");
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
        el("dt", {}, "Prioridade"), el("dd", { class: `prioridade p-${m.prioridade}` }, PRIORIDADES[m.prioridade]),
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

/* ================= contratos ================= */
function corpoContrato(meta) {
  // o texto visível só serve para quem abrir a issue no app do GitHub; a página lê o JSON
  const linhas = [`<!-- contrato:v1 ${seguro(meta)} -->`, `**Contrato entre ${cfg.dama} e ${cfg.heroi}** · versão ${meta.versao}`, ""];
  if (meta.objeto) linhas.push(meta.objeto, "");
  meta.clausulas.forEach((t, i) => linhas.push(`${i + 1}. ${t.replace(/\s*\n\s*/g, " ")}`));
  if (meta.vigencia) linhas.push("", `Válido até ${dataBR(meta.vigencia)}.`);
  const ass = ["dama", "heroi"].filter((p) => meta.assinaturas[p]?.v === meta.versao).map(nomeDe);
  linhas.push("", ass.length ? `Assinado por: ${ass.join(" e ")}.` : "Sem assinaturas nesta versão.");
  return linhas.join("\n");
}

const ACONTECIDO = {
  proposta: (e) => `${nomeDe(e.autor)} propôs o contrato (versão ${e.versao})`,
  contraproposta: (e) => `${nomeDe(e.autor)} devolveu uma contraproposta (versão ${e.versao})`,
  emenda: (e) => `${nomeDe(e.autor)} emendou a própria proposta (versão ${e.versao})`,
  aditivo: (e) => `${nomeDe(e.autor)} propôs um aditivo ao contrato em vigor (versão ${e.versao})`,
  assinatura: (e) => `${nomeDe(e.autor)} assinou a versão ${e.versao}${e.selou ? ". O contrato está selado." : ""}`,
  recusa: (e) => `${nomeDe(e.autor)} rasgou o contrato`,
  retirada: (e) => `${nomeDe(e.autor)} retirou a proposta`,
  encerramento: (e) => `${nomeDe(e.autor)} deu o contrato por encerrado`,
  reabertura: (e) => `${nomeDe(e.autor)} devolveu o contrato à mesa`,
};
async function registrar(numero, evento) {
  const linhas = [`<!-- contrato:evento ${seguro(evento)} -->`, `**${(ACONTECIDO[evento.tipo] || (() => evento.tipo))(evento)}.**`];
  if (evento.clausulas) linhas.push("", ...evento.clausulas.map((t, i) => `${i + 1}. ${t.replace(/\s*\n\s*/g, " ")}`));
  if (evento.nota) linhas.push("", `> ${evento.nota.replace(/\n/g, "\n> ")}`);
  return gh(`/issues/${numero}/comments`, { method: "POST", body: JSON.stringify({ body: linhas.join("\n") }) });
}

// relê o contrato antes de escrever: se a outra parte mexeu nele nesse meio-tempo, para
async function mudarContrato(c, fn) {
  const atual = lerContrato(await gh(`/issues/${c.numero}`));
  if (atual.meta.versao !== c.meta.versao || atual.estado !== c.estado)
    throw new Error("O contrato mudou enquanto você lia. Feche e abra de novo para ver a versão nova.");
  const { meta, ...patch } = fn(structuredClone(atual.meta), atual);
  return gh(`/issues/${c.numero}`, { method: "PATCH", body: JSON.stringify({ ...patch, body: corpoContrato(meta) }) });
}

async function abrirContrato(c) {
  const dlg = $("#dlg-detalhe"), art = $("#detalhe");
  art.classList.add("contrato-doc");
  const me = eu(), v = c.meta.versao, minhaVez = vezDe(c).includes(me);
  const agora = () => new Date().toISOString();
  const pronto = async (issue, carimbo) => {
    dlg.close();
    guardarContrato(issue);
    if (carimbo) await carimbar(carimbo);
    desenhar();
    setTimeout(() => carregar().catch(() => {}), 8000);
  };

  const botoes = [];
  const acao = (rotulo, fn, { classe = "link", confirma } = {}) => {
    const b = el("button", { class: classe, type: "button" }, rotulo);
    let armado = 0;
    b.addEventListener("click", async () => {
      if (confirma && !armado) { // segundo toque confirma
        b.textContent = confirma; b.classList.add("armado");
        armado = setTimeout(() => { armado = 0; b.textContent = rotulo; b.classList.remove("armado"); }, 4000);
        return;
      }
      clearTimeout(armado); b.disabled = true;
      try { await fn(); } catch (e) { alert(e.message); b.disabled = false; }
    });
    botoes.push(b);
  };
  const fechar = (tipo, estado, motivo, extra = {}) => async () => {
    const issue = await mudarContrato(c, (meta) => ({ meta: { ...meta, por: me, ...extra }, state: estado, ...(motivo ? { state_reason: motivo } : {}) }));
    await registrar(c.numero, { tipo, versao: v, autor: me });
    await pronto(issue, tipo === "encerramento" ? "Contrato encerrado e guardado no baú" : "");
  };

  // assinatura: escrever o próprio nome, como numa folha de verdade
  const campoAss = el("input", { class: "assinatura", autocomplete: "off", placeholder: nomeDe(me), "aria-label": "Seu nome" });
  const erroAss = el("p", { class: "erro", role: "alert" });
  const selar = el("button", { class: "botao", type: "button" }, "Selar assinatura");
  const blocoAss = el("div", { class: "assinar", hidden: "" },
    el("label", { class: "campo" }, `Escreva seu nome para assinar a versão ${v}`, campoAss), erroAss, el("div", { class: "acoes" }, selar));
  selar.addEventListener("click", async () => {
    if (normalizar(campoAss.value) !== normalizar(nomeDe(me))) { erroAss.textContent = `Assine com seu nome: ${nomeDe(me)}.`; return; }
    selar.disabled = true; selar.textContent = "Selando…";
    try {
      let selou = false;
      const issue = await mudarContrato(c, (meta) => {
        meta.assinaturas[me] = { v: meta.versao, em: agora() };
        selou = meta.assinaturas[outro()]?.v === meta.versao;
        if (selou) meta.vigor_desde = agora();
        return { meta, labels: selou ? ["contrato", "em-vigor"] : ["contrato"] };
      });
      await registrar(c.numero, { tipo: "assinatura", versao: v, autor: me, ...(selou ? { selou: true } : {}) });
      if (selou) abaAtual = "vigor";
      await pronto(issue, selou ? "Contrato selado. Está em vigor" : "Assinatura lançada");
    } catch (e) { erroAss.textContent = e.message; selar.disabled = false; selar.textContent = "Selar assinatura"; }
  });

  if (c.estado === "mesa" && minhaVez) {
    const b = el("button", { class: "botao", type: "button" }, "Assinar");
    b.addEventListener("click", () => { blocoAss.hidden = false; b.hidden = true; campoAss.focus(); });
    botoes.push(b);
    acao("contraproposta", async () => { dlg.close(); abrirEditor(c, "contraproposta"); });
    acao("recusar", fechar("recusa", "closed", "not_planned"), { confirma: "rasgar mesmo?" });
  }
  if (c.estado === "mesa" && !minhaVez) {
    acao("emendar", async () => { dlg.close(); abrirEditor(c, "emenda"); });
    acao("retirar proposta", fechar("retirada", "closed", "not_planned", { retirado: true }), { confirma: "retirar mesmo?" });
  }
  if (c.estado === "vigor") {
    acao("propor aditivo", async () => { dlg.close(); abrirEditor(c, "aditivo"); });
    acao("encerrar", fechar("encerramento", "closed", "completed"), { confirma: "encerrar mesmo?" });
  }
  if (c.estado === "rasgado") acao("devolver à mesa", async () => {
    const issue = await mudarContrato(c, (meta) => ({ meta: { ...meta, assinaturas: {}, por: null, retirado: false }, state: "open", labels: ["contrato"] }));
    await registrar(c.numero, { tipo: "reabertura", versao: v, autor: me });
    abaAtual = "mesa";
    await pronto(issue, "");
  });
  const fecharBtn = el("button", { class: "link", type: "button" }, "fechar");
  fecharBtn.addEventListener("click", () => dlg.close());

  const clausulas = el("ol", { class: "clausulas" }, c.meta.clausulas.map((t, i) =>
    el("li", {}, el("b", {}, `Cláusula ${romano(i + 1)}`), el("p", {}, t))));
  const firma = (p) => {
    const a = c.meta.assinaturas[p], ok = a?.v === v;
    return el("div", { class: `firma${ok ? " ok" : ""}` },
      el("span", { class: "rubrica" }, ok ? nomeDe(p) : ""),
      el("small", {}, `${nomeDe(p)}, ${tituloDe(p)}`),
      el("small", { class: "quando" }, ok ? `assinou em ${dataBR(a.em)}` : a ? `assinou a versão ${a.v}, não esta` : "ainda não assinou"));
  };

  const registro = el("div", {}, el("p", { class: "status" }, "Consultando o escrivão…"));
  const campo = el("textarea", { placeholder: `Recado para ${nomeDe(outro())}`, maxlength: "2000" });
  const enviar = el("button", { class: "link", type: "button" }, "enviar recado");
  enviar.addEventListener("click", async () => {
    const texto = campo.value.trim(); if (!texto) return;
    enviar.disabled = true;
    try {
      await gh(`/issues/${c.numero}/comments`, { method: "POST", body: JSON.stringify({ body: `<!-- quadro:autor ${me} -->\n${texto}` }) });
      campo.value = ""; await carregarRegistro(c, registro, clausulas);
    } catch (e) { alert(e.message); }
    enviar.disabled = false;
  });

  const titulo = el("h2", { "data-pena": "" }, c.titulo);
  art.replaceChildren(
    el("p", { class: "raridade r-lendaria" }, `Contrato · versão ${v}`),
    titulo,
    el("div", { class: "depois" },
      el("p", { class: `status${minhaVez ? " vez" : ""}` }, situacao(c)),
      el("p", { class: "preambulo" }, `Pelo presente, ${cfg.dama}, a Dama, e ${cfg.heroi}, o Herói, firmam o que segue.`),
      c.meta.objeto ? el("p", { class: "corpo" }, c.meta.objeto) : null,
      clausulas,
      el("dl", {},
        el("dt", {}, "Válido até"), el("dd", {}, c.meta.vigencia ? dataBR(c.meta.vigencia) : "Sem prazo"),
        el("dt", {}, "Esta versão"), el("dd", {}, `Redigida por ${nomeDe(c.meta.autor || "dama")}`),
        el("dt", {}, "Na mesa desde"), el("dd", {}, dataBR(c.criada))),
      el("div", { class: "firmas" }, firma("dama"), firma("heroi")),
      blocoAss,
      el("div", { class: "acoes" }, ...botoes, fecharBtn),
      el("h3", {}, "Registro"), registro, campo,
      el("div", { class: "acoes" }, enviar)));
  tocar("papel");
  dlg.showModal();
  dlg.scrollTop = 0;
  carregarRegistro(c, registro, clausulas);
  pularEscrita = false;
  await espera(260);
  escrever(titulo, { vel: 38 });
}

async function carregarRegistro(c, alvo, clausulas) {
  try {
    const lista = await gh(`/issues/${c.numero}/comments?per_page=100`);
    const versoes = new Map();
    const itens = lista.map((com) => {
      const m = com.body.match(EVENTO);
      if (m) {
        let e = {}; try { e = JSON.parse(m[1]); } catch {}
        if (Array.isArray(e.clausulas)) versoes.set(e.versao, e.clausulas);
        return el("div", { class: `recado evento ${e.autor || ""}` },
          el("small", {}, dataBR(com.created_at)),
          el("p", {}, (ACONTECIDO[e.tipo] || (() => "Registro"))(e)),
          e.nota ? el("p", { class: "nota" }, e.nota) : null,
          Array.isArray(e.clausulas) && e.versao !== c.meta.versao ? el("details", {}, el("summary", {}, `ver a versão ${e.versao}`),
            el("ol", {}, e.clausulas.map((t) => el("li", {}, t)))) : null);
      }
      const papel = (com.body.match(AUTOR) || [, "heroi"])[1];
      return el("div", { class: `recado ${papel}` },
        el("small", {}, `${nomeDe(papel)} · ${dataBR(com.created_at)}`),
        el("p", {}, com.body.replace(AUTOR, "").trim()));
    });
    alvo.replaceChildren(...(itens.length ? itens : [el("p", { class: "status" }, "Nada registrado ainda.")]));
    // o que mudou desde a versão anterior, para quem vai decidir
    const antes = versoes.get(c.meta.versao - 1);
    if (antes && c.estado === "mesa") {
      const lis = [...clausulas.children];
      lis.forEach((li, i) => { if (!antes.includes(c.meta.clausulas[i])) { li.classList.add("mudou"); li.querySelector("b").append(el("em", {}, " · nova ou alterada")); } });
      for (const t of antes.filter((t) => !c.meta.clausulas.includes(t)))
        clausulas.append(el("li", { class: "retirada" }, el("b", {}, "Retirada nesta versão"), el("p", {}, t)));
    }
  } catch (e) { alvo.replaceChildren(el("p", { class: "erro" }, e.message)); }
}

/* ================= redigir contrato ================= */
let editando = null; // { c, modo } quando é contraproposta, emenda ou aditivo
const TITULO_EDITOR = { novo: "Novo contrato", contraproposta: "Contraproposta", emenda: "Emenda", aditivo: "Aditivo" };
const CARIMBO_EDITOR = { contraproposta: "Contraproposta selada", emenda: "Emenda selada", aditivo: "Aditivo selado" };

function linhaClausula(texto = "") {
  const ta = el("textarea", { rows: "2", maxlength: "1000", placeholder: "O que fica acordado" });
  ta.value = texto;
  const tirar = el("button", { class: "tirar", type: "button", title: "Tirar cláusula", "aria-label": "Tirar cláusula" }, "×");
  const li = el("li", {}, el("span", { class: "num" }), ta, tirar);
  tirar.addEventListener("click", () => {
    const ol = $("#editor-clausulas");
    if (ol.children.length > 1) { li.remove(); numerarClausulas(); } else ta.value = "";
  });
  return li;
}
const numerarClausulas = () => [...$("#editor-clausulas").children].forEach((li, i) => { li.querySelector(".num").textContent = `Cláusula ${romano(i + 1)}`; });

async function abrirEditor(c = null, modo = "novo") {
  const form = $("#form-contrato"), f = form.elements, dlg = $("#dlg-contrato");
  form.reset(); $("#erro-contrato").textContent = "";
  editando = c ? { c, modo } : null;
  const titulo = $("#contrato-titulo-form");
  titulo.dataset.texto = TITULO_EDITOR[modo];
  $("#contrato-partes").textContent = `Entre ${cfg.dama}, a Dama, e ${cfg.heroi}, o Herói.`;
  f.titulo.value = c ? c.titulo : "";
  f.objeto.value = c?.meta.objeto || "";
  f.vigencia.value = c?.meta.vigencia || "";
  const lista = c?.meta.clausulas.length ? c.meta.clausulas : ["", ""];
  $("#editor-clausulas").replaceChildren(...lista.map(linhaClausula));
  numerarClausulas();
  $("#campo-nota").hidden = !c;
  f.assinatura.placeholder = nomeDe(eu());
  $("#dica-assinatura").textContent = c
    ? `Ao assinar, a versão ${c.meta.versao + 1} vai para ${nomeDe(outro())}, que decide se assina.`
    : `Ao propor você já assina sua parte. ${nomeDe(outro())} assina, contrapropõe ou recusa.`;
  $("#btn-contrato").textContent = c ? "Assinar e devolver" : "Assinar e propor";
  tocar("papel"); dlg.showModal(); dlg.scrollTop = 0; pularEscrita = false;
  await espera(240); escrever(titulo, { vel: 45 });
}

function prepararEditor() {
  const form = $("#form-contrato"), dlg = $("#dlg-contrato");
  $("#mais-clausula").addEventListener("click", () => {
    const li = linhaClausula(); $("#editor-clausulas").append(li); numerarClausulas(); li.querySelector("textarea").focus();
  });
  form.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "enviar") return;
    ev.preventDefault();
    const f = form.elements, erro = $("#erro-contrato"), btn = $("#btn-contrato");
    const titulo = f.titulo.value.trim(), objeto = f.objeto.value.trim(), vigencia = f.vigencia.value, nota = f.nota.value.trim();
    const clausulas = [...$("#editor-clausulas").querySelectorAll("textarea")].map((t) => t.value.trim()).filter(Boolean);
    erro.textContent = "";
    if (!titulo) return void (erro.textContent = "Todo contrato precisa de um nome.");
    if (!clausulas.length) return void (erro.textContent = "Escreva ao menos uma cláusula.");
    const c = editando?.c, modo = editando?.modo || "novo";
    if (c && titulo === c.titulo && objeto === (c.meta.objeto || "") && vigencia === (c.meta.vigencia || "") && JSON.stringify(clausulas) === JSON.stringify(c.meta.clausulas))
      return void (erro.textContent = "Nada mudou. Para concordar com esta versão, é só assinar.");
    if (normalizar(f.assinatura.value) !== normalizar(nomeDe(eu()))) return void (erro.textContent = `Assine com seu nome: ${nomeDe(eu())}.`);
    btn.disabled = true; btn.textContent = "Selando…";
    try {
      const versao = c ? c.meta.versao + 1 : 1;
      const meta = { versao, autor: eu(), objeto, clausulas, vigencia, assinaturas: { [eu()]: { v: versao, em: new Date().toISOString() } } };
      const evento = { tipo: c ? modo : "proposta", versao, autor: eu(), clausulas, ...(nota ? { nota } : {}) };
      let issue;
      if (c) issue = await mudarContrato(c, () => ({ meta, title: titulo, labels: ["contrato"] }));
      else issue = await gh("/issues", { method: "POST", body: JSON.stringify({ title: titulo, body: corpoContrato(meta), labels: ["contrato"] }) });
      await registrar(issue.number, evento);
      dlg.close();
      guardarContrato(issue);
      await carimbar(c ? `${CARIMBO_EDITOR[modo]} e entregue a ${nomeDe(outro())}` : "Contrato posto na mesa");
      abaAtual = "mesa"; desenhar({ animar: true });
      setTimeout(() => carregar().catch(() => {}), 8000);
    } catch (e) { erro.textContent = e.message; }
    btn.disabled = false; btn.textContent = c ? "Assinar e devolver" : "Assinar e propor";
  });
}

/* ================= nova missão ================= */
function prepararNova() {
  const dlg = $("#dlg-nova"), form = $("#form-nova");
  $("#nova").addEventListener("click", async () => {
    if (sala === "contratos") return abrirEditor();
    form.reset(); $("#erro-nova").textContent = "";
    tocar("papel"); dlg.showModal(); pularEscrita = false;
    await espera(240); escrever($(".folha-titulo", form), { vel: 45 });
  });
  form.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "enviar") return;
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const btn = $("#btn-enviar"); btn.disabled = true; btn.textContent = "Selando…";
    const meta = { raridade: d.raridade, prioridade: d.prioridade, prazo: d.prazo };
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
        recentes.set(nova.number, { tipo: "missao", item: lerMissao(nova), ts: Date.now() });
        missoes = [lerMissao(nova), ...missoes]; desenhar({ animar: true });
        setTimeout(() => carregar().catch(() => {}), 8000);
      } else { await carregar(); desenhar({ animar: true }); }
    } catch (e) { $("#erro-nova").textContent = e.message; }
    btn.disabled = false; btn.textContent = "Selar e pregar";
  });
}

async function carimbar(texto = "Missão pregada no quadro") {
  const c = $("#carimbo");
  $("#carimbo-texto").textContent = texto;
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
  // decide o que a carta mostra ANTES de desenrolar: o rolo para na altura
  // medida ali; se o conteúdo mudar depois, os botões ficam atrás dele
  const lembrada = lerSessao();
  $("#form-portao").hidden = !!lembrada;
  $("#bem-vinda").hidden = !lembrada;
  await desenrolar();
  if (lembrada) $("#carta-fala").textContent = lembrada.papel === "heroi"
    ? `Bem-vindo de volta, ${lembrada.heroi || "herói"}. A corte aguarda.`
    : `Bem-vinda de volta, ${lembrada.dama || "Dama"}. O herói aguarda suas ordens.`;
  await escrever($(".carta-titulo"), { vel: 70 });
  await escrever($("#carta-fala"), { vel: 30 });
  const alvo = lembrada ? $("#bem-vinda") : $("#form-portao");
  requestAnimationFrame(() => alvo.classList.add("visivel"));
  if (!lembrada) $("#frase").focus({ preventScroll: true });
}

function entrar() {
  cfg = { repo: sessao.repo, dama: sessao.dama || "Dama", heroi: sessao.heroi || "Herói" };
  document.body.classList.replace("no-portao", "no-quadro");
  $("#portao").hidden = true;
  $("#quadro").hidden = false;
  irPara(location.hash.slice(1), { desenha: false });
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

  addEventListener("hashchange", () => { if (sessao && !$("#quadro").hidden) irPara(location.hash.slice(1)); });
  $("#sair").addEventListener("click", () => { apagarSessao(); location.reload(); });
  prepararNova();
  prepararEditor();
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

/* ================= modo demonstração (?demo, ?demo=heroi, &direto, #contratos) ================= */
let demoIssues = null;
function demoContrato(numero, titulo, meta, estado, eventos, dias) {
  const agora = Date.now(), dia = 864e5;
  const m = { objeto: "", vigencia: "", ...meta };
  return {
    number: numero, title: titulo, body: corpoContrato(m),
    labels: [{ name: "contrato" }, ...(estado === "vigor" ? [{ name: "em-vigor" }] : [])],
    state: estado === "rasgado" ? "closed" : "open", state_reason: estado === "rasgado" ? "not_planned" : null,
    created_at: new Date(agora - dias * dia).toISOString(), updated_at: new Date(agora - dia / 3).toISOString(),
    closed_at: estado === "rasgado" ? new Date(agora - dia).toISOString() : null, comments: eventos.length,
    _c: eventos.map(([e, d]) => ({ body: `<!-- contrato:evento ${seguro(e)} -->`, created_at: new Date(agora - d * dia).toISOString() })),
  };
}
function demo(caminho, opcoes) {
  const agora = Date.now(), dia = 864e5, iso = (d) => new Date(agora - d * dia).toISOString();
  const louca1 = ["Quem cozinha não lava.", "A louça do jantar é lavada antes de dormir."];
  const louca2 = ["Quem cozinha não lava.", "A louça do jantar é lavada até o café da manhã seguinte.", "Panela de molho pode ficar de molho, uma noite só."];
  const remoto = ["O controle remoto alterna de dono a cada episódio.", "Spoiler custa uma sobremesa."];
  demoIssues ??= [
    { number: 4, title: "Resgatar a encomenda nos Correios", body: '<!-- quadro:v1 {"raridade":"epica","prioridade":"alta","prazo":"2026-11-24"} -->\nA agência fecha às 17h. Levar documento.', labels: [{ name: "missao" }], state: "open", created_at: iso(1), comments: 1 },
    { number: 3, title: "Montar a prateleira da sala", body: '<!-- quadro:v1 {"raridade":"lendaria","prioridade":"media","prazo":""} -->\nOs parafusos estão na gaveta da cozinha.', labels: [{ name: "missao" }, { name: "em-jornada" }], state: "open", created_at: iso(3), comments: 0 },
    { number: 2, title: "Trazer pão quentinho", body: '<!-- quadro:v1 {"raridade":"comum","prioridade":"baixa","prazo":""} -->\n6 pães e 1 queijo minas.', labels: [{ name: "missao" }], state: "open", created_at: iso(2), comments: 0 },
    { number: 5, title: "Caçar a aranha do banheiro", body: '<!-- quadro:v1 {"raridade":"lendaria","prioridade":"media","prazo":"2026-11-22"} -->\nEla está atrás do espelho. Sem matar, levar para fora.', labels: [{ name: "missao" }], state: "open", created_at: iso(.5), comments: 0 },
    { number: 1, title: "Derrotar a pilha de louça", body: '<!-- quadro:v1 {"raridade":"rara","prioridade":"baixa","prazo":""} -->\nInclusive a panela de ontem.', labels: [{ name: "missao" }], state: "closed", state_reason: "completed", created_at: iso(6), closed_at: iso(5), comments: 0 },
    demoContrato(12, "Pacto da Louça", { versao: 2, autor: "heroi", objeto: "Quem lava o quê, e até quando, nesta casa.", clausulas: louca2,
      assinaturas: { heroi: { v: 2, em: iso(.4) }, dama: { v: 1, em: iso(2) } } }, "mesa",
      [[{ tipo: "proposta", versao: 1, autor: "dama", clausulas: louca1 }, 2],
       [{ tipo: "contraproposta", versao: 2, autor: "heroi", clausulas: louca2, nota: "Antes de dormir é cruel depois de um jantar grande. Café da manhã é prazo justo." }, .4]], 2),
    demoContrato(13, "Acordo do café de domingo", { versao: 1, autor: "heroi", clausulas: ["Domingo o café é na padaria da esquina.", "Quem acordar primeiro escolhe a mesa."],
      assinaturas: { heroi: { v: 1, em: iso(.2) } }, vigencia: "2026-12-31" }, "mesa",
      [[{ tipo: "proposta", versao: 1, autor: "heroi", clausulas: ["Domingo o café é na padaria da esquina.", "Quem acordar primeiro escolhe a mesa."] }, .2]], .2),
    demoContrato(11, "Tratado do Controle Remoto", { versao: 1, autor: "dama", objeto: "Paz duradoura na sala de estar.", clausulas: remoto,
      assinaturas: { dama: { v: 1, em: iso(9) }, heroi: { v: 1, em: iso(8) } }, vigor_desde: iso(8) }, "vigor",
      [[{ tipo: "proposta", versao: 1, autor: "dama", clausulas: remoto }, 9], [{ tipo: "assinatura", versao: 1, autor: "heroi", selou: true }, 8]], 9),
    demoContrato(10, "Cláusula do último pedaço", { versao: 1, autor: "heroi", clausulas: ["O último pedaço de pizza é sempre do herói."],
      assinaturas: { heroi: { v: 1, em: iso(12) } }, por: "dama" }, "rasgado",
      [[{ tipo: "proposta", versao: 1, autor: "heroi", clausulas: ["O último pedaço de pizza é sempre do herói."] }, 12], [{ tipo: "recusa", versao: 1, autor: "dama" }, 11]], 12),
  ];
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
  const n = Number((caminho.match(/^\/issues\/(\d+)/) || [])[1]);
  const issue = demoIssues.find((i) => i.number === n);
  const agoraIso = new Date().toISOString();
  const r = (x) => Promise.resolve(structuredClone(x));
  if (caminho.startsWith("/issues?")) {
    const rotulo = new URLSearchParams(caminho.split("?")[1]).get("labels");
    return r(demoIssues.filter((i) => i.labels.some((l) => l.name === rotulo)));
  }
  if (caminho === "/issues") {
    const nova = { number: 100 + demoIssues.length, ...corpo, labels: (corpo.labels || ["missao"]).map((name) => ({ name })), state: "open", created_at: agoraIso, updated_at: agoraIso, comments: 0 };
    demoIssues.unshift(nova); return r(nova);
  }
  if (caminho.endsWith("/comments") && opcoes.method === "POST") { issue.comments++; (issue._c ??= []).push({ body: corpo.body, created_at: agoraIso }); return r({}); }
  if (caminho.includes("/comments")) return r(issue._c ?? (n === 4 ? [{ body: "<!-- quadro:autor heroi -->\nAmanhã cedo eu passo lá.", created_at: agoraIso }] : []));
  if (caminho.endsWith("/labels")) { issue.labels.push({ name: "em-jornada" }); return r({}); }
  if (opcoes.method === "PATCH") {
    const ehContrato = issue.labels.some((l) => l.name === "contrato");
    if (corpo.state === "closed") issue.closed_at = agoraIso;
    if (corpo.state === "open") { issue.closed_at = null; if (!ehContrato) issue.labels = [{ name: "missao" }]; }
    Object.assign(issue, corpo, { updated_at: agoraIso });
    if (corpo.labels) issue.labels = corpo.labels.map((name) => ({ name }));
    return r(issue);
  }
  if (n && !opcoes.method) return r(issue);
  return Promise.resolve([]);
}

iniciar();
