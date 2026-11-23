# Perdida → FRIO + motivo/data de criação na planilha do consultor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proposta PERDIDA sempre fica com termômetro FRIO; a planilha do consultor passa a incluir perdidas, "Data de criação" e "Motivo da perda", e a importação lê o motivo.

**Architecture:** A regra do FRIO vai em `sincronizarFechamento` (`src/parse.js`), que já roda em toda gravação via `atualizarProposta`. A planilha do consultor (`src/consultorPlanilha.js`) ganha 2 colunas anexadas ao final (importação lê por nome de cabeçalho, então planilhas antigas continuam válidas). A tela trava o campo termômetro em FRIO quando o status é PERDIDA.

**Tech Stack:** Node.js, better-sqlite3, xlsx, testes com `node --test` (`npm test`), front-end JS puro em `public/js`.

**Spec:** `docs/superpowers/specs/2026-11-23-perdida-frio-planilha-consultor-design.md`

## Global Constraints

- Lista de motivos válidos (exata, igual a `MOTIVOS_PERDA` em `public/js/propostas.js:13`): `PREÇO`, `PRAZO`, `CONCORRÊNCIA`, `CLIENTE DESISTIU`, `SEM RETORNO DO CLIENTE`, `ORÇAMENTO INTERNO`, `OUTRO`.
- Datas na planilha em `dd/mm/aaaa`. "Data de criação" = `propostas.data_emissao` (NÃO `criada_em`).
- Novas colunas anexadas ao FINAL de `COLUNAS_PROPOSTAS`, nesta ordem: `'Data de criação'`, `'Motivo da perda'`. Não reordenar as existentes.
- Fora do escopo: CSV do ERP, dashboard, relatórios, migração de perdidas antigas.
- Textos de interface em português.

## Review Focus

- Perdida com termômetro vazio ou outro valor na planilha/tela: deve terminar FRIO.
- Perdida reexportada e reimportada sem edição: não pode perder o FRIO nem o motivo (célula "Motivo da perda" em branco não apaga motivo existente).
- Motivo livre digitado na tela ("OUTRO" com texto): ao reimportar a planilha, texto fora da lista é ignorado e NÃO sobrescreve o motivo gravado.
- Motivo com caixa/espaços diferentes (`" preço "`): aceito como `PREÇO`.
- Proposta FECHADA do consultor continua fora da planilha; perdida de outro consultor não entra.

---

### Task 1: Regra FRIO e lista de motivos no servidor

**Files:**
- Modify: `src/parse.js` (função `sincronizarFechamento`, ramo `PERDIDA`; novo export)
- Test: `tests/parse.test.js`, `tests/propostaUpdate.test.js`

**Interfaces:**
- Produces: `MOTIVOS_PERDA: string[]` exportado de `src/parse.js` (lista dos Global Constraints, comentário avisando para manter em sincronia com `public/js/propostas.js`); `sincronizarFechamento` com status `PERDIDA` passa a definir `dados.termometro = 'FRIO'`.

- [ ] **Step 1: Escrever testes que falham**
  - `parse.test.js`: `sincronizarFechamento({status:'PERDIDA', termometro:'QUENTE'}, hoje).termometro === 'FRIO'`; com `termometro: ''` e com `termometro` ausente também resulta `'FRIO'`; `status:'ATIVA'` com `termometro:'QUENTE'` mantém `'QUENTE'`; dados sem `status` não ganham `termometro`.
  - `propostaUpdate.test.js`: proposta ATIVA/QUENTE atualizada com `{status:'PERDIDA'}` fica `termometro = 'FRIO'` no banco.
- [ ] **Step 2: Rodar `npx node --test tests/parse.test.js tests/propostaUpdate.test.js`** — esperado: os novos testes FALHAM.
- [ ] **Step 3: Implementar** em `src/parse.js`: no ramo `PERDIDA` acrescentar `dados.termometro = 'FRIO'`; declarar e exportar `MOTIVOS_PERDA`.
- [ ] **Step 4: Rodar `npm test`** — esperado: tudo passa.
- [ ] **Step 5: Commit** `feat: proposta perdida sempre vira termometro FRIO`

### Task 2: Exportação — perdidas, data de criação, motivo, instruções

**Files:**
- Modify: `src/consultorPlanilha.js` (`COLUNAS_PROPOSTAS`, `INSTRUCOES`, `gerarPlanilhaConsultor`)
- Test: `tests/consultorPlanilha.test.js`

**Interfaces:**
- Consumes: `MOTIVOS_PERDA` de Task 1.
- Produces: `COLUNAS_PROPOSTAS` com 13 colunas (as 11 atuais + `'Data de criação'`, `'Motivo da perda'`); `gerarPlanilhaConsultor(db, consultorId)` inalterada na assinatura.

- [ ] **Step 1: Escrever/ajustar testes** (usar o helper `dbComPropostas`; acrescentar uma proposta PERDIDA do consultor A com `motivo_perda='PREÇO'`, `termometro='FRIO'`, `data_emissao='2026-05-20'`, e uma PERDIDA do consultor B):
  - Substituir o teste "inclui só propostas ATIVA" por: linhas = ATIVA + PERDIDA do consultor A (2 linhas); FECHADA e a perdida do B ausentes.
  - Linha da ativa: `'Data de criação' === '01/07/2026'`, `'Motivo da perda'` vazio/ausente. Linha da perdida: `'Data de criação' === '20/05/2026'`, `'Motivo da perda' === 'PREÇO'`, `'Termômetro' === 'FRIO'`.
  - A aba `INSTRUÇÕES` contém uma linha com todos os motivos válidos (`MOTIVOS_PERDA.join(', ')`).
- [ ] **Step 2: Rodar `npx node --test tests/consultorPlanilha.test.js`** — esperado: FALHA.
- [ ] **Step 3: Implementar.** Query passa a `p.status IN ('ATIVA','PERDIDA')` e seleciona `p.data_emissao`, `p.motivo_perda`; formatar data com `iso.split('-').reverse().join('/')`; motivo só preenchido (`p.motivo_perda || ''`). Em `INSTRUCOES` acrescentar: linha dos motivos válidos, "Status PERDIDA: o termômetro vira FRIO automaticamente" e "Data de criação é só para consulta, não é importada".
- [ ] **Step 4: `npm test`** — esperado: passa (os testes de importação existentes usam arrays curtos; continuam válidos).
- [ ] **Step 5: Commit** `feat: planilha do consultor inclui perdidas, data de criacao e motivo`

### Task 3: Importação — motivo, FRIO e aviso de perdidas sem motivo

**Files:**
- Modify: `src/consultorPlanilha.js` (`importarAtualizacoesConsultor`), `src/routes.js:188-202` (nada a mudar além de garantir que o `resumo` novo seja repassado — já usa `...resumo`), `public/js/consultores.js:207-208` (mensagem)
- Test: `tests/consultorPlanilha.test.js`

**Interfaces:**
- Consumes: `MOTIVOS_PERDA`, `atualizarProposta`.
- Produces: o objeto de retorno ganha `perdidasSemMotivo: number` (propostas que MUDARAM para PERDIDA nesta importação e terminaram sem motivo).

Regras (decididas no spec):
- Status final da linha = status válido da planilha, senão o atual. Se PERDIDA: forçar `dados.termometro = 'FRIO'` (ignorar a coluna Termômetro), exceto quando o atual já é FRIO (não gerar update vazio).
- Motivo: normalizar `trim().toUpperCase()`; só aplicar se estiver em `MOTIVOS_PERDA` e for diferente do atual. Célula vazia ou fora da lista nunca apaga nem altera o motivo já gravado. Só lido quando o status final é PERDIDA.
- `perdidasSemMotivo` conta só transições para PERDIDA cujo motivo final (novo ou já existente) é vazio.
- "Data de criação" ignorada.

- [ ] **Step 1: Escrever testes que falham** (linhas como arrays de 13 posições; `hoje='2026-07-10'`):
  - ATIVA/QUENTE → status `PERDIDA`, Termômetro `QUENTE`, motivo `' preço '`: no banco `status='PERDIDA'`, `termometro='FRIO'`, `motivo_perda='PREÇO'`; `perdidasSemMotivo === 0`.
  - ATIVA → `PERDIDA` sem motivo: importa (status PERDIDA, FRIO, motivo NULL) e `perdidasSemMotivo === 1`.
  - ATIVA → `PERDIDA` com motivo `'BLA BLA'`: motivo NULL, `perdidasSemMotivo === 1`.
  - Perdida existente (`motivo_perda='PREÇO'`, FRIO) reimportada com Status `PERDIDA`, Termômetro vazio e Motivo vazio: continua `FRIO` e `PREÇO`; `atualizadas === 0`; `perdidasSemMotivo === 0`.
  - Perdida existente com motivo livre `'CLIENTE COMPROU DO VIZINHO'` reimportada com Motivo `'PREÇO...'` inválido ou vazio: motivo livre preservado.
  - Perdida existente reimportada com Status `ATIVA`: volta a ATIVA, `motivo_perda` NULL (comportamento já garantido por `sincronizarFechamento`).
- [ ] **Step 2: Rodar `npx node --test tests/consultorPlanilha.test.js`** — esperado: FALHA.
- [ ] **Step 3: Implementar** em `importarAtualizacoesConsultor`: buscar também `motivo_perda` em `buscaProposta`; aplicar as regras acima antes de `atualizarProposta`; somar `perdidasSemMotivo` no `resultado` (inicializar em 0). Em `public/js/consultores.js` acrescentar ao aviso: `(resumo.perdidasSemMotivo ? ` · Perdidas sem motivo: ${resumo.perdidasSemMotivo}` : '')`.
- [ ] **Step 4: `npm test`** — esperado: passa.
- [ ] **Step 5: Commit** `feat: importacao da planilha le motivo da perda e forca FRIO`

### Task 4: Tela — termômetro travado em FRIO quando perdida

**Files:**
- Modify: `public/js/propostas.js` (select `#f-termometro` ~linha 250, handler `#f-status` onchange ~linha 307, `coletar` ~linha 329)

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Implementar.** Ao abrir o formulário com `p.status === 'PERDIDA'`, o select `#f-termometro` abre com `FRIO` selecionado e `disabled`. No `onchange` de `#f-status`: se `PERDIDA`, setar valor `FRIO` e `disabled = true`; senão `disabled = false`. Em `coletar`, o valor continua lido de `.value` (select desabilitado ainda tem `.value`). Também cobrir os botões rápidos "Marcar como perdida" já existentes: o servidor garante o FRIO (Task 1), nada a mudar na tela deles.
- [ ] **Step 2: Verificação manual** (`run` skill / app na porta 3060): abrir uma proposta ATIVA/QUENTE, mudar Status para PERDIDA → termômetro vira FRIO e fica travado; voltar para ATIVA → destrava. Salvar como PERDIDA e reabrir: FRIO. Marcar como perdida pelo botão rápido: reabrir e ver FRIO. Exportar a planilha do consultor e conferir as perdidas, as 2 colunas novas e a aba INSTRUÇÕES; editar um status para PERDIDA na planilha com motivo `PRAZO`, importar, e conferir motivo e FRIO na tela.
- [ ] **Step 3: `npm test`** — esperado: passa.
- [ ] **Step 4: Commit** `feat: termometro travado em FRIO na tela quando a proposta esta perdida`
