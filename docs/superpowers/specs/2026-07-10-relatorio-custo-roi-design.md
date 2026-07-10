# Relatório Diretoria — Resumo por selecionadas + Custo/ROI — Design

Data: 2026-07-10

## Objetivo

No Relatório para a Diretoria, o "Resumo do pipeline" hoje mostra os totais de
**todas** as propostas ativas, mesmo depois de selecionar algumas para viabilização.
Deve mostrar só os totais das propostas **selecionadas**. Além disso, dois dos quatro
cards trocam de métrica: no lugar de "Fechadas no mês" entra "Custo total"; no lugar
de "Taxa de conversão" entra "Taxa de ROI" (custo ÷ mensalidades). A tabela de
propostas para viabilização (tanto na tela de seleção quanto no PDF) ganha colunas de
Custo e ROI por proposta.

Nenhuma mudança de backend — todos os campos usados (`custo_dep01`, `custo_dep02`,
`vlr_mensal`, `valor_minimo_fechamento`, `termometro`, `vlr_total`) já vêm em
`GET /api/propostas`.

## Fórmulas

- **Custo (por proposta)** = `custo_dep01 + custo_dep02` (ambos podem ser `null`,
  tratados como 0).
- **ROI (por proposta)** = `custo ÷ vlr_mensal`, em **meses** (ex.: "7,2 meses"). Se
  `vlr_mensal` for 0 ou `null`, mostra "—" (sem divisão por zero).
- **Taxa de ROI (agregada, card do resumo e rodapé da tabela)** = (soma dos custos das
  selecionadas) ÷ (soma das mensalidades das selecionadas), em meses. Se a soma das
  mensalidades for 0, mostra "—".
- **Previsão ponderada** — mesma fórmula já usada hoje (`vlr_total × probabilidade do
  termômetro / 100`, com as probabilidades de `/api/config`), só que somada apenas
  sobre as propostas selecionadas em vez de todas as ativas.

## Mudanças por camada

### 1. `public/relatorio-print.html`

- Remove a chamada a `/api/dashboard`. Passa a buscar só
  `/api/propostas?status=ATIVA&marcadas=1` (já existente) e `/api/config` (novo, só
  para as probabilidades do termômetro).
- **Resumo do pipeline** (4 cards), todos recalculados a partir da lista de
  selecionadas:
  1. Em negociação — soma de `vlr_total`, com a contagem das selecionadas.
  2. Previsão ponderada — fórmula acima, sobre as selecionadas.
  3. **Custo total** (era "Fechadas no mês") — soma do Custo (por proposta) de todas
     as selecionadas.
  4. **Taxa de ROI** (era "Taxa de conversão") — fórmula agregada acima.
- **Termômetro do pipeline** (barra + legenda) — agrupamento por termômetro
  recalculado só sobre as selecionadas (hoje vem do pipeline inteiro via
  `/api/dashboard`).
- **Tabela "Propostas para viabilização"** — duas colunas novas, **Custo** e **ROI**,
  inseridas entre "Valor original" e "Valor p/ fechamento". Rodapé (totais) ganha o
  custo somado e o ROI agregado (mesma fórmula do card 4).

### 2. `public/js/relatorio.js`

Mesmas colunas **Custo** e **ROI** (mesma fórmula, por proposta) na tabela da tela de
seleção, na mesma posição (entre "Valor original" e "Valor mín. p/ fechamento"), para
conferir antes de gerar o PDF. O resumo simples no topo da tela (Selecionadas / Valor
original / Valor p/ fechamento / Redução) não muda.

## Fora de escopo

- Mudanças no backend (`src/routes.js`, `src/stats.js`, `src/pdf.js`) — tudo é
  recalculado no cliente a partir de dados já existentes.
- O resumo simples no topo da tela de seleção (`.relatorio-resumo`).

## Testes

Sem testes automatizados (não há harness de DOM no projeto, e as duas camadas
alteradas são só front-end). Verificação manual: marcar um subconjunto de propostas
com custo/mensalidade conhecidos e conferir que os 4 cards do resumo, a barra de
termômetro e a tabela — tanto na tela de seleção quanto na prévia/PDF — batem com o
cálculo manual esperado.
