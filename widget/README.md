# Widget Acelera Hub — iPhone e iPad

Widgets de tela de início que mostram os números do painel direto no iOS/iPadOS,
sem precisar de Mac, Xcode ou conta paga de desenvolvedor.

Todos leem `https://brunesk.github.io/acelera-hub/data/latest.json`, o mesmo
arquivo que o painel usa. O consolidado lê também o Firebase das mentorias e
assessorias — as mesmas URLs que a aba Financeiro do Hub consome.

| Script | Foco | Pergunta que responde | Fontes |
|---|---|---|---|
| [`acelera-widget.js`](acelera-widget.js) | Resultado | "Estou lucrando? O tráfego está pagando?" | cursos |
| [`acelera-faturamento.js`](acelera-faturamento.js) | Receita de cursos | "Quanto entrou líquido de curso no mês?" | cursos |
| [`acelera-consolidado.js`](acelera-consolidado.js) | Negócio inteiro | "Quanto o negócio faturou no mês, por fonte?" | cursos + mentorias + assessorias |

Dá para instalar os três e deixar lado a lado — são scripts independentes.

## Instalação (5 minutos, uma vez só)

1. Instale o app **Scriptable** (gratuito) na App Store.
2. Abra o script que quiser e copie todo o conteúdo.
   - No iPhone/iPad: abra este arquivo no GitHub, toque em **Raw**, segure na tela e escolha *Selecionar tudo → Copiar*.
3. No Scriptable, toque em **+** (canto superior direito), cole o código.
4. Toque no nome do script no topo e renomeie (ex.: **Acelera Hub**, **Acelera Faturamento**, **Acelera Consolidado**). Toque em *Done*.

   Para instalar outro widget, repita os passos 2 a 4 com o outro arquivo, criando um script separado.
5. Volte à tela de início, segure em uma área vazia até os ícones tremerem, toque em **+**,
   procure **Scriptable** e escolha o tamanho desejado (pequeno, médio ou grande).
6. Com o widget na tela, segure nele → **Editar widget**:
   - **Script**: o script que você acabou de criar
   - **When Interacting**: `Run Script` (ou `Open URL` para abrir o painel ao tocar)

Pronto. O widget se atualiza sozinho — o iOS decide a frequência, e o script pede
atualização a cada 30 minutos.

## O que cada tamanho mostra

### `acelera-widget.js` — resultado

| Tamanho | Conteúdo |
|---|---|
| **Pequeno** | Lucro do mês, mini-gráfico dos últimos dias, ROAS e gasto no Meta |
| **Médio** | Lucro em destaque, vendas e ticket médio, ROAS, líquido, gasto e mini-gráfico |
| **Grande** | Tudo do médio + gráfico maior + tabela dos últimos 4 dias (vendas, ROAS, lucro) |

Cores seguem o painel: lucro verde/vermelho conforme o sinal, ROAS verde acima de
1,30, âmbar entre 1,00 e 1,30, vermelho abaixo de 1,00.

### `acelera-faturamento.js` — faturamento líquido

| Tamanho | Conteúdo |
|---|---|
| **Pequeno** | Líquido do mês, curva acumulada, nº de vendas e projeção de fechamento |
| **Médio** | Líquido em destaque, bruto, taxas, projeção e curva acumulada |
| **Grande** | Tudo do médio + dia do mês, gráfico maior e os 3 meses anteriores com variação % |

O gráfico é a **curva acumulada** do mês (não o valor diário), com uma linha âmbar
marcando o total do mês anterior — quando a curva cruza a linha, você bateu o mês
passado. A **projeção** é linear: líquido até agora ÷ dias corridos × dias do mês.
Nos primeiros dias ela oscila bastante; ganha confiança depois da primeira semana.

### `acelera-consolidado.js` — faturamento por fonte

Replica o cálculo da aba **Financeiro** do Hub (`calcFinanceiro` em `index.html`),
somando as três fontes do mês corrente:

| Fonte | Origem | Como é somado |
|---|---|---|
| 🎓 Cursos | `data/latest.json` | líquido Hotmart do mês + receita externa |
| 🤝 Mentorias | Firebase `/slots.json` + `/config.json` | slots do mês já ocupados × preço configurado |
| 🏪 Assessorias | Firebase `/assessorias.json` | pagamentos registrados no mês |

Descontos aplicados no resultado: gasto no Meta Ads e `FIXOS` (custo fixo mensal,
espelhando o mesmo valor do Hub — **se mudar lá, mude no script também**).

| Tamanho | Conteúdo |
|---|---|
| **Pequeno** | Total do mês, barra de proporção e as três fontes |
| **Médio** | Total, lucro e margem, três fontes e barra de proporção |
| **Grande** | Tudo isso + nº de mentorias, Meta Ads, custos fixos, resultado e margem |

**O SaaS fica de fora.** No Hub, as licenças SaaS vêm do Firestore e exigem login
Google de administrador; um widget não tem como autenticar. Então o total do widget
é menor que o do Hub exatamente pelo valor do SaaS do mês. Se isso incomodar, a
saída é o `gerar_dados.py` publicar também um total de SaaS no JSON — aí o widget
lê de lá, sem autenticação.

Se o Firebase não responder, o widget mostra só os cursos, zera as outras fontes e
marca `⚠︎` no cabeçalho com um aviso no rodapé — ele nunca finge que mentorias e
assessorias foram zero de verdade.

## O que entra no "líquido" (widget de faturamento)

O número é a soma de **todas** as vendas aprovadas na Hotmart no mês — curso,
mentoria, order bumps, upsells, qualquer produto — já descontada a taxa da
plataforma, mais a receita externa registrada em `RECEITA_EXTERNA` no
`gerar_dados.py`.

O pipeline não separa por produto: ele soma tudo sem olhar qual é
(`gerar_dados.py`, função de agregação da Hotmart). Consequências práticas:

- **Não dá para ver o split** curso × mentoria hoje — o dado por produto existe na
  API da Hotmart, mas é descartado na geração. Exige mudança no `gerar_dados.py`.
- **Venda fora da Hotmart não entra automaticamente.** Se a mentoria for fechada
  por PIX, transferência ou outra plataforma, ela só aparece se for lançada à mão
  no dicionário `RECEITA_EXTERNA`.
- **Reembolso posterior** sai da conta na próxima atualização, porque só somam
  vendas com status `COMPLETE` ou `APPROVED`.

## Detalhes

- **Toque no widget** abre o painel completo no navegador.
- **Os widgets de resultado e faturamento compartilham o mesmo cache local**, então
  instalar ambos não dobra o tráfego de rede. O consolidado usa cache próprio,
  porque guarda também os dados do Firebase.
- **Sem internet**: mostra o último dado baixado com um `⚠︎` no cabeçalho.
  Se nunca tiver baixado nada, exibe "Sem dados".
- **Valores grandes** aparecem compactados (`R$ 14,3 mil`) para caber no widget.
- **iPad** aceita os mesmos tamanhos; o grande fica bem na tela de início em modo retrato.

## Personalizar

Tudo fica no topo do `acelera-widget.js`:

- `DATA_URL` — origem dos dados (troque se o painel mudar de endereço).
- `PANEL_URL` — para onde o toque leva.
- `C` — paleta de cores.
- Em `acelera-widget.js`, `dias.slice(-14)` define quantos dias entram no mini-gráfico.
- Em `acelera-faturamento.js`, a função `projecao(...)` define o cálculo da projeção.
- Em `acelera-consolidado.js`, `FIXOS` é o custo fixo mensal e `DB` é o Firebase.
