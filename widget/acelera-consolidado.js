// ═══════════════════════════════════════════════════════════════
//  ACELERA HUB — Widget CONSOLIDADO (app Scriptable)
//  Faturamento do mês por fonte: cursos + mentorias + assessorias.
//  Replica a lógica da aba Financeiro do Hub (calcFinanceiro).
//  Instalação: veja widget/README.md
// ═══════════════════════════════════════════════════════════════

const DATA_URL  = 'https://brunesk.github.io/acelera-hub/data/latest.json';
const DB        = 'https://mentorias-bruno-default-rtdb.firebaseio.com';
const PANEL_URL = 'https://brunesk.github.io/acelera-hub/';
const CACHE     = 'acelera-hub-consolidado.json';

// Custo fixo mensal — mesmo valor usado na aba Financeiro do Hub.
const FIXOS = 311;

const C = {
  bg1:    '#141726',
  bg2:    '#0c0e16',
  text:   '#f7f8fd',
  muted:  '#9aa3bd',
  amber:  '#f5a623',
  green:  '#00e87a',
  red:    '#ff4757',
  blue:   '#4a9eff',
  purple: '#a78bfa',
};

// ── Coleta ─────────────────────────────────────────────────────
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE);

async function json(url) {
  const req = new Request(url);
  req.timeoutInterval = 12;
  return await req.loadJSON();
}

// Busca as três fontes. Cursos é obrigatório; Firebase é opcional —
// se cair, o widget ainda mostra o resto e sinaliza que faltou fonte.
async function coletar() {
  let cursos = null, parcial = false;
  try {
    cursos = await json(DATA_URL);
    if (!cursos || !cursos.kpis) throw new Error('payload inválido');
  } catch (e) {
    cursos = null;
  }

  let slots = {}, assessorias = {}, config = {};
  try {
    const [s, a, c] = await Promise.all([
      json(`${DB}/slots.json`),
      json(`${DB}/assessorias.json`),
      json(`${DB}/config.json`),
    ]);
    slots       = s || {};
    assessorias = a || {};
    config      = c || {};
  } catch (e) {
    parcial = true;
  }

  if (!cursos) {
    // Sem o arquivo de cursos não há mês de referência; cai para o cache.
    if (fm.fileExists(cachePath)) {
      try { return Object.assign(JSON.parse(fm.readString(cachePath)), { offline: true }); }
      catch (_) {}
    }
    return null;
  }

  const dados = { cursos, slots, assessorias, config, parcial };
  fm.writeString(cachePath, JSON.stringify(dados));
  return Object.assign(dados, { offline: false });
}

// ── Cálculo (espelha calcFinanceiro do index.html) ─────────────
function consolidar(d) {
  const k = d.cursos.kpis;
  const mesKey = d.cursos.mes_key;

  // Cursos: líquido Hotmart + receita externa, já calculado no pipeline.
  const cursos = Math.round(Number(k.liq) || 0);

  // Assessorias: pagamentos registrados no mês selecionado.
  const assessorias = Object.values(d.assessorias || {}).reduce((s, a) => {
    const p = a && a.pagamentos && a.pagamentos[mesKey];
    return s + ((p && Number(p.valor)) || 0);
  }, 0);

  // Mentorias: slots do mês já ocupados × preço configurado.
  const preco = parseFloat(d.config && d.config.preco) || 0;
  const realizadas = Object.values(d.slots || {}).filter(s =>
    s && typeof s.data === 'string' && s.data.slice(0, 7) === mesKey && !s.disponivel
  ).length;
  const mentorias = realizadas * preco;

  const total  = cursos + mentorias + assessorias;
  const meta   = Math.round(Number(k.gasto_meta) || 0);
  const lucro  = total - meta - FIXOS;
  const margem = total > 0 ? Math.round((lucro / total) * 100) : 0;

  return { mesKey, cursos, mentorias, assessorias, realizadas, total, meta, lucro, margem };
}

// ── Formatação ─────────────────────────────────────────────────
const sep = i => i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function moeda(v, { compacto = false, centavos = false } = {}) {
  const n = Number(v) || 0, sinal = n < 0 ? '-' : '', abs = Math.abs(n);
  if (compacto && abs >= 10000) {
    const mil = abs / 1000;
    return `${sinal}R$ ${mil.toFixed(mil >= 100 ? 0 : 1).replace('.', ',')} mil`;
  }
  if (!centavos) return `${sinal}R$ ${sep(Math.round(abs).toString())}`;
  const [int, dec] = abs.toFixed(2).split('.');
  return `${sinal}R$ ${sep(int)},${dec}`;
}

// ── Componentes ────────────────────────────────────────────────
function texto(pai, valor, { cor = C.text, tam = 12, peso = 'regular', opacidade = 1 } = {}) {
  const t = pai.addText(String(valor));
  t.textColor = new Color(cor);
  t.font = peso === 'bold'   ? Font.boldSystemFont(tam)
         : peso === 'medium' ? Font.mediumSystemFont(tam)
         : Font.systemFont(tam);
  t.textOpacity = opacidade;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function fundo(w) {
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = PANEL_URL;
}

function cabecalho(w, d, c) {
  const l = w.addStack();
  l.centerAlignContent();
  texto(l, 'CONSOLIDADO', { cor: C.amber, tam: 10, peso: 'bold' });
  l.addSpacer(4);
  texto(l, d.cursos.periodo || '', { cor: C.muted, tam: 9 });
  l.addSpacer();
  if (d.offline || d.parcial) texto(l, '⚠︎', { cor: C.amber, tam: 9 });
}

// Linha de legenda: ● rótulo ......... valor
function fonte(pai, cor, rotulo, valor, { tam = 11 } = {}) {
  const l = pai.addStack();
  l.centerAlignContent();
  texto(l, '●', { cor, tam: tam - 1 });
  l.addSpacer(5);
  texto(l, rotulo, { cor: C.muted, tam });
  l.addSpacer();
  texto(l, valor, { cor: C.text, tam, peso: 'bold' });
  return l;
}

// ── Barra empilhada das fontes ─────────────────────────────────
function barra(fatias, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const r = h / 2;

  // trilho
  dc.setFillColor(new Color(C.muted, 0.16));
  dc.fillRect(new Rect(0, 0, w, h));

  if (total <= 0) return dc.getImage();

  let x = 0;
  fatias.forEach(f => {
    if (f.valor <= 0) return;
    const largura = (f.valor / total) * w;
    dc.setFillColor(new Color(f.cor, 1));
    dc.fillRect(new Rect(x, 0, Math.max(largura - 1.5, 1), h));
    x += largura;
  });

  return dc.getImage();
}

function grafico(w, c, largura, altura) {
  const img = w.addImage(barra([
    { valor: c.cursos,      cor: C.green  },
    { valor: c.mentorias,   cor: C.blue   },
    { valor: c.assessorias, cor: C.purple },
  ], largura, altura));
  img.imageSize = new Size(largura, altura);
  img.centerAlignImage();
}

// ── Layouts ────────────────────────────────────────────────────
function widgetErro() {
  const w = new ListWidget();
  fundo(w);
  w.addSpacer();
  texto(w, 'CONSOLIDADO', { cor: C.amber, tam: 11, peso: 'bold' });
  w.addSpacer(4);
  texto(w, 'Sem dados', { cor: C.text, tam: 15, peso: 'bold' });
  texto(w, 'Verifique a conexão', { cor: C.muted, tam: 10 });
  w.addSpacer();
  return w;
}

function widgetPequeno(d, c) {
  const w = new ListWidget();
  fundo(w);
  w.setPadding(12, 13, 12, 13);

  cabecalho(w, d, c);
  w.addSpacer(6);

  texto(w, 'FATURAMENTO', { cor: C.muted, tam: 9 });
  texto(w, moeda(c.total, { compacto: true }), { cor: C.green, tam: 22, peso: 'bold' });

  w.addSpacer(6);
  grafico(w, c, 128, 7);
  w.addSpacer(6);

  fonte(w, C.green,  'Cursos',      moeda(c.cursos,      { compacto: true }), { tam: 10 });
  w.addSpacer(3);
  fonte(w, C.blue,   'Mentorias',   moeda(c.mentorias,   { compacto: true }), { tam: 10 });
  w.addSpacer(3);
  fonte(w, C.purple, 'Assessorias', moeda(c.assessorias, { compacto: true }), { tam: 10 });

  return w;
}

function widgetMedio(d, c) {
  const w = new ListWidget();
  fundo(w);
  w.setPadding(13, 15, 13, 15);

  cabecalho(w, d, c);
  w.addSpacer(7);

  const corpo = w.addStack();
  corpo.centerAlignContent();

  const esq = corpo.addStack();
  esq.layoutVertically();
  texto(esq, 'FATURAMENTO DO MÊS', { cor: C.muted, tam: 9 });
  texto(esq, moeda(c.total), { cor: C.green, tam: 24, peso: 'bold' });
  esq.addSpacer(3);
  const res = esq.addStack();
  res.centerAlignContent();
  texto(res, 'lucro ', { cor: C.muted, tam: 9 });
  texto(res, moeda(c.lucro), { cor: c.lucro >= 0 ? C.green : C.red, tam: 9, peso: 'bold' });
  texto(res, ` · margem ${c.margem}%`, { cor: C.muted, tam: 9 });

  corpo.addSpacer();

  const dir = corpo.addStack();
  dir.layoutVertically();
  dir.addSpacer(2);
  fonte(dir, C.green,  'Cursos',      moeda(c.cursos,      { compacto: true }));
  dir.addSpacer(4);
  fonte(dir, C.blue,   'Mentorias',   moeda(c.mentorias,   { compacto: true }));
  dir.addSpacer(4);
  fonte(dir, C.purple, 'Assessorias', moeda(c.assessorias, { compacto: true }));

  w.addSpacer(9);
  grafico(w, c, 290, 8);

  return w;
}

function widgetGrande(d, c) {
  const w = new ListWidget();
  fundo(w);
  w.setPadding(16, 17, 16, 17);

  cabecalho(w, d, c);
  w.addSpacer(10);

  texto(w, 'FATURAMENTO DO MÊS — TODAS AS FONTES', { cor: C.muted, tam: 10 });
  texto(w, moeda(c.total, { centavos: true }), { cor: C.green, tam: 30, peso: 'bold' });

  w.addSpacer(10);
  grafico(w, c, 300, 10);
  w.addSpacer(10);

  fonte(w, C.green,  'Cursos — Hotmart',   moeda(c.cursos),      { tam: 13 });
  w.addSpacer(6);
  fonte(w, C.blue,   `Mentorias (${c.realizadas})`, moeda(c.mentorias), { tam: 13 });
  w.addSpacer(6);
  fonte(w, C.purple, 'Assessorias de Loja', moeda(c.assessorias), { tam: 13 });

  w.addSpacer(11);
  const div = w.addStack();
  div.centerAlignContent();
  texto(div, 'Meta Ads', { cor: C.muted, tam: 11 });
  div.addSpacer();
  texto(div, moeda(-c.meta), { cor: C.red, tam: 11, peso: 'medium' });
  w.addSpacer(5);
  const fx = w.addStack();
  fx.centerAlignContent();
  texto(fx, 'Custos fixos', { cor: C.muted, tam: 11 });
  fx.addSpacer();
  texto(fx, moeda(-FIXOS), { cor: C.red, tam: 11, peso: 'medium' });

  w.addSpacer(9);
  const linha = w.addStack();
  linha.centerAlignContent();
  const esq = linha.addStack();
  esq.layoutVertically();
  texto(esq, 'RESULTADO', { cor: C.muted, tam: 9 });
  texto(esq, moeda(c.lucro), { cor: c.lucro >= 0 ? C.green : C.red, tam: 20, peso: 'bold' });
  linha.addSpacer();
  const dir = linha.addStack();
  dir.layoutVertically();
  texto(dir, 'MARGEM', { cor: C.muted, tam: 9 });
  texto(dir, `${c.margem}%`, { cor: c.margem >= 0 ? C.green : C.red, tam: 20, peso: 'bold' });

  w.addSpacer();
  const rodape = d.parcial
    ? 'Mentorias/assessorias indisponíveis — mostrando só cursos'
    : `Atualizado ${d.cursos.gerado_em || ''}`;
  texto(w, rodape, { cor: d.parcial ? C.amber : C.muted, tam: 8, opacidade: 0.8 });

  return w;
}

// ── Execução ───────────────────────────────────────────────────
const dados = await coletar();

let widget;
if (!dados) {
  widget = widgetErro();
} else {
  const c = consolidar(dados);
  const familia = config.widgetFamily || 'medium';
  widget = familia === 'small' ? widgetPequeno(dados, c)
         : familia === 'large' || familia === 'extraLarge' ? widgetGrande(dados, c)
         : widgetMedio(dados, c);
}

widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
