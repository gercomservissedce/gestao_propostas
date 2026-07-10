# Campo Origem da proposta — Design

Data: 2026-07-10

## Objetivo

Registrar de onde veio cada proposta (Lead, Prospecção Ativa, Indicação, Renovação,
Evento), para acompanhar no formulário, na listagem, no filtro e na análise de
conversão por origem.

Valores: `LEAD`, `PROSPECÇÃO ATIVA`, `INDICAÇÃO`, `RENOVAÇÃO`, `EVENTO` — lista fixa,
mas gravada como texto livre no banco, sem `CHECK` no SQL (mesmo padrão de `etapa` e
`termometro`, que também são listas fechadas na UI sem restrição no schema). Campo
opcional — proposta pode ser salva sem origem definida.

## Mudanças por camada

### 1. `src/db.js`

Adiciona `origem: 'TEXT'` em `MIGRACOES_PROPOSTAS`, o mesmo mecanismo já usado para
`custo_dep01`/`roi_dep01`/`custo_dep02`/`roi_dep02` — `ALTER TABLE propostas ADD COLUMN
origem TEXT` roda automaticamente em bancos existentes que ainda não têm a coluna.

### 2. `src/propostaUpdate.js`

Adiciona `'origem'` ao array `CAMPOS_PROPOSTA`. Como `atualizarProposta` já grava
genericamente qualquer campo presente nessa lista (usado tanto pelo `POST` quanto pelo
`PUT` de proposta), isso já é suficiente para persistir a origem ao criar/editar — sem
lógica nova.

### 3. `src/routes.js`

`GET /propostas` aceita `?origem=` com igualdade exata (`p.origem = ?`), no mesmo padrão
de `status`/`etapa`/`filial_id` já existentes na rota.

### 4. `public/js/propostas.js`

- Nova constante `const ORIGENS = ['LEAD', 'PROSPECÇÃO ATIVA', 'INDICAÇÃO', 'RENOVAÇÃO', 'EVENTO'];`
  junto de `ETAPAS`.
- `filtros` ganha `origem: ''`.
- Novo `<select id="pr-origem">` na linha de filtros (opção "Todas" + as 5 origens),
  ligado via `liga('pr-origem', 'origem')`, mesmo padrão do filtro de Etapa.
- Nova coluna **Origem** na tabela de listagem (`<th>Origem</th>` / `<td>${esc(p.origem || '—')}</td>`),
  posicionada depois da coluna Etapa.
- Novo `<select id="f-origem">` no formulário de criar/editar (opção em branco "—" +
  as 5 origens), incluído em `coletar()` como `origem: document.getElementById('f-origem').value || ''`.

### 5. `public/js/analise.js`

Novo agrupamento client-side (mesmo padrão de `porFilial`, já existente): para cada
proposta, agrupa por `p.origem || 'Sem origem'`, contando total, fechadas e valor
fechado; calcula conversão (`fechadas / total * 100`). Novo cartão **"Conversão por
origem"**, com tabela igual à de "Conversão por filial" (colunas: Origem, Emitidas,
Fechadas, Conversão, Valor fechado), sem linhas clicáveis (mesmo comportamento do
cartão de filial hoje). Cartão posicionado logo abaixo do grid de duas colunas
existente (`grade-2`), ocupando a largura toda.

## Fora de escopo

- A planilha legada de import (`Modelo/RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx`) não tem
  coluna de origem — o importer (`src/importer.js`) não é alterado.
- A planilha de exportar/reimportar propostas por consultor (`src/consultorPlanilha.js`)
  não ganha esse campo agora.
- Sem obrigatoriedade, sem validação de servidor contra a lista fixa (mesmo padrão de
  etapa/termômetro — a lista fechada só existe na UI).

## Testes

- Migração: banco antigo sem a coluna `origem` ganha a coluna ao abrir (mesmo teste já
  existente para `custo_dep01` em `tests/db.test.js`, adaptado).
- `POST`/`PUT /api/propostas` persistem e retornam `origem`.
- `GET /api/propostas?origem=LEAD` retorna só propostas com essa origem.
