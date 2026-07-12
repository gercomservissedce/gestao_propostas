# Filtros de data e termômetro na tela Consultores

**Data:** 2026-07-12
**Status:** aprovado para planejamento

## Objetivo

Adicionar à tela Consultores (grade de cards) dois filtros novos — período de
emissão (de/até) e termômetro — que recalculam **tanto os KPIs de resumo
quanto os cards**, mantendo os números da tela sempre consistentes entre si.

## Abordagem

Os filtros são aplicados no servidor: o frontend envia `de`, `ate` e
`termometro` como query string para o endpoint existente
`GET /api/consultores/stats`. O suporte a datas já existe no backend
(`filtroSql` em `src/stats.js`); falta apenas o termômetro.

## 1. Backend

### `src/stats.js` — `filtroSql`

Adicionar o filtro de termômetro com a mesma convenção da rota de propostas
(`src/routes.js:44-45`):

- `filtros.termometro === 'NULA'` → condição `p.termometro IS NULL`
- `filtros.termometro` com valor (`QUENTE`/`MORNO`/`FRIO`) → `p.termometro = ?`
- ausente/vazio → sem condição

Efeito colateral aceitável: `dashboardStats` usa o mesmo `filtroSql` e passa
a aceitar termômetro (nenhuma tela envia por enquanto; sem impacto).

### `src/routes.js` — `filtrosDaQuery`

Incluir `termometro: q.termometro || null` no objeto retornado.

### Teste (`tests/stats.test.js`)

Novo(s) caso(s): `consultorStats` com filtro de termômetro (valor e `NULA`)
e com período `de`/`ate` — verificando que as agregações consideram apenas
as propostas do recorte.

## 2. Frontend (`public/js/consultores.js`)

### Estado e carga

- Estado ganha `filtros: { de: '', ate: '', termometro: '' }`.
- `carregar()` monta a query string apenas com os filtros preenchidos e
  busca `/api/consultores/stats?...`.
- Mudança em data ou termômetro → `carregar()` (nova busca no servidor).
- O filtro de **tipo** (Todos/Franqueados/CLT) permanece client-side e
  continua afetando apenas a grade e o contador — não os KPIs.

### Linha de filtros (ordem da esquerda para a direita)

1. **Emitidas de** — `<input type="date">` (padrão do Dashboard)
2. **até** — `<input type="date">`
3. **Termômetro** — select: Todos (vazio) / Quente (`QUENTE`) /
   Morno (`MORNO`) / Frio (`FRIO`) / Não classificada (`NULA`)
4. **Tipo** — como hoje
5. **Ordenar por** — como hoje
6. **Limpar** — botão que zera todos os filtros (data, termômetro e tipo)
   e recarrega
7. Contador "N consultor(es)" à direita, como hoje

### Comportamento resultante

- KPIs de resumo (Franqueados/CLT) são calculados sobre `this.dados`, que
  já chegam filtrados do servidor por data/termômetro → refletem o recorte
  automaticamente, sem lógica nova.
- Cards, mini-barras (máximo entre os exibidos) e contador seguem a regra
  atual sobre os dados filtrados.
- Consultor sem proposta no recorte não aparece (`emitidas > 0` mantido).

## Semântica do termômetro

O filtro considera o termômetro atual da proposta, independentemente do
status — ex.: "Quente" agrega emitidas, fechadas e valores apenas das
propostas marcadas como quentes dentro do período.

## Fora de escopo

- Expor o filtro de termômetro na tela Dashboard.
- Filtro de filial na tela Consultores.
- Mudanças na planilha de exportação ou na importação de atualizações
  (continuam considerando todas as propostas do consultor).

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/stats.js` | `filtroSql` com termômetro |
| `src/routes.js` | `filtrosDaQuery` com termômetro |
| `tests/stats.test.js` | casos novos de `consultorStats` filtrado |
| `public/js/consultores.js` | estado de filtros, query string, inputs de data, select de termômetro, botão Limpar |

## Testes e verificação

- TDD no backend: teste de `consultorStats` filtrado antes da implementação.
- `npm test` completo passando.
- Verificação manual/smoke no navegador: aplicar data e termômetro e conferir
  que KPIs e cards mudam juntos; Limpar restaura o total; filtro de tipo
  continua não afetando os KPIs.
