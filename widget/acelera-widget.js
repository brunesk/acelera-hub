// ═══════════════════════════════════════════════════════════════
//  ACELERA HUB — Widget para iPhone / iPad (app Scriptable)
//  Instalação: veja widget/README.md
//  Tamanhos suportados: pequeno, médio e grande.
// ═══════════════════════════════════════════════════════════════

const DATA_URL  = 'https://brunesk.github.io/acelera-hub/data/latest.json';
const PANEL_URL = 'https://brunesk.github.io/acelera-hub/';
const CACHE     = 'acelera-hub-cache.json';

// Paleta espelhando o painel
const C = {
  bg1:   '#141726',
  bg2:   '#0c0e16',
  text:  '#f7f8fd',
  muted: '#9aa3bd',
  amber: '#f5a623',
  green: '#00e87a',
  red:   '#ff4757',
  blue:  '#4a9eff',
};

// ── Dados ──────────────────────────────────────────────────────
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE);

async function carregar() {
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 12;
    const dados = await req.loadJSON();
    if (!dados || !dados.kpis) throw new Error('payload inválido');
    fm.writeString(cachePath, JSON.stringify(dados));
    return { dados, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      try { return { dados: JSON.parse(fm.readString(cachePath)), offline: true }; }
      catch (_) { /* cache corrompido */ }
    }
    return { dados: null, offline: true };
  }
}

// ── Formatação (pt-BR, sem depender de Intl) ───────────────────
function sep(inteiro) {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function moeda(v, { compacto = false } = {}) {
  const n = Number(v) || 0;
  const sinal = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (compacto && abs >= 10000) {
    const mil = abs / 1000;
    const casas = mil >= 100 ? 0 : 1;
    return `${sinal}R$ ${mil.toFixed(casas).replace('.', ',')} mil`;
  }
  const [int, dec] = abs.toFixed(2).split('.');
  return `${sinal}R$ ${sep(int)},${dec}`;
}
function num(v, casas = 2) {
  return (Number(v) || 0).toFixed(casas).replace('.', ',');
}

// ── Componentes ────────────────────────────────────────────────
function texto(pai, valor, { cor = C.text, tam = 12, peso = 'regular', opacidade = 1 } = {}) {
  const t = pai.addText(String(valor));
  t.textColor = new Color(cor);
  t.font = peso === 'bold'   ? Font.boldSystemFont(tam)
         : peso === 'medium' ? Font.mediumSystemFont(tam)
         : peso === 'mono'   ? Font.regularMonospacedSystemFont(tam)
         : Font.systemFont(tam);
  t.textOpacity = opacidade;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function corLucro(v) { return (Number(v) || 0) >= 0 ? C.green : C.red; }
function corRoas(v)  { const n = Number(v) || 0; return n >= 1.3 ? C.green : n >= 1 ? C.amber : C.red; }

function cabecalho(w, dados, offline) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, 'ACELERA', { cor: C.amber, tam: 10, peso: 'bold' });
  linha.addSpacer(4);
  texto(linha, dados.periodo || '', { cor: C.muted, tam: 9 });
  linha.addSpacer();
  if (offline) texto(linha, '⚠︎', { cor: C.amber, tam: 9 });
}

// Bloco compacto rótulo + valor
function bloco(pai, rotulo, valor, cor, { tam = 14 } = {}) {
  const s = pai.addStack();
  s.layoutVertically();
  texto(s, rotulo, { cor: C.muted, tam: 9 });
  s.addSpacer(1);
  texto(s, valor, { cor, tam, peso: 'bold' });
  return s;
}

// ── Mini-gráfico (lucro por dia) ───────────────────────────────
function sparkline(valores, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const pad = 3;
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const amplitude = (max - min) || 1;
  const px = i => valores.length > 1 ? pad + (i * (w - 2 * pad)) / (valores.length - 1) : w / 2;
  const py = v => (h - pad) - ((v - min) / amplitude) * (h - 2 * pad);
  const zero = py(0);
  const positivo = valores[valores.length - 1] >= 0;
  const cor = positivo ? C.green : C.red;

  // linha do zero
  const base = new Path();
  base.move(new Point(0, zero));
  base.addLine(new Point(w, zero));
  dc.setStrokeColor(new Color(C.muted, 0.28));
  dc.setLineWidth(1);
  dc.addPath(base);
  dc.strokePath();

  if (valores.length > 1) {
    // área
    const area = new Path();
    area.move(new Point(px(0), zero));
    valores.forEach((v, i) => area.addLine(new Point(px(i), py(v))));
    area.addLine(new Point(px(valores.length - 1), zero));
    area.closeSubpath();
    dc.setFillColor(new Color(cor, 0.18));
    dc.addPath(area);
    dc.fillPath();

    // linha
    const linha = new Path();
    linha.move(new Point(px(0), py(valores[0])));
    valores.forEach((v, i) => { if (i) linha.addLine(new Point(px(i), py(v))); });
    dc.setStrokeColor(new Color(cor, 1));
    dc.setLineWidth(2);
    dc.addPath(linha);
    dc.strokePath();
  }

  // ponto do último dia
  const ux = px(valores.length - 1), uy = py(valores[valores.length - 1]);
  dc.setFillColor(new Color(cor, 1));
  dc.fillEllipse(new Rect(ux - 2.5, uy - 2.5, 5, 5));

  return dc.getImage();
}

function grafico(w, dias, largura, altura) {
  if (!dias || !dias.length) return;
  const recorte = dias.slice(-14).map(d => Number(d.lucro) || 0);
  const img = w.addImage(sparkline(recorte, largura, altura));
  img.imageSize = new Size(largura, altura);
  img.centerAlignImage();
}

// ── Layouts ────────────────────────────────────────────────────
function widgetErro() {
  const w = new ListWidget();
  fundo(w);
  w.addSpacer();
  texto(w, 'ACELERA', { cor: C.amber, tam: 11, peso: 'bold' });
  w.addSpacer(4);
  texto(w, 'Sem dados', { cor: C.text, tam: 15, peso: 'bold' });
  texto(w, 'Verifique a conexão', { cor: C.muted, tam: 10 });
  w.addSpacer();
  return w;
}

function fundo(w) {
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = PANEL_URL;
}

function widgetPequeno(dados, offline) {
  const k = dados.kpis;
  const w = new ListWidget();
  fundo(w);
  w.setPadding(12, 13, 12, 13);

  cabecalho(w, dados, offline);
  w.addSpacer(6);

  texto(w, 'LUCRO', { cor: C.muted, tam: 9 });
  texto(w, moeda(k.lucro, { compacto: true }), { cor: corLucro(k.lucro), tam: 22, peso: 'bold' });

  w.addSpacer(4);
  grafico(w, dados.dias, 128, 26);
  w.addSpacer(4);

  const rodape = w.addStack();
  rodape.centerAlignContent();
  texto(rodape, `ROAS ${num(k.roas)}`, { cor: corRoas(k.roas), tam: 11, peso: 'bold' });
  rodape.addSpacer();
  texto(rodape, moeda(k.gasto_meta, { compacto: true }), { cor: C.muted, tam: 10 });

  return w;
}

function widgetMedio(dados, offline) {
  const k = dados.kpis;
  const w = new ListWidget();
  fundo(w);
  w.setPadding(13, 15, 13, 15);

  cabecalho(w, dados, offline);
  w.addSpacer(7);

  const corpo = w.addStack();
  corpo.centerAlignContent();

  // Coluna do lucro
  const esq = corpo.addStack();
  esq.layoutVertically();
  texto(esq, 'LUCRO DO MÊS', { cor: C.muted, tam: 9 });
  texto(esq, moeda(k.lucro, { compacto: true }), { cor: corLucro(k.lucro), tam: 24, peso: 'bold' });
  esq.addSpacer(3);
  texto(esq, `${k.vendas} vendas · ticket ${moeda(k.ticket)}`, { cor: C.muted, tam: 9 });

  corpo.addSpacer();

  // Coluna de métricas
  const dir = corpo.addStack();
  dir.layoutVertically();
  bloco(dir, 'ROAS', num(k.roas), corRoas(k.roas), { tam: 15 });
  dir.addSpacer(6);
  bloco(dir, 'LÍQUIDO', moeda(k.liq, { compacto: true }), C.blue, { tam: 13 });
  dir.addSpacer(6);
  bloco(dir, 'GASTO META', moeda(k.gasto_meta, { compacto: true }), C.amber, { tam: 13 });

  w.addSpacer(8);
  grafico(w, dados.dias, 290, 34);

  return w;
}

function widgetGrande(dados, offline) {
  const k = dados.kpis;
  const w = new ListWidget();
  fundo(w);
  w.setPadding(16, 17, 16, 17);

  cabecalho(w, dados, offline);
  w.addSpacer(10);

  texto(w, 'LUCRO DO MÊS', { cor: C.muted, tam: 10 });
  texto(w, moeda(k.lucro), { cor: corLucro(k.lucro), tam: 32, peso: 'bold' });
  w.addSpacer(2);
  texto(w, `${k.vendas} vendas · ticket médio ${moeda(k.ticket)}`, { cor: C.muted, tam: 10 });

  w.addSpacer(12);
  const linha = w.addStack();
  bloco(linha, 'ROAS', num(k.roas), corRoas(k.roas), { tam: 17 });
  linha.addSpacer();
  bloco(linha, 'LÍQUIDO', moeda(k.liq, { compacto: true }), C.blue, { tam: 17 });
  linha.addSpacer();
  bloco(linha, 'GASTO META', moeda(k.gasto_meta, { compacto: true }), C.amber, { tam: 17 });

  w.addSpacer(12);
  grafico(w, dados.dias, 300, 52);
  w.addSpacer(10);

  // Últimos dias
  texto(w, 'ÚLTIMOS DIAS', { cor: C.muted, tam: 9 });
  w.addSpacer(5);
  const ultimos = (dados.dias || []).slice(-4).reverse();
  ultimos.forEach((d, i) => {
    if (i) w.addSpacer(5);
    const l = w.addStack();
    l.centerAlignContent();
    texto(l, d.dia, { cor: C.text, tam: 11, peso: 'mono' });
    l.addSpacer(10);
    texto(l, `${d.vendas}v`, { cor: C.muted, tam: 10 });
    l.addSpacer();
    texto(l, num(d.roas), { cor: corRoas(d.roas), tam: 11, peso: 'medium' });
    l.addSpacer(12);
    texto(l, moeda(d.lucro), { cor: corLucro(d.lucro), tam: 11, peso: 'bold' });
  });

  w.addSpacer();
  texto(w, `Atualizado ${dados.gerado_em || ''}`, { cor: C.muted, tam: 8, opacidade: 0.7 });

  return w;
}

// ── Execução ───────────────────────────────────────────────────
const { dados, offline } = await carregar();

let widget;
if (!dados) {
  widget = widgetErro();
} else {
  const familia = config.widgetFamily || 'medium';
  widget = familia === 'small' ? widgetPequeno(dados, offline)
         : familia === 'large' || familia === 'extraLarge' ? widgetGrande(dados, offline)
         : widgetMedio(dados, offline);
}

widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
