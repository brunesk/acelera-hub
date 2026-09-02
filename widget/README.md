# Widget Acelera Hub — iPhone e iPad

Widget de tela de início que mostra os números do painel direto no iOS/iPadOS,
sem precisar de Mac, Xcode ou conta paga de desenvolvedor.

Ele lê o mesmo arquivo que o painel usa:
`https://brunesk.github.io/acelera-hub/data/latest.json`

## Instalação (5 minutos, uma vez só)

1. Instale o app **Scriptable** (gratuito) na App Store.
2. Abra o arquivo [`acelera-widget.js`](acelera-widget.js) e copie todo o conteúdo.
   - No iPhone/iPad: abra este arquivo no GitHub, toque em **Raw**, segure na tela e escolha *Selecionar tudo → Copiar*.
3. No Scriptable, toque em **+** (canto superior direito), cole o código.
4. Toque no nome do script no topo e renomeie para **Acelera Hub**. Toque em *Done*.
5. Volte à tela de início, segure em uma área vazia até os ícones tremerem, toque em **+**,
   procure **Scriptable** e escolha o tamanho desejado (pequeno, médio ou grande).
6. Com o widget na tela, segure nele → **Editar widget**:
   - **Script**: `Acelera Hub`
   - **When Interacting**: `Run Script` (ou `Open URL` para abrir o painel ao tocar)

Pronto. O widget se atualiza sozinho — o iOS decide a frequência, e o script pede
atualização a cada 30 minutos.

## O que cada tamanho mostra

| Tamanho | Conteúdo |
|---|---|
| **Pequeno** | Lucro do mês, mini-gráfico dos últimos dias, ROAS e gasto no Meta |
| **Médio** | Lucro em destaque, vendas e ticket médio, ROAS, líquido, gasto e mini-gráfico |
| **Grande** | Tudo do médio + gráfico maior + tabela dos últimos 4 dias (vendas, ROAS, lucro) |

Cores seguem o painel: lucro verde/vermelho conforme o sinal, ROAS verde acima de
1,30, âmbar entre 1,00 e 1,30, vermelho abaixo de 1,00.

## Detalhes

- **Toque no widget** abre o painel completo no navegador.
- **Sem internet**: mostra o último dado baixado com um `⚠︎` no cabeçalho.
  Se nunca tiver baixado nada, exibe "Sem dados".
- **Valores grandes** aparecem compactados (`R$ 14,3 mil`) para caber no widget.
- **iPad** aceita os mesmos tamanhos; o grande fica bem na tela de início em modo retrato.

## Personalizar

Tudo fica no topo do `acelera-widget.js`:

- `DATA_URL` — origem dos dados (troque se o painel mudar de endereço).
- `PANEL_URL` — para onde o toque leva.
- `C` — paleta de cores.
- Em `grafico(...)`, `dias.slice(-14)` define quantos dias entram no mini-gráfico.
