# Planilha de acompanhamento por consultor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela Consultores, permitir selecionar um consultor, gerar uma planilha `.xlsx`
com as propostas ativas dele para ele preencher status/etapa/termômetro/contato, e depois
reimportar essa planilha para atualizar o banco.

**Architecture:** Um módulo novo `src/consultorPlanilha.js` concentra a geração e a leitura
da planilha (usando a biblioteca `xlsx` já presente no projeto). Um helper compartilhado
`src/propostaUpdate.js` extrai a lógica de atualização de proposta (hoje só dentro do `PUT
/api/propostas/:id`) para ser reaproveitada pela reimportação. Duas rotas novas em
`src/routes.js` expõem exportar/importar. No front-end, `public/js/consultores.js` ganha
uma coluna de seleção (rádio) e uma barra de ações.

**Tech Stack:** Node.js, Express 5, better-sqlite3, biblioteca `xlsx` (já em
`package.json`), `node:test` para os testes. Sem dependências novas.

## Global Constraints

- Não adicionar dependências novas (reusar `xlsx`, já em `package.json`).
- A planilha exportada só contém propostas do consultor com `status = 'ATIVA'`.
- A reimportação identifica a proposta pela coluna `ID` (chave interna) — nunca por
  nº/cliente.
- `Status` e `Termômetro` só são aplicados se o valor da célula bater com a lista aceita
  (`ATIVA`/`FECHADA`/`PERDIDA` e `QUENTE`/`MORNO`/`FRIO`); fora disso, mantém o valor
  atual da proposta em vez de falhar. `Etapa` é texto livre.
- Linhas com `ID` que não existe no banco são só contadas (`naoEncontradas`), não
  interrompem o processamento das demais linhas.
- Mudança de `Status` deve passar por `sincronizarFechamento` (`src/parse.js`), a mesma
  regra já usada pelo `PUT /api/propostas/:id`, para manter etapa/data de fechamento
  coerentes.
- Datas digitadas como texto na planilha do consultor seguem o formato `dd/mm/aaaa`
  (diferente do `toIsoDate` de `src/parse.js`, que assume `m/d/aaaa` para a planilha
  legada — por isso este recurso usa um parser de data próprio, não o `toIsoDate`).
- Fora de escopo: dropdown de validação na planilha, exportar propostas fechadas/perdidas,
  criar propostas/consultores por essa via, proteção de células.

---

### Task 1: Extrair `atualizarProposta` para um módulo compartilhado

**Files:**
- Create: `src/propostaUpdate.js`
- Create: `tests/propostaUpdate.test.js`
- Modify: `src/routes.js:1-22` (import) e `src/routes.js:104-114` (handler do `PUT`)

**Interfaces:**
- Produces: `atualizarProposta(db, id, dados, hoje) -> { changes: number, nada: boolean }`
  e `CAMPOS_PROPOSTA` (array de strings), exportados por `src/propostaUpdate.js`. `nada`
  é `true` quando `dados` não tinha nenhum campo reconhecido (nada para salvar); `changes`
  é o número de linhas afetadas pelo `UPDATE` (0 se o `id` não existe).
- Consumes (Task 3): `atualizadarProposta` será chamado pela reimportação da planilha.

- [ ] **Step 1: Escrever o teste (vai falhar — módulo ainda não existe)**

Crie `tests/propostaUpdate.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { atualizarProposta } = require('../src/propostaUpdate');

function dbComProposta() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const info = db.prepare(
    "INSERT INTO propostas (filial_id, numero, data_emissao, cliente) VALUES (1, '100', '2026-07-01', 'COND TESTE')"
  ).run();
  return { db, id: info.lastInsertRowid };
}

test('atualizarProposta grava campos informados e aplica sincronizarFechamento', () => {
  const { db, id } = dbComProposta();
  const r = atualizarProposta(db, id, { status: 'FECHADA' }, '2026-07-10');
  assert.equal(r.changes, 1);
  assert.equal(r.nada, false);
  const p = db.prepare('SELECT status, etapa, data_fechamento FROM propostas WHERE id = ?').get(id);
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.etapa, 'FECHADO');
  assert.equal(p.data_fechamento, '2026-07-10');
});

test('atualizarProposta retorna nada=true sem campos e changes=0 para id inexistente', () => {
  const { db, id } = dbComProposta();
  const semCampos = atualizarProposta(db, id, {}, '2026-07-10');
  assert.equal(semCampos.nada, true);
  assert.equal(semCampos.changes, 0);

  const idInexistente = atualizarProposta(db, 999999, { status: 'ATIVA' }, '2026-07-10');
  assert.equal(idInexistente.nada, false);
  assert.equal(idInexistente.changes, 0);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/propostaUpdate'`

- [ ] **Step 3: Criar `src/propostaUpdate.js`**

```js
const { sincronizarFechamento } = require('./parse');

const CAMPOS_PROPOSTA = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'vlr_comodato', 'vlr_serv_adicional', 'vlr_mensal', 'vlr_taxa_adesao',
  'vlr_venda', 'vlr_instalacao', 'vlr_serv_especial', 'vlr_total', 'consultor_id',
  'descricao', 'observacao', 'termometro', 'proxima_data_contato',
  'marcada_relatorio', 'valor_minimo_fechamento',
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02',
];

// Compartilhado pelo PUT /api/propostas/:id e pela reimportação da planilha
// do consultor, para os dois manterem a mesma regra de fechamento.
function atualizarProposta(db, id, dados, hoje) {
  const b = sincronizarFechamento(dados, hoje);
  const cols = CAMPOS_PROPOSTA.filter(c => b[c] !== undefined);
  if (!cols.length) return { changes: 0, nada: true };
  const stmt = db.prepare(
    `UPDATE propostas SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
  );
  const info = stmt.run(...cols.map(c => b[c] === '' ? null : b[c]), id);
  return { changes: info.changes, nada: false };
}

module.exports = { atualizarProposta, CAMPOS_PROPOSTA };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS (todos os testes, incluindo os dois novos)

- [ ] **Step 5: Atualizar `src/routes.js` para usar o módulo novo**

Em `src/routes.js`, remova a constante `CAMPOS_PROPOSTA` local (linhas 14-21 do arquivo
atual) e o `require` de `./parse` continua igual (ainda usado por `normalizar` e
`sincronizarFechamento` no `POST`). Adicione o import do módulo novo logo após os imports
existentes:

```js
const { atualizarProposta, CAMPOS_PROPOSTA } = require('./propostaUpdate');
```

Troque o handler do `PUT /propostas/:id` (hoje monta o `UPDATE` manualmente) por:

```js
  r.put('/propostas/:id', (req, res) => {
    const { changes, nada } = atualizarProposta(db, req.params.id, req.body, hojeLocalIso());
    if (nada) return res.status(400).json({ erro: 'Nada para atualizar' });
    if (!changes) return res.status(404).json({ erro: 'Proposta não encontrada' });
    res.json({ ok: true });
  });
```

O `POST /propostas` continua igual — ele já usa `CAMPOS_PROPOSTA`, que agora vem do
import em vez da constante local.

- [ ] **Step 6: Rodar toda a suíte para confirmar que nada quebrou**

Run: `npm test`
Expected: PASS — inclui `tests/routes.test.js` (o teste de `PUT` de custos/ROI continua
passando, o comportamento não mudou, só foi movido de arquivo).

- [ ] **Step 7: Commit**

```bash
git add src/propostaUpdate.js tests/propostaUpdate.test.js src/routes.js
git commit -m "refactor: extrai atualizarProposta para uso compartilhado"
```

---

### Task 2: Gerar a planilha de propostas ativas do consultor

**Files:**
- Create: `src/consultorPlanilha.js`
- Create: `tests/consultorPlanilha.test.js`

**Interfaces:**
- Produces: `gerarPlanilhaConsultor(db, consultorId) -> Buffer` (arquivo `.xlsx` em
  memória, aba `PROPOSTAS` + aba `INSTRUÇÕES`) e `COLUNAS_PROPOSTAS` (array de strings
  com os nomes das colunas, nessa ordem), exportados por `src/consultorPlanilha.js`.
- Consumes: nenhuma interface de outra task (usa só `better-sqlite3` e `xlsx`).

- [ ] **Step 1: Escrever o teste (vai falhar — módulo ainda não existe)**

Crie `tests/consultorPlanilha.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { openDb } = require('../src/db');
const { gerarPlanilhaConsultor } = require('../src/consultorPlanilha');

function dbComPropostas() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const consultorA = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR A','FRANQUEADO')"
  ).run().lastInsertRowid;
  const consultorB = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR B','FRANQUEADO')"
  ).run().lastInsertRowid;
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa, termometro, vlr_total, consultor_id)
    VALUES (1, '1', '2026-07-01', 'COND ATIVA', 'ATIVA', 'EM NEGOCIAÇÃO', 'QUENTE', 1000, ?)`).run(consultorA);
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa, vlr_total, consultor_id, data_fechamento)
    VALUES (1, '2', '2026-06-01', 'COND FECHADA', 'FECHADA', 'FECHADO', 2000, ?, '2026-06-15')`).run(consultorA);
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, vlr_total, consultor_id)
    VALUES (1, '3', '2026-07-01', 'COND OUTRO CONSULTOR', 'ATIVA', 3000, ?)`).run(consultorB);
  return { db, consultorA };
}

test('gerarPlanilhaConsultor inclui só propostas ATIVA do consultor pedido', () => {
  const { db, consultorA } = dbComPropostas();
  const buffer = gerarPlanilhaConsultor(db, consultorA);
  const wb = XLSX.read(buffer, { type: 'buffer' });

  assert.ok(wb.SheetNames.includes('PROPOSTAS'));
  assert.ok(wb.SheetNames.includes('INSTRUÇÕES'));

  const linhas = XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS']);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0]['Nº proposta'], '1');
  assert.equal(linhas[0]['Cliente'], 'COND ATIVA');
  assert.equal(linhas[0]['Filial'], 'CEARÁ');
  assert.equal(linhas[0]['Status'], 'ATIVA');
  assert.equal(linhas[0]['Termômetro'], 'QUENTE');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/consultorPlanilha'`

- [ ] **Step 3: Criar `src/consultorPlanilha.js` (parte 1: exportar)**

```js
const XLSX = require('xlsx');

const COLUNAS_PROPOSTAS = [
  'ID', 'Nº proposta', 'Cliente', 'Filial', 'Valor total', 'Status', 'Etapa',
  'Termômetro', 'Data novo contato', 'Anotação do contato', 'Próximo contato',
];

const INSTRUCOES = [
  ['Como preencher esta planilha'],
  [''],
  ['Não altere a coluna ID — ela identifica a proposta na hora de importar de volta.'],
  ['Status: ATIVA, FECHADA ou PERDIDA.'],
  ['Termômetro: QUENTE, MORNO, FRIO ou deixe em branco.'],
  ['Etapa: texto livre (ex.: EM NEGOCIAÇÃO, AGUARDANDO VISITA).'],
  ['Datas no formato dd/mm/aaaa.'],
  ['Preencha "Data novo contato" só se for registrar um contato novo com o cliente.'],
];

function gerarPlanilhaConsultor(db, consultorId) {
  const linhas = db.prepare(`
    SELECT p.id, p.numero, p.cliente, f.estado filial, p.vlr_total, p.status, p.etapa, p.termometro
    FROM propostas p
    LEFT JOIN filiais f ON f.id = p.filial_id
    WHERE p.consultor_id = ? AND p.status = 'ATIVA'
    ORDER BY p.data_emissao DESC
  `).all(consultorId);

  const aoa = [COLUNAS_PROPOSTAS, ...linhas.map(p => [
    p.id, p.numero, p.cliente, p.filial || '', p.vlr_total, p.status, p.etapa || '',
    p.termometro || '', '', '', '',
  ])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCOES), 'INSTRUÇÕES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { gerarPlanilhaConsultor, COLUNAS_PROPOSTAS };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/consultorPlanilha.js tests/consultorPlanilha.test.js
git commit -m "feat: gera planilha de propostas ativas por consultor"
```

---

### Task 3: Reimportar a planilha preenchida pelo consultor

**Files:**
- Modify: `src/parse.js` (extrair `serialExcelParaIso`, reaproveitado pelo parser de data
  desta task — ver Step 0)
- Modify: `src/consultorPlanilha.js` (adicionar `importarAtualizacoesConsultor`)
- Modify: `tests/consultorPlanilha.test.js` (adicionar os testes de reimportação)

**Interfaces:**
- Consumes: `atualizarProposta(db, id, dados, hoje)` de `src/propostaUpdate.js` (Task 1);
  `COLUNAS_PROPOSTAS` (Task 2, para montar as planilhas de teste com o mesmo cabeçalho).
- Produces: `importarAtualizacoesConsultor(db, buffer, hoje) -> { atualizadas: number,
  contatosAdicionados: number, naoEncontradas: number }`, exportado por
  `src/consultorPlanilha.js`; `serialExcelParaIso(v) -> string|null|undefined` (`undefined`
  quando `v` não é número nem `Date`, sinalizando ao chamador que trate como texto),
  exportado por `src/parse.js` e reaproveitado por `toIsoDate` (comportamento inalterado).

- [ ] **Step 0: Extrair `serialExcelParaIso` em `src/parse.js` (evita duplicar a conversão de serial do Excel)**

O parser de data desta task (`paraDataIso`, Step 3) precisa da mesma conversão de serial
Excel/`Date` que `toIsoDate` já faz — só o texto digitado divide os dois (`toIsoDate`
assume `m/d/aaaa` da planilha legada; a planilha do consultor usa `dd/mm/aaaa`). Em vez de
copiar essa lógica, extraia a parte comum. Em `src/parse.js`, troque a função `toIsoDate`
por:

```js
// Conversão de serial do Excel / objeto Date para ISO — comum a toIsoDate (texto
// m/d/aaaa da planilha legada) e ao parser de data da planilha do consultor (texto
// dd/mm/aaaa, em src/consultorPlanilha.js). undefined sinaliza "não é serial nem
// Date", para o chamador tratar como texto.
function serialExcelParaIso(v) {
  if (typeof v === 'number') {
    if (v <= 0) return null;
    const d = new Date(EXCEL_EPOCH_UTC + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const dias = Math.round((v.getTime() - EXCEL_EPOCH_UTC) / 86400000);
    const d = new Date(EXCEL_EPOCH_UTC + dias * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  return undefined;
}

// Datas da planilha vêm como serial do Excel (raw), Date ou texto M/D/YY
function toIsoDate(v) {
  if (v == null) return null;
  const serial = serialExcelParaIso(v);
  if (serial !== undefined) return serial;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mes, dia, ano] = m;
  ano = Number(ano);
  if (ano < 100) ano += 2000;
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}
```

Troque o `module.exports` de `src/parse.js` por:

```js
module.exports = { toIsoDate, toNumber, mapStatus, mapEtapa, normalizar, sincronizarFechamento, serialExcelParaIso };
```

Run: `npm test -- tests/parse.test.js`
Expected: PASS — o comportamento de `toIsoDate` não muda (mesma lógica, só reorganizada);
os testes existentes de `toIsoDate` (`Date` e string `M/D/YY`) continuam cobrindo os dois
caminhos.

- [ ] **Step 1: Escrever os testes (vão falhar — função ainda não existe)**

Adicione ao final de `tests/consultorPlanilha.test.js`:

```js
const { importarAtualizacoesConsultor, COLUNAS_PROPOSTAS } = require('../src/consultorPlanilha');

function planilhaAtualizacao(linhas) {
  const wb = XLSX.utils.book_new();
  const aoa = [COLUNAS_PROPOSTAS, ...linhas];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('importarAtualizacoesConsultor atualiza status/etapa/termômetro e registra contato', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, 'FECHADA', 'FECHADO', 'MORNO',
      '10/07/2026', 'Cliente confirmou fechamento', '20/07/2026'],
    [999999, '999', 'INEXISTENTE', '', 0, 'ATIVA', '', '', '', '', ''],
  ]);

  const r = importarAtualizacoesConsultor(db, buffer, '2026-07-10');
  assert.equal(r.atualizadas, 1);
  assert.equal(r.contatosAdicionados, 1);
  assert.equal(r.naoEncontradas, 1);

  const p = db.prepare(
    'SELECT status, etapa, termometro, data_fechamento, proxima_data_contato FROM propostas WHERE id = ?'
  ).get(idAtiva);
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.etapa, 'FECHADO');
  assert.equal(p.termometro, 'MORNO');
  assert.equal(p.data_fechamento, '2026-07-10');
  assert.equal(p.proxima_data_contato, '2026-07-20');

  const contato = db.prepare(
    'SELECT data, anotacao, proximo_contato FROM contatos WHERE proposta_id = ?'
  ).get(idAtiva);
  assert.equal(contato.data, '2026-07-10');
  assert.equal(contato.anotacao, 'Cliente confirmou fechamento');
  assert.equal(contato.proximo_contato, '2026-07-20');
});

test('importarAtualizacoesConsultor ignora Status fora da lista aceita', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;
  const antes = db.prepare('SELECT status FROM propostas WHERE id = ?').get(idAtiva);

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, 'TALVEZ', '', '', '', '', ''],
  ]);
  importarAtualizacoesConsultor(db, buffer, '2026-07-10');

  const depois = db.prepare('SELECT status FROM propostas WHERE id = ?').get(idAtiva);
  assert.equal(depois.status, antes.status);
});

test('importarAtualizacoesConsultor limpa termômetro quando a célula vem vazia', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, '', '', '', '', '', ''],
  ]);
  importarAtualizacoesConsultor(db, buffer, '2026-07-10');

  const depois = db.prepare('SELECT termometro FROM propostas WHERE id = ?').get(idAtiva);
  assert.equal(depois.termometro, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `importarAtualizacoesConsultor is not a function`

- [ ] **Step 3: Adicionar `importarAtualizacoesConsultor` em `src/consultorPlanilha.js`**

No topo do arquivo, adicione os imports do helper compartilhado e do parser de serial:

```js
const { atualizarProposta } = require('./propostaUpdate');
const { serialExcelParaIso } = require('./parse');
```

No final do arquivo, antes do `module.exports`, adicione:

```js
const STATUS_VALIDOS = ['ATIVA', 'FECHADA', 'PERDIDA'];
const TERMOMETROS_VALIDOS = ['QUENTE', 'MORNO', 'FRIO'];

// Datas digitadas como texto na planilha do consultor seguem dd/mm/aaaa
// (diferente do toIsoDate de src/parse.js, que assume m/d/aaaa para
// compatibilidade com a planilha legada). Serial do Excel e objeto Date são
// tratados por serialExcelParaIso, compartilhado com toIsoDate.
function paraDataIso(v) {
  if (v == null || v === '') return null;
  const serial = serialExcelParaIso(v);
  if (serial !== undefined) return serial;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  ano = Number(ano);
  if (ano < 100) ano += 2000;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function importarAtualizacoesConsultor(db, buffer, hoje) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets['PROPOSTAS'];
  const linhas = sheet ? XLSX.utils.sheet_to_json(sheet) : [];

  const buscaProposta = db.prepare('SELECT id FROM propostas WHERE id = ?');
  const insContato = db.prepare(
    'INSERT INTO contatos (proposta_id, data, anotacao, proximo_contato) VALUES (?, ?, ?, ?)'
  );
  const atualizaProximoContato = db.prepare(
    'UPDATE propostas SET proxima_data_contato = ? WHERE id = ?'
  );

  const resultado = { atualizadas: 0, contatosAdicionados: 0, naoEncontradas: 0 };

  const importarTudo = db.transaction(() => {
    for (const linha of linhas) {
      const id = Number(linha['ID']);
      if (!id || !buscaProposta.get(id)) { resultado.naoEncontradas++; continue; }

      const dados = {};
      const status = String(linha['Status'] || '').trim().toUpperCase();
      if (STATUS_VALIDOS.includes(status)) dados.status = status;

      const termometro = String(linha['Termômetro'] || '').trim().toUpperCase();
      if (termometro === '') dados.termometro = null;
      else if (TERMOMETROS_VALIDOS.includes(termometro)) dados.termometro = termometro;

      const etapa = String(linha['Etapa'] || '').trim().toUpperCase();
      if (etapa) dados.etapa = etapa;

      const { changes } = atualizarProposta(db, id, dados, hoje);
      if (changes) resultado.atualizadas++;

      const dataContato = paraDataIso(linha['Data novo contato']);
      if (dataContato) {
        const proximoContato = paraDataIso(linha['Próximo contato']);
        insContato.run(id, dataContato, String(linha['Anotação do contato'] || '').trim() || null, proximoContato);
        if (proximoContato) atualizaProximoContato.run(proximoContato, id);
        resultado.contatosAdicionados++;
      }
    }
  });
  importarTudo();

  return resultado;
}
```

Troque o `module.exports` no final do arquivo por:

```js
module.exports = { gerarPlanilhaConsultor, importarAtualizacoesConsultor, COLUNAS_PROPOSTAS };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parse.js src/consultorPlanilha.js tests/consultorPlanilha.test.js
git commit -m "feat: importa atualizações da planilha do consultor"
```

---

### Task 4: Rotas de exportar/importar

**Files:**
- Modify: `src/routes.js` (adicionar duas rotas)
- Modify: `server.js:22` (aumentar limite do `express.json`)
- Modify: `tests/routes.test.js` (expor `db` em `subirApp`, adicionar 2 testes, importar `xlsx`)

**Interfaces:**
- Consumes: `gerarPlanilhaConsultor`, `importarAtualizacoesConsultor` de
  `src/consultorPlanilha.js` (Tasks 2 e 3).
- Produces: `GET /api/consultores/:id/exportar` (retorna o `.xlsx` como download) e
  `POST /api/consultores/importar-atualizacoes` (body `{ arquivo: <base64> }`, retorna
  `{ atualizadas, contatosAdicionados, naoEncontradas }`) — usados pelo front-end na Task 5.

- [ ] **Step 1: Escrever os testes de rota (vão falhar — rotas ainda não existem)**

Em `tests/routes.test.js`, adicione os imports no topo:

```js
const XLSX = require('xlsx');
const { COLUNAS_PROPOSTAS } = require('../src/consultorPlanilha');
```

Troque a função `subirApp` para também devolver o `db`:

```js
function subirApp() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const app = express();
  app.use(express.json());
  app.use('/api', criarRotas(db));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return { db, server, base };
}
```

Adicione ao final do arquivo:

```js
test('GET /consultores/:id/exportar gera planilha só com propostas ATIVA do consultor', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const consultorId = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR TESTE', 'FRANQUEADO')"
  ).run().lastInsertRowid;
  await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '10', data_emissao: '2026-07-01', cliente: 'COND EXPORT', consultor_id: consultorId,
    }),
  });

  const resp = await fetch(`${base}/api/consultores/${consultorId}/exportar`);
  assert.equal(resp.status, 200);
  assert.match(resp.headers.get('content-disposition') || '', /attachment/);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS']);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0]['Cliente'], 'COND EXPORT');

  const semConsultor = await fetch(`${base}/api/consultores/999999/exportar`);
  assert.equal(semConsultor.status, 404);
});

test('POST /consultores/importar-atualizacoes aplica mudanças da planilha', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const consultorId = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR IMPORT', 'FRANQUEADO')"
  ).run().lastInsertRowid;
  const criar = await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '20', data_emissao: '2026-07-01', cliente: 'COND IMPORT', consultor_id: consultorId,
    }),
  });
  const { id } = await criar.json();

  const wb = XLSX.utils.book_new();
  const aoa = [
    COLUNAS_PROPOSTAS,
    [id, '20', 'COND IMPORT', '', 0, 'FECHADA', 'FECHADO', 'QUENTE', '', '', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  const arquivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');

  const resp = await fetch(`${base}/api/consultores/importar-atualizacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo }),
  });
  assert.equal(resp.status, 200);
  const resumo = await resp.json();
  assert.equal(resumo.atualizadas, 1);
  assert.equal(resumo.naoEncontradas, 0);

  const p = await (await fetch(`${base}/api/propostas/${id}`)).json();
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.termometro, 'QUENTE');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `404` nas duas rotas novas (ainda não existem)

- [ ] **Step 3: Adicionar as rotas em `src/routes.js`**

Adicione o import no topo, junto aos demais:

```js
const { gerarPlanilhaConsultor, importarAtualizacoesConsultor } = require('./consultorPlanilha');
```

Adicione as duas rotas logo após `r.get('/consultores/stats', ...)`:

```js
  r.get('/consultores/:id/exportar', (req, res) => {
    const consultor = db.prepare('SELECT * FROM consultores WHERE id = ?').get(req.params.id);
    if (!consultor) return res.status(404).json({ erro: 'Consultor não encontrado' });
    const buffer = gerarPlanilhaConsultor(db, consultor.id);
    const nomeArquivo = `${consultor.nome.replace(/[^\w\-À-ÿ ]/g, '')}-propostas-${hojeLocalIso()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  });

  r.post('/consultores/importar-atualizacoes', (req, res) => {
    if (!req.body.arquivo) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    try {
      const buffer = Buffer.from(req.body.arquivo, 'base64');
      res.json(importarAtualizacoesConsultor(db, buffer, hojeLocalIso()));
    } catch (e) {
      res.status(400).json({ erro: `Falha ao importar planilha: ${e.message}` });
    }
  });
```

- [ ] **Step 4: Aumentar o limite do body JSON em `server.js`**

A planilha em base64 pode passar do limite padrão de 100kb do `express.json()`. Em
`server.js`, troque:

```js
app.use(express.json());
```

por:

```js
app.use(express.json({ limit: '10mb' }));
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS (toda a suíte, incluindo os dois testes novos de rota)

- [ ] **Step 6: Commit**

```bash
git add src/routes.js server.js tests/routes.test.js
git commit -m "feat: rotas de exportar/importar planilha do consultor"
```

---

### Task 5: Seleção de consultor e ações na tela Consultores

**Files:**
- Modify: `public/js/consultores.js` (reescrita completa do arquivo)

**Interfaces:**
- Consumes: `GET /api/consultores/:id/exportar` e `POST
  /api/consultores/importar-atualizacoes` (Task 4); `apiGet`/`apiSend`/`aviso` de
  `public/js/api.js`; `esc`/`fmtMoeda`/`fmtPct` de `public/js/format.js` (já usados no
  arquivo).
- Produces: nenhuma interface nova consumida por outro arquivo — é a tela final.

Sem teste automatizado (não há harness de DOM no projeto); a verificação é manual no
navegador, no Step 3.

- [ ] **Step 1: Reescrever `public/js/consultores.js`**

Substitua o conteúdo inteiro do arquivo por:

```js
const Consultores = {
  ordem: { coluna: 'valorFechado', desc: true },
  dados: [],
  selecionado: null,

  async carregar() {
    this.dados = await apiGet('/api/consultores/stats');
    this.render();
  },

  render() {
    const tela = document.getElementById('tela-consultores');
    const d = [...this.dados].sort((a, b) => {
      const va = a[this.ordem.coluna] ?? -1;
      const vb = b[this.ordem.coluna] ?? -1;
      if (typeof va === 'string') return this.ordem.desc ? vb.localeCompare(va) : va.localeCompare(vb);
      return this.ordem.desc ? vb - va : va - vb;
    });

    const grupo = tipo => {
      const g = this.dados.filter(c => c.tipo === tipo && c.emitidas > 0);
      const emitidas = g.reduce((s, c) => s + c.emitidas, 0);
      const fechadas = g.reduce((s, c) => s + c.fechadas, 0);
      return {
        n: g.length, emitidas, fechadas,
        valor: g.reduce((s, c) => s + c.valorTotal, 0),
        valorFechado: g.reduce((s, c) => s + c.valorFechado, 0),
        conversao: emitidas ? (100 * fechadas) / emitidas : 0,
      };
    };
    const fr = grupo('FRANQUEADO');
    const clt = grupo('CONSULTOR CLT');

    const col = (chave, rotulo) => {
      const seta = this.ordem.coluna === chave ? (this.ordem.desc ? ' ▾' : ' ▴') : '';
      return `<th class="ordenavel num" data-col="${chave}">${rotulo}${seta}</th>`;
    };

    const nomeSelecionado = (this.dados.find(c => c.id === this.selecionado) || {}).nome;

    tela.innerHTML = `
      <div class="linha-filtros" style="margin-bottom:10px">
        <button class="btn btn-primario" id="cons-exportar" ${this.selecionado ? '' : 'disabled'}>Gerar planilha do consultor</button>
        <button class="btn" id="cons-importar" ${this.selecionado ? '' : 'disabled'}>Importar atualizações</button>
        <input type="file" id="cons-arquivo" accept=".xlsx" style="display:none">
        ${nomeSelecionado ? `<span style="color:var(--tinta-2);font-size:12.5px">Selecionado: ${esc(nomeSelecionado)}</span>` : ''}
      </div>
      <div class="kpis">
        <div class="cartao kpi">
          <div class="rotulo">Franqueados (${fr.n} com propostas)</div>
          <div class="valor">${fmtMoeda(fr.valorFechado)}</div>
          <div class="detalhe">${fr.emitidas} emitidas · ${fr.fechadas} fechadas · conversão ${fmtPct(fr.conversao)}</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Consultores CLT (${clt.n} com propostas)</div>
          <div class="valor">${fmtMoeda(clt.valorFechado)}</div>
          <div class="detalhe">${clt.emitidas} emitidas · ${clt.fechadas} fechadas · conversão ${fmtPct(clt.conversao)}</div>
        </div>
      </div>
      <div class="cartao"><div class="rolagem">
      <table class="tabela">
        <thead><tr>
          <th></th>
          <th class="ordenavel" data-col="nome">Consultor</th>
          <th>Tipo</th>
          ${col('emitidas', 'Emitidas')}
          ${col('valorTotal', 'Valor emitido')}
          ${col('fechadas', 'Fechadas')}
          ${col('valorFechado', 'Valor fechado')}
          ${col('taxaConversao', 'Conversão')}
          ${col('ticketMedio', 'Ticket médio')}
          ${col('tempoMedioFechamentoDias', 'Dias p/ fechar')}
          ${col('paradas', 'Paradas ⚠')}
        </tr></thead>
        <tbody>
          ${d.filter(c => c.emitidas > 0).map(c => `
          <tr class="clicavel" data-id="${c.id}" title="Ver propostas de ${esc(c.nome)}">
            <td><input type="radio" name="consultor-sel" data-id="${c.id}" ${this.selecionado === c.id ? 'checked' : ''}></td>
            <td>${esc(c.nome)}</td>
            <td style="font-size:11px;color:var(--tinta-2)">${c.tipo === 'FRANQUEADO' ? 'Franqueado' : 'CLT'}</td>
            <td class="num">${c.emitidas}</td>
            <td class="num">${fmtMoeda(c.valorTotal)}</td>
            <td class="num">${c.fechadas}</td>
            <td class="num">${fmtMoeda(c.valorFechado)}</td>
            <td class="num">${fmtPct(c.taxaConversao)}</td>
            <td class="num">${fmtMoeda(c.ticketMedio)}</td>
            <td class="num">${c.tempoMedioFechamentoDias ?? '—'}</td>
            <td class="num">${c.paradas ? `<span class="badge badge-alerta">${c.paradas}</span>` : '0'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>
    `;

    tela.querySelectorAll('th.ordenavel').forEach(th => {
      th.onclick = () => {
        const c = th.dataset.col;
        if (this.ordem.coluna === c) this.ordem.desc = !this.ordem.desc;
        else this.ordem = { coluna: c, desc: true };
        this.render();
      };
    });
    tela.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => {
        Propostas.filtros = { busca: '', filial_id: '', consultor_id: tr.dataset.id, status: '', etapa: '', termometro: '' };
        App.trocarTela('propostas');
      };
    });
    // Rádio de seleção fica dentro da linha clicável; para o o clique não
    // acionar também a navegação para Propostas, ele precisa de stopPropagation.
    tela.querySelectorAll('input[name="consultor-sel"]').forEach(input => {
      input.onclick = e => e.stopPropagation();
      input.onchange = e => {
        this.selecionado = Number(e.target.dataset.id);
        this.render();
      };
    });

    document.getElementById('cons-exportar').onclick = () => {
      window.location.href = `/api/consultores/${this.selecionado}/exportar`;
    };
    document.getElementById('cons-importar').onclick = () => {
      document.getElementById('cons-arquivo').click();
    };
    document.getElementById('cons-arquivo').onchange = async e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      try {
        const base64 = await new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(leitor.result.split(',')[1]);
          leitor.onerror = reject;
          leitor.readAsDataURL(arquivo);
        });
        const resumo = await apiSend('POST', '/api/consultores/importar-atualizacoes', { arquivo: base64 });
        aviso(`Atualizadas: ${resumo.atualizadas} · Contatos adicionados: ${resumo.contatosAdicionados}` +
          (resumo.naoEncontradas ? ` · Não encontradas: ${resumo.naoEncontradas}` : ''));
        App.recarregarTela();
      } catch (err) {
        aviso(err.message, true);
      } finally {
        e.target.value = '';
      }
    };
  },
};
```

- [ ] **Step 2: Rodar a suíte inteira (garantir que nada de back-end quebrou)**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Verificação manual no navegador**

Suba o servidor (`npm start` ou o `.bat`), abra `http://localhost:3050`, vá em
**Consultores**:
1. Clique no rádio de um consultor com propostas ativas — os botões "Gerar planilha do
   consultor" e "Importar atualizações" ficam habilitados, e o nome selecionado aparece
   ao lado.
2. Clique em "Gerar planilha do consultor" — o navegador baixa um `.xlsx`. Abra o
   arquivo e confira as abas PROPOSTAS e INSTRUÇÕES.
3. Edite uma linha (status, termômetro, um contato novo), salve, clique em "Importar
   atualizações" e escolha o arquivo — confira o aviso com o resumo e que a proposta em
   Propostas reflete a mudança.
4. Clique em qualquer outra parte da linha (fora do rádio) — confirme que ainda navega
   para Propostas filtradas por aquele consultor, como antes.

- [ ] **Step 4: Commit**

```bash
git add public/js/consultores.js
git commit -m "feat: seleção de consultor e ações de planilha na tela Consultores"
```

---

### Task 6: Documentar no README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar a seção "Uso no dia a dia"**

Em `README.md`, troque a linha:

```
- **Consultores** — ranking de desempenho; clique no consultor para ver as propostas dele.
```

por:

```
- **Consultores** — ranking de desempenho; clique no consultor para ver as propostas dele.
  Selecione um consultor (rádio na tabela) para **gerar uma planilha** com as propostas
  ativas dele (para enviar por e-mail/WhatsApp) e depois **importar atualizações** quando
  ele devolver a planilha preenchida com status, etapa, termômetro e um contato novo.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: documenta planilha de acompanhamento por consultor"
```
