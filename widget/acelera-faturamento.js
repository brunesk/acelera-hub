// ═══════════════════════════════════════════════════════════════
//  ACELERA HUB — Widget de FATURAMENTO LÍQUIDO (app Scriptable)
//  Total do mês somando tudo: curso, mentoria, order bumps, upsells
//  e receita externa — já descontadas as taxas da plataforma.
//  Instalação: veja widget/README.md
// ═══════════════════════════════════════════════════════════════

const DATA_URL  = 'https://brunesk.github.io/acelera-hub/data/latest.json';
const PANEL_URL = 'https://brunesk.github.io/acelera-hub/';
const CACHE     = 'acelera-hub-cache.json';   // compartilhado com o outro widget

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

// ── Formatação (pt-BR) ─────────────────────────────────────────
const sep = i => i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function moeda(v, { compacto = false, semCentavos = false } = {}) {
  const n = Number(v) || 0, sinal = n < 0 ? '-' : '', abs = Math.abs(n);
  if (compacto && abs >= 10000) {
    const mil = abs / 1000;
    return `${sinal}R$ ${mil.toFixed(mil >= 100 ? 0 : 1).replace('.', ',')} mil`;
  }
  if (semCentavos) return `${sinal}R$ ${sep(Math.round(abs).toString())}`;
  const [int, dec] = abs.toFixed(2).split('.');
  return `${sinal}R$ ${sep(int)},${dec}`;
}
const num = (v, c = 2) => (Number(v) || 0).toFixed(c).replace('.', ',');
const pct = v => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 0)}%`;

// ── Cálculos do mês ────────────────────────────────────────────
// Lê a data final do campo "periodo" ("01/09 – 02/09/2026") para saber
// quantos dias do mês já correram e quantos o mês tem no total.
function progressoDoMes(dados) {
  const fim = String(dados.periodo || '').split('–').pop().trim();
  const m = fim.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dia = +m[1], mes = +m[2], ano = +m[3];
  const totalDias = new Date(ano, mes, 0).getDate();   // dia 0 do mês seguinte
  return { dia, totalDias, fechado: dia >= totalDias };
}

function projecao(liq, prog) {
  if (!prog || prog.fechado || prog.dia < 1) return null;
  return (liq / prog.dia) * prog.totalDias;
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
  t.minimumScaleFactor = 0.6;
  return t;
}

function bloco(pai, rotulo, valor, cor, { tam = 14 } = {}) {
  const s = pai.addStack();
  s.layoutVertically();
  texto(s, rotulo, { cor: C.muted, tam: 9 });
  s.addSpacer(1);
  texto(s, valor, { cor, tam, peso: 'bold' });
  return s;
}

function fundo(w) {
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = PANEL_URL;
}

function cabecalho(w, dados, offline) {
  const l = w.addStack();
  l.centerAlignContent();
  texto(l, 'FATURAMENTO', { cor: C.green, tam: 10, peso: 'bold' });
  l.addSpacer(4);
  texto(l, dados.periodo || '', { cor: C.muted, tam: 9 });
  l.addSpacer();
  if (offline) texto(l, '⚠︎', { cor: C.amber, tam: 9 });
}

// ── Curva de faturamento acumulado no mês ──────────────────────
function curvaAcumulada(dias, w, h, meta) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;

  let soma = 0;
  const acum = dias.map(d => (soma += Number(d.liq) || 0));
  const pad = 3;
  const topo = Math.max(...acum, meta || 0, 1);
  const px = i => acum.length > 1 ? pad + (i * (w - 2 * pad)) / (acum.length - 1) : w / 2;
  const py = v => (h - pad) - (v / topo) * (h - 2 * pad);

  // linha de referência: total do mês anterior
  if (meta && meta > 0) {
    const y = py(meta);
    const ref = new Path();
    ref.move(new Point(0, y));
    ref.addLine(new Point(w, y));
    dc.setStrokeColor(new Color(C.amber, 0.45));
    dc.setLineWidth(1);
    dc.addPath(ref);
    dc.strokePath();
  }

  if (acum.length > 1) {
    const area = new Path();
    area.move(new Point(px(0), h - pad));
    acum.forEach((v, i) => area.addLine(new Point(px(i), py(v))));
    area.addLine(new Point(px(acum.length - 1), h - pad));
    area.closeSubpath();
    dc.setFillColor(new Color(C.green, 0.18));
    dc.addPath(area);
    dc.fillPath();

    const linha = new Path();
    linha.move(new Point(px(0), py(acum[0])));
    acum.forEach((v, i) => { if (i) linha.addLine(new Point(px(i), py(v))); });
    dc.setStrokeColor(new Color(C.green, 1));
    dc.setLineWidth(2);
    dc.addPath(linha);
    dc.strokePath();
  }

  const ux = px(acum.length - 1), uy = py(acum[acum.length - 1]);
  dc.setFillColor(new Color(C.green, 1));
  dc.fillEllipse(new Rect(ux - 2.5, uy - 2.5, 5, 5));

  return dc.getImage();
}

function grafico(w, dados, largura, altura) {
  const dias = dados.dias || [];
  if (!dias.length) return;
  const anterior = (dados.historico || [])[0];
  const img = w.addImage(curvaAcumulada(dias, largura, altura, anterior && anterior.liq));
  img.imageSize = new Size(largura, altura);
  img.centerAlignImage();
}

// ── Layouts ────────────────────────────────────────────────────
function widgetErro() {
  const w = new ListWidget();
  fundo(w);
  w.addSpacer();
  texto(w, 'FATURAMENTO', { cor: C.green, tam: 11, peso: 'bold' });
  w.addSpacer(4);
  texto(w, 'Sem dados', { cor: C.text, tam: 15, peso: 'bold' });
  texto(w, 'Verifique a conexão', { cor: C.muted, tam: 10 });
  w.addSpacer();
  return w;
}

function widgetPequeno(dados, offline) {
  const k = dados.kpis;
  const prog = progressoDoMes(dados);
  const proj = projecao(k.liq, prog);
  const w = new ListWidget();
  fundo(w);
  w.setPadding(12, 13, 12, 13);

  cabecalho(w, dados, offline);
  w.addSpacer(6);

  texto(w, 'LÍQUIDO NO MÊS', { cor: C.muted, tam: 9 });
  texto(w, moeda(k.liq, { compacto: true }), { cor: C.green, tam: 22, peso: 'bold' });

  w.addSpacer(4);
  grafico(w, dados, 128, 26);
  w.addSpacer(4);

  const rodape = w.addStack();
  rodape.centerAlignContent();
  texto(rodape, `${k.vendas} vendas`, { cor: C.muted, tam: 10 });
  rodape.addSpacer();
  if (proj) texto(rodape, `proj ${moeda(proj, { compacto: true })}`, { cor: C.amber, tam: 10, peso: 'medium' });

  return w;
}

function widgetMedio(dados, offline) {
  const k = dados.kpis;
  const prog = progressoDoMes(dados);
  const proj = projecao(k.liq, prog);
  const anterior = (dados.historico || [])[0];
  const taxas = (Number(k.bruto) || 0) - (Number(k.liq) || 0);
  const w = new ListWidget();
  fundo(w);
  w.setPadding(13, 15, 13, 15);

  cabecalho(w, dados, offline);
  w.addSpacer(7);

  const corpo = w.addStack();
  corpo.centerAlignContent();

  const esq = corpo.addStack();
  esq.layoutVertically();
  texto(esq, 'LÍQUIDO NO MÊS', { cor: C.muted, tam: 9 });
  texto(esq, moeda(k.liq, { semCentavos: true }), { cor: C.green, tam: 24, peso: 'bold' });
  esq.addSpacer(3);
  texto(esq, `${k.vendas} vendas · ticket ${moeda(k.ticket)}`, { cor: C.muted, tam: 9 });

  corpo.addSpacer();

  const dir = corpo.addStack();
  dir.layoutVertically();
  bloco(dir, 'BRUTO', moeda(k.bruto, { compacto: true }), C.blue, { tam: 13 });
  dir.addSpacer(6);
  bloco(dir, 'TAXAS', moeda(-taxas, { compacto: true }), C.red, { tam: 13 });
  dir.addSpacer(6);
  if (proj) bloco(dir, 'PROJEÇÃO', moeda(proj, { compacto: true }), C.amber, { tam: 13 });
  else if (anterior) bloco(dir, `VS ${anterior.mes.toUpperCase()}`, moeda(anterior.liq, { compacto: true }), C.muted, { tam: 13 });

  w.addSpacer(8);
  grafico(w, dados, 290, 34);

  return w;
}

function widgetGrande(dados, offline) {
  const k = dados.kpis;
  const prog = progressoDoMes(dados);
  const proj = projecao(k.liq, prog);
  const anterior = (dados.historico || [])[0];
  const taxas = (Number(k.bruto) || 0) - (Number(k.liq) || 0);
  const w = new ListWidget();
  fundo(w);
  w.setPadding(16, 17, 16, 17);

  cabecalho(w, dados, offline);
  w.addSpacer(10);

  texto(w, 'LÍQUIDO NO MÊS — TUDO SOMADO', { cor: C.muted, tam: 10 });
  texto(w, moeda(k.liq), { cor: C.green, tam: 32, peso: 'bold' });
  w.addSpacer(2);

  const sub = w.addStack();
  sub.centerAlignContent();
  texto(sub, `${k.vendas} vendas · ticket médio ${moeda(k.ticket)}`, { cor: C.muted, tam: 10 });
  if (prog && !prog.fechado) {
    sub.addSpacer(6);
    texto(sub, `dia ${prog.dia}/${prog.totalDias}`, { cor: C.muted, tam: 10, opacidade: 0.75 });
  }

  w.addSpacer(12);
  const linha = w.addStack();
  bloco(linha, 'BRUTO', moeda(k.bruto, { compacto: true }), C.blue, { tam: 17 });
  linha.addSpacer();
  bloco(linha, 'TAXAS', moeda(-taxas, { compacto: true }), C.red, { tam: 17 });
  linha.addSpacer();
  if (proj) {
    const cor = anterior && anterior.liq ? (proj >= anterior.liq ? C.green : C.red) : C.amber;
    bloco(linha, 'PROJEÇÃO DO MÊS', moeda(proj, { compacto: true }), cor, { tam: 17 });
  }

  w.addSpacer(12);
  grafico(w, dados, 300, 52);
  w.addSpacer(3);
  if (anterior) texto(w, `— linha âmbar: total de ${anterior.mes} (${moeda(anterior.liq, { compacto: true })})`, { cor: C.muted, tam: 8, opacidade: 0.8 });

  w.addSpacer(10);
  texto(w, 'MESES ANTERIORES', { cor: C.muted, tam: 9 });
  w.addSpacer(5);
  (dados.historico || []).slice(0, 3).forEach((m, i) => {
    if (i) w.addSpacer(5);
    const l = w.addStack();
    l.centerAlignContent();
    texto(l, m.mes, { cor: C.text, tam: 11, peso: 'medium' });
    l.addSpacer(10);
    texto(l, `${m.vendas}v`, { cor: C.muted, tam: 10 });
    l.addSpacer();
    const base = Number(m.liq) || 0;
    const ref = proj || k.liq;
    if (base > 0) {
      const delta = ((ref - base) / base) * 100;
      texto(l, pct(delta), { cor: delta >= 0 ? C.green : C.red, tam: 10, peso: 'medium' });
      l.addSpacer(10);
    }
    texto(l, moeda(base, { compacto: true }), { cor: C.text, tam: 11, peso: 'bold' });
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

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
