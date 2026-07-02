"""
Gera data/latest.json e data/YYYY-MM.json (um por mês, desde Jan/2025)
com dados do Meta + Hotmart. Roda via GitHub Actions (workflow_dispatch ou cron).
"""
import urllib.request, urllib.parse, json, os, calendar, sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict

AD_ACCOUNT = 'act_913802749957339'
ADSET_ID   = '120253420414220339'
BRT        = timezone(timedelta(hours=-3))

# Receita de plataformas externas (Green etc.) que não aparecem no Hotmart
# Formato: 'YYYY-MM': {'liq': valor, 'fonte': 'nome'}
RECEITA_EXTERNA = {
    '2025-09': {'liq': 1030.49, 'fonte': 'Green'},
    '2025-10': {'liq': 7834.00, 'fonte': 'Green'},
    '2025-11': {'liq': 1283.30, 'fonte': 'Green'},  # início do mês, antes de migrar para Hotmart
}

def env(k):
    v = os.environ.get(k, '')
    if not v:
        sys.exit(f'❌ Variável de ambiente {k} não definida.')
    return v

# ── Hotmart ────────────────────────────────────────────────────
def hotmart_token(basic):
    req = urllib.request.Request(
        'https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials',
        method='POST', headers={'Authorization': basic}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())['access_token']

def hotmart_all(token, start_ms, end_ms):
    items, page_token = [], None
    while True:
        params = {'max_results': 500, 'start_date': start_ms, 'end_date': end_ms}
        if page_token: params['page_token'] = page_token
        url = 'https://developers.hotmart.com/payments/api/v1/sales/history?' + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req) as r: data = json.loads(r.read())
        batch = data.get('items', [])
        items.extend(batch)
        print(f'  HM página: {len(batch)} itens (total {len(items)})')
        page_token = data.get('page_info', {}).get('next_page_token')
        if not page_token: break
    return items

# ── Meta ───────────────────────────────────────────────────────
def meta_daily(token, since, until):
    params = {
        'access_token': token, 'level': 'account', 'time_increment': '1',
        'time_range': json.dumps({'since': since, 'until': until}), 'limit': 500,
        'fields': 'date_start,spend,impressions,clicks,ctr,cpm,actions,action_values'
    }
    results = []
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT}/insights?' + urllib.parse.urlencode(params)
    try:
        while url:
            with urllib.request.urlopen(url) as r:
                data = json.loads(r.read())
            results.extend(data.get('data', []))
            url = data.get('paging', {}).get('next')
        return results
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode())
        sys.exit(f"❌ Meta API: {err.get('error',{}).get('message','erro desconhecido')}")

def meta_ads(token, since, until):
    url = f'https://graph.facebook.com/v19.0/{ADSET_ID}/ads?fields=id,name,status&access_token={token}&limit=100'
    try:
        with urllib.request.urlopen(url) as r: ads = json.loads(r.read()).get('data', [])
    except: return []
    results = []
    for ad in ads:
        params = urllib.parse.urlencode({
            'access_token': token,
            'time_range': json.dumps({'since': since, 'until': until}),
            'fields': 'spend,impressions,clicks,ctr,cpm,actions,action_values'
        })
        try:
            with urllib.request.urlopen(f'https://graph.facebook.com/v19.0/{ad["id"]}/insights?{params}') as r:
                ins = json.loads(r.read()).get('data', [])
        except: ins = []
        if ins:
            d = ins[0]
            spend = float(d.get('spend', 0))
            purchases = next((int(a['value']) for a in d.get('actions', []) if a['action_type'] == 'purchase'), 0)
            revenue   = next((float(a['value']) for a in d.get('action_values', []) if a['action_type'] == 'purchase'), 0)
            if spend > 0:
                results.append({
                    'nome': ad['name'], 'status': ad['status'],
                    'gasto': round(spend, 2), 'impressoes': int(d.get('impressions', 0)),
                    'ctr': round(float(d.get('ctr', 0)), 2), 'cpm': round(float(d.get('cpm', 0)), 2),
                    'compras': purchases, 'receita_meta': round(revenue, 2),
                    'roas': round(revenue / spend, 2) if spend > 0 else 0,
                    'cpa': round(spend / purchases, 2) if purchases > 0 else 0,
                })
    return sorted(results, key=lambda x: x['gasto'], reverse=True)

# ── Main ───────────────────────────────────────────────────────
meta_token    = env('META_ACCESS_TOKEN')
hotmart_basic = env('HOTMART_BASIC')

now       = datetime.now(BRT)
today     = now.replace(hour=0, minute=0, second=0, microsecond=0)
yesterday = today - timedelta(days=1)
curr_key  = today.strftime('%Y-%m')
m_start   = today.replace(day=1)

print('🔑 Buscando token Hotmart...')
hm_token = hotmart_token(hotmart_basic)

# Busca desde Jan/2025 até agora para ter histórico completo
hist_start = datetime(2025, 1, 1, tzinfo=BRT)
hist_start_ms = int(hist_start.timestamp() * 1000)
hist_end_ms   = int(now.timestamp() * 1000)

print(f'📦 Buscando vendas Hotmart ({hist_start.strftime("%d/%m/%Y")} → hoje)...')
hm_all = hotmart_all(hm_token, hist_start_ms, hist_end_ms)

# Agrupa por dia e por mês
hm_dia = defaultdict(lambda: {'v': 0, 'bruto': 0.0, 'liq': 0.0})
hm_mes = defaultdict(lambda: {'v': 0, 'bruto': 0.0, 'liq': 0.0})

for item in hm_all:
    p = item['purchase']
    if p['status'] not in ('COMPLETE', 'APPROVED'): continue
    ts  = p['approved_date']
    dt  = datetime.fromtimestamp(ts / 1000, BRT)
    mk  = dt.strftime('%Y-%m')
    dk  = dt.strftime('%Y-%m-%d')
    price = float(p['price']['value'])
    fee   = float(p.get('hotmart_fee', {}).get('total', 0))
    liq   = price - fee

    hm_mes[mk]['v']     += 1
    hm_mes[mk]['bruto'] += price
    hm_mes[mk]['liq']   += liq
    hm_dia[dk]['v']     += 1
    hm_dia[dk]['bruto'] += price
    hm_dia[dk]['liq']   += liq

# Meta: histórico completo em uma chamada só (paginada), incluindo hoje (parcial)
print('📊 Buscando Meta (Jan/2025 → hoje)...')
until_str = today.strftime('%Y-%m-%d')
meta_raw = meta_daily(meta_token, '2025-01-01', until_str)
print(f'  Meta: {len(meta_raw)} dias')

meta_dia = {}
meta_mes = defaultdict(lambda: {'gasto': 0.0, 'compras_pixel': 0})
for d in meta_raw:
    dk = d['date_start']
    spend = float(d.get('spend', 0))
    purchases = next((int(a['value']) for a in d.get('actions', []) if a['action_type'] == 'purchase'), 0)
    meta_dia[dk] = {'gasto': spend, 'compras_pixel': purchases}
    meta_mes[dk[:7]]['gasto'] += spend
    meta_mes[dk[:7]]['compras_pixel'] += purchases

print('🎨 Buscando criativos (mês vigente)...')
criativos = meta_ads(meta_token, m_start.strftime('%Y-%m-%d'), until_str)

MESES = {1:'Jan',2:'Fev',3:'Mar',4:'Abr',5:'Mai',6:'Jun',7:'Jul',8:'Ago',9:'Set',10:'Out',11:'Nov',12:'Dez'}

def fmt_mes(mk):
    yr, mo = int(mk[:4]), int(mk[5:7])
    return f'{MESES[mo]}/{yr}'

# Todos os meses com atividade (Hotmart ou Meta ou receita externa)
all_months = sorted(set(list(hm_mes.keys()) + list(meta_mes.keys()) + list(RECEITA_EXTERNA.keys())))
prev_months = [m for m in all_months if m < curr_key]

# Semanas de um conjunto de dias
def semanas(days, hm, meta):
    result, chunks, chunk = [], [], []
    for d in days:
        chunk.append(d)
        if len(chunk) == 7:
            chunks.append(chunk); chunk = []
    if chunk: chunks.append(chunk)
    for i, ch in enumerate(chunks):
        sv = sum(hm.get(d, {}).get('v', 0)     for d in ch)
        sb = sum(hm.get(d, {}).get('bruto', 0) for d in ch)
        sl = sum(hm.get(d, {}).get('liq', 0)   for d in ch)
        ss = sum(meta.get(d, {}).get('gasto', 0) for d in ch)
        result.append({
            'semana': f'Semana {i+1}',
            'periodo': f'{datetime.strptime(ch[0],"%Y-%m-%d").strftime("%d/%m")} – {datetime.strptime(ch[-1],"%Y-%m-%d").strftime("%d/%m")}',
            'vendas': sv, 'bruto': round(sb, 2), 'liq': round(sl, 2),
            'gasto_meta': round(ss, 2), 'lucro': round(sl - ss, 2),
            'roas': round(sl / ss, 2) if ss > 0 else 0,
            'atual': i == len(chunks) - 1
        })
    return result

# Histórico mensal (meses fechados, mais recente primeiro)
historico = []
for mk in reversed(prev_months):
    hm_m  = hm_mes.get(mk, {})
    mt_m  = meta_mes.get(mk, {})
    ext   = RECEITA_EXTERNA.get(mk, {})

    tb_m  = hm_m.get('bruto', 0)
    tl_m  = hm_m.get('liq', 0) + ext.get('liq', 0)   # soma receita externa
    ts_m  = mt_m.get('gasto', 0)

    entry = {
        'mes': fmt_mes(mk), 'mes_key': mk,
        'vendas': hm_m.get('v', 0), 'bruto': round(tb_m, 2),
        'liq': round(tl_m, 2), 'gasto_meta': round(ts_m, 2),
        'lucro': round(tl_m - ts_m, 2),
        'roas': round(tl_m / ts_m, 2) if ts_m > 0 else 0
    }
    if ext:
        entry['receita_externa'] = round(ext['liq'], 2)
        entry['fonte_externa']   = ext['fonte']
    historico.append(entry)

# Monta o JSON de um mês (kpis + dias + semanas; criativos só no vigente)
def build_month(mk):
    days = sorted(set(
        [d for d in hm_dia if d.startswith(mk)] +
        [d for d in meta_dia if d.startswith(mk)]
    ))
    ext = RECEITA_EXTERNA.get(mk, {})

    tv = sum(hm_dia[d]['v']     for d in days)
    tb = sum(hm_dia[d]['bruto'] for d in days)
    tl = sum(hm_dia[d]['liq']   for d in days) + ext.get('liq', 0)
    ts = sum(meta_dia.get(d, {}).get('gasto', 0) for d in days)
    tlr = tl - ts

    dias_out = []
    for d in days:
        h = hm_dia.get(d, {}); m = meta_dia.get(d, {})
        liq = h.get('liq', 0); gasto = m.get('gasto', 0)
        dias_out.append({
            'dia': datetime.strptime(d, '%Y-%m-%d').strftime('%d/%m'),
            'vendas': h.get('v', 0), 'bruto': round(h.get('bruto', 0), 2),
            'liq': round(liq, 2), 'gasto_meta': round(gasto, 2),
            'lucro': round(liq - gasto, 2),
            'roas': round(liq / gasto, 2) if gasto > 0 else 0
        })

    is_curr = mk == curr_key
    yr, mo = int(mk[:4]), int(mk[5:7])
    if is_curr:
        periodo = f'{m_start.strftime("%d/%m")} – {today.strftime("%d/%m/%Y")}'
    else:
        periodo = f'01/{mo:02d} – {calendar.monthrange(yr, mo)[1]:02d}/{mo:02d}/{yr}'

    data = {
        'gerado_em': now.strftime('%d/%m/%Y às %H:%M (BRT)'),
        'periodo': periodo,
        'mes_key': mk,
        'kpis': {
            'vendas': tv, 'bruto': round(tb, 2), 'liq': round(tl, 2),
            'gasto_meta': round(ts, 2), 'lucro': round(tlr, 2),
            'roas': round(tl / ts, 2) if ts > 0 else 0,
            'ticket': round(tb / tv, 2) if tv > 0 else 0
        },
        'dias': dias_out,
        'semanas': semanas(days, hm_dia, meta_dia),
        'criativos': criativos if is_curr else [],
        'historico': historico
    }
    if ext:
        data['kpis']['receita_externa'] = round(ext['liq'], 2)
        data['kpis']['fonte_externa']   = ext['fonte']
    return data

# Grava um JSON por mês + latest
os.makedirs('data', exist_ok=True)
for mk in prev_months + [curr_key]:
    with open(f'data/{mk}.json', 'w', encoding='utf-8') as f:
        json.dump(build_month(mk), f, ensure_ascii=False, indent=2)

data_curr = build_month(curr_key)
with open('data/latest.json', 'w', encoding='utf-8') as f:
    json.dump(data_curr, f, ensure_ascii=False, indent=2)

k = data_curr['kpis']
print(f'✅ Dados salvos: data/latest.json + {len(prev_months)+1} arquivos mensais')
print(f"   {k['vendas']} vendas · R${k['liq']:.0f} líq · R${k['gasto_meta']:.0f} Meta · Lucro R${k['lucro']:.0f} · ROAS {k['roas']:.2f}x")
