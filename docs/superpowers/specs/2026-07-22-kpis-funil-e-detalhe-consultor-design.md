# KPIs de funil geral no Dashboard e detalhe por consultor na Análise

**Data:** 2026-07-22
**Status:** aprovado para planejamento

## Objetivo

Dar uma visão gerencial de quantas propostas foram geradas, quantas estão em
andamento, quantas fecharam e quantas foram perdidas — tanto no nível do
pipeline inteiro (Dashboard) quanto por consultor (Análise), incluindo a
conversão em cada caso.

## Abordagem

Duas mudanças independentes, sem alteração de schema de banco — tudo já vem
das colunas/queries existentes:

1. **Dashboard:** nova linha de 4 KPIs com os totais do funil, reaproveitando
   o `filtroSql` (filial/consultor/data) que a tela já usa.
2. **Análise:** a barra proporcional por consultor (já existe) ganha os
   números de cada status e a conversão ao lado, sem virar tabela.

## 1. Dashboard — linha de KPIs do funil geral

### `src/stats.js` — `dashboardStats`

Adicionar três campos ao retorno, todos usando o mesmo `where`/`params` de
`filtroSql(filtros)` já calculado na função:

```js
const geradas = db.prepare(`
  SELECT COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
  FROM propostas p WHERE 1=1 ${where}
`).get(...params);

const fechadasTotal = db.prepare(`
  SELECT COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
  FROM propostas p WHERE status='FECHADA' ${where}
`).get(...params);

const perdidas = db.prepare(`
  SELECT COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
  FROM propostas p WHERE status='PERDIDA' ${where}
`).get(...params);
```

Retornar `geradas: { qtde, valor }`, `fechadasTotal: { qtde, valor }`,
`perdidas: { qtde, valor }` no objeto de resposta, ao lado dos campos
existentes (`totalAtivas`, `fechadasMes`, etc. não mudam).

### `public/js/dashboard.js`

Nova linha de 4 cartões KPI, no mesmo estilo visual dos KPIs atuais
(`.cartao.kpi`), inserida **depois** da linha de KPIs existente e **antes**
da régua de termômetro:

| Rótulo | Valor | Detalhe |
|---|---|---|
| Geradas | `fmtMoeda(d.geradas.valor)` | `${d.geradas.qtde} propostas` |
| Em andamento | `fmtMoeda(d.totalAtivas.valor)` | `${d.totalAtivas.qtde} propostas` |
| Fechadas | `fmtMoeda(d.fechadasTotal.valor)` | `${d.fechadasTotal.qtde} propostas` |
| Perdidas | `fmtMoeda(d.perdidas.valor)` | `${d.perdidas.qtde} propostas` |

"Em andamento" repete o mesmo dado do cartão "Em negociação" já existente na
primeira linha — é intencional: a linha nova mostra as 4 fases do funil
juntas, mesmo que um dos números já apareça em outro cartão da tela.

"Fechadas" (nova linha) é o total do período filtrado — diferente de
"Fechadas no mês" (KPI existente, sempre restrito ao mês calendário atual).
Os dois convivem sem ajuste de rótulo (nomes já são autoexplicativos).

Os 4 KPIs novos respeitam os filtros já existentes no Dashboard (filial,
consultor, emitidas de/até), pois usam o `filtroSql` compartilhado.

## 2. Análise — números por status e conversão na linha do consultor

### `public/js/analise.js`

No agrupamento `porConsultor` (já existe, calcula `ATIVA`/`FECHADA`/
`PERDIDA`/`total` por consultor), adicionar o cálculo de conversão por
consultor:

```js
const consultores = Object.values(porConsultor)
  .map(c => ({ ...c, conversao: c.total ? 100 * c.FECHADA / c.total : 0 }))
  .sort((a, b) => b.total - a.total);
```

No template de cada `cons-linha`, ao lado da barra proporcional (que
continua igual), adicionar:

- Contadores compactos coloridos, na ordem aberto·fechada·perdida, casando
  com as cores dos segmentos (`--frio`, `--fechada`, `--neutro`):
  `<span class="cons-contagem">...</span>` com um `<b>` por número, cada um
  com a cor correspondente.
- Conversão: `conv ${fmtPct(c.conversao)}` — mesma fórmula usada em
  "Conversão por filial"/"Conversão por origem" (fechadas / total).

Segmentos com contagem zero não aparecem no contador compacto, e o
separador "·" só aparece entre dois números efetivamente exibidos — ex.: um
consultor sem perdidas mostra `12·5` (aberto·fechada), não `12·5·0` nem
`12··5`. Mesma regra que já existe para os segmentos da barra (evitar "0"
poluindo a linha).

### `public/styles.css`

- Ajustar `grid-template-columns` de `.cons-linha` para acomodar as duas
  colunas novas (contagem compacta e conversão), mantendo nome e barra como
  estão.
- Novas classes de texto colorido para os números da contagem compacta,
  reaproveitando as variáveis de cor já usadas nos segmentos (`--frio`,
  `--fechada`, `--neutro`) — sem criar cores novas.

O tooltip que já existe em cada segmento da barra (`title="N em aberto"` etc.)
continua como está.

## Fora de escopo

- Filtros de data/consultor/termômetro na tela Análise (ela sempre olha o
  pipeline inteiro, como hoje).
- Mudar a fórmula de conversão (continua sendo fechadas/total, mesma usada
  em filial e origem — não exclui perdidas do denominador).
- Qualquer alteração em `consultorStats`/tela Consultores.
- Gráfico de pizza ou outro tipo de visualização — mantém-se a barra
  proporcional já existente, só com números adicionados.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/stats.js` | `dashboardStats` retorna `geradas`, `fechadasTotal`, `perdidas` |
| `tests/stats.test.js` | casos novos cobrindo os 3 campos, com e sem filtro |
| `public/js/dashboard.js` | nova linha de 4 KPIs |
| `public/js/analise.js` | conversão por consultor + números compactos na linha |
| `public/styles.css` | grid de `.cons-linha` e classes de cor da contagem compacta |

## Testes e verificação

- TDD no backend: testes de `dashboardStats` para `geradas`/`fechadasTotal`/
  `perdidas`, com e sem filtros (filial, consultor, data), antes da
  implementação.
- `npm test` completo passando.
- Verificação manual no navegador:
  - Dashboard: linha nova aparece com os 4 números corretos; aplicar filtro
    de data/filial/consultor recalcula os 4 juntos.
  - Análise: cada linha de consultor mostra contagem compacta e conversão
    coerentes com os segmentos da barra (comparar com a tela Consultores/
    Propostas filtrada pelo mesmo consultor).
