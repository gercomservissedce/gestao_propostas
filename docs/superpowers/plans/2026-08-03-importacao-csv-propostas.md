# Importação de CSV do ERP — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir importar o CSV de propostas exportado do ERP para inserir as propostas que faltam e corrigir os valores das existentes, sem apagar o acompanhamento feito no app.

**Architecture:** Um parser CSV próprio (`src/csv.js`) alimenta `src/csvPropostas.js`, que separa **planejar** (só lê o banco, gera a prévia) de **aplicar** (grava numa transação). Duas rotas expõem as duas operações; o front mostra a prévia no modal de Configurações e só grava depois do Confirmar.

**Tech Stack:** Node.js, better-sqlite3, Express 5, `node --test` (test runner nativo), front em JS puro sem build.

**Spec:** `docs/superpowers/specs/2026-08-03-importacao-csv-propostas-design.md`

## Global Constraints

- Código e mensagens de erro em **português**, seguindo o estilo do repositório (nomes de função e variáveis em português, comentários explicando o *porquê*).
- Sem novas dependências: só `better-sqlite3`, `express`, `xlsx`, `puppeteer-core` já instalados.
- `npm test` = `node --test` — testes em `tests/*.test.js` com `node:test` + `node:assert`.
- Banco de teste sempre `openDb(':memory:')`.
- Nunca alterar, na importação: `status`, `etapa`, `data_fechamento`, `termometro`, `proxima_data_contato`, `custo_dep01`, `roi_dep01`, `custo_dep02`, `roi_dep02`, `marcada_relatorio`, `valor_minimo_fechamento`, `origem` e contatos de proposta **já existente**.
- Campo vazio no CSV nunca apaga dado do banco (`descricao`, `observacao`, `REPRESENTANTE`, `TIPO NEGOC.`).
- Valores em formato brasileiro (`R$3383,15`); datas do CSV em `aaaa-mm-dd hh:mm:ss`.
- Commits pequenos, um por tarefa, mensagem no padrão do repositório (`feat:`, `test:`, `docs:`) terminando com:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- Arquivo real para conferência final: `C:\Users\rodrigo.carvalho\Downloads\RELAÇÃO DAS PROPOSTAS ATUALIZADA 03082026.csv` (46 linhas, julho/2026).
- Branch de trabalho: `importar-csv-propostas` (já criada, spec já commitado).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/csv.js` (novo) | Parser de CSV genérico: texto → `{ colunas, registros }`. Não sabe nada de propostas. |
| `src/csvPropostas.js` (novo) | Regras da importação: valida cabeçalho, monta o plano, aplica o plano. |
| `src/parse.js` (modificar) | `toNumberBr` (formato brasileiro) e `toIsoDate` aceitando ISO com hora. |
| `src/db.js` (modificar) | Colunas `vlr_desconto` e `vlr_total_com_desconto` no schema e na migração. |
| `src/propostaUpdate.js` (modificar) | As duas colunas novas em `CAMPOS_PROPOSTA`. |
| `src/routes.js` (modificar) | `POST /api/importar-csv/previa` e `POST /api/importar-csv`. |
| `public/js/importacaoCsv.js` (novo) | Escolha do arquivo, prévia no modal e confirmação. |
| `public/index.html` (modificar) | `<script>` do arquivo novo. |
| `public/js/app.js` (modificar) | Botão "Importar CSV do ERP" + input oculto no modal de Configurações. |
| `public/styles.css` (modificar) | Bloco de estilo da prévia. |
| `README.md` (modificar) | Documentar a nova opção. |

---

### Task 1: Parser de CSV

**Files:**
- Create: `src/csv.js`
- Test: `tests/csv.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `parseCsv(texto)` → `{ colunas: string[], registros: object[] }`. Cada registro tem uma chave por coluna (valor `string` já com `trim`) e `_linha` = número da linha física no arquivo (cabeçalho = 1).

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/csv.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCsv } = require('../src/csv');

test('parseCsv usa a primeira linha como cabeçalho', () => {
  const { colunas, registros } = parseCsv('A,B\n1,2\n3,4\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].A, '1');
  assert.equal(registros[0].B, '2');
  assert.equal(registros[1].A, '3');
});

test('parseCsv respeita vírgula dentro de campo entre aspas', () => {
  const { registros } = parseCsv('A,B\n"R$1.234,56","CONDOMINIO A, BLOCO 2"\n');
  assert.equal(registros[0].A, 'R$1.234,56');
  assert.equal(registros[0].B, 'CONDOMINIO A, BLOCO 2');
});

test('parseCsv trata aspas escapadas e quebra de linha dentro do campo', () => {
  const { registros } = parseCsv('A,B\n"diz ""oi""","linha1\nlinha2"\n');
  assert.equal(registros[0].A, 'diz "oi"');
  assert.equal(registros[0].B, 'linha1\nlinha2');
});

test('parseCsv aceita CRLF e BOM', () => {
  const { colunas, registros } = parseCsv('\uFEFFA,B\r\n1,2\r\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.equal(registros[0].A, '1');
  assert.equal(registros[0].B, '2');
});

test('parseCsv ignora linhas vazias', () => {
  const { registros } = parseCsv('A,B\n1,2\n\n\n');
  assert.equal(registros.length, 1);
});

test('parseCsv com só o cabeçalho devolve nenhum registro', () => {
  const { colunas, registros } = parseCsv('A,B\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.deepEqual(registros, []);
});

test('parseCsv devolve o número da linha física em _linha', () => {
  const { registros } = parseCsv('A\n1\n2\n');
  assert.equal(registros[0]._linha, 2);
  assert.equal(registros[1]._linha, 3);
});

test('parseCsv preenche com vazio a coluna faltante no fim da linha', () => {
  const { registros } = parseCsv('A,B,C\n1,2\n');
  assert.equal(registros[0].C, '');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/csv.test.js`
Expected: FAIL — `Cannot find module '../src/csv'`

- [ ] **Step 3: Implementar `src/csv.js`**

```js
// Parser de CSV separado por vírgula, com campos opcionalmente entre aspas
// duplas: dentro das aspas, vírgula e quebra de linha valem como texto e ""
// vale uma aspa literal. Escrito à mão em vez de usar a lib xlsx porque o
// xlsx faz coerção de tipos (transformaria "R$3383,15" e "2026-07-01
// 00:00:00" em algo imprevisível) e não dá controle sobre BOM/encoding.

function parseLinhas(texto) {
  const t = String(texto).replace(/^\uFEFF/, '');
  const linhas = [];
  let campos = [];
  let atual = '';
  let dentroAspas = false;
  let linhaFisica = 1;
  let linhaInicio = 1;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { atual += '"'; i++; } else dentroAspas = false;
      } else {
        if (c === '\n') linhaFisica++;
        atual += c;
      }
      continue;
    }
    if (c === '"') { dentroAspas = true; continue; }
    if (c === ',') { campos.push(atual); atual = ''; continue; }
    if (c === '\r') continue; // CRLF: quem fecha a linha é o \n
    if (c === '\n') {
      campos.push(atual);
      linhas.push({ numero: linhaInicio, campos });
      linhaFisica++;
      linhaInicio = linhaFisica;
      campos = [];
      atual = '';
      continue;
    }
    atual += c;
  }
  campos.push(atual);
  linhas.push({ numero: linhaInicio, campos });

  return linhas.filter(l => l.campos.some(c => c.trim() !== ''));
}

function parseCsv(texto) {
  const linhas = parseLinhas(texto);
  if (!linhas.length) return { colunas: [], registros: [] };
  const colunas = linhas[0].campos.map(c => c.trim());
  const registros = linhas.slice(1).map(l => {
    const reg = { _linha: l.numero };
    colunas.forEach((coluna, i) => { reg[coluna] = (l.campos[i] ?? '').trim(); });
    return reg;
  });
  return { colunas, registros };
}

module.exports = { parseCsv };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tests/csv.test.js`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/csv.js tests/csv.test.js
git commit -m "feat: parser de csv com aspas, crlf e bom"
```

---

### Task 2: Valores em formato brasileiro e data ISO

**Files:**
- Modify: `src/parse.js` (acrescentar `toNumberBr`; ajustar `toIsoDate`)
- Test: `tests/parse.test.js` (acrescentar testes)

**Interfaces:**
- Consumes: nada.
- Produces: `toNumberBr(v)` → `number` (0 para vazio/inválido); `toIsoDate(v)` passa a aceitar `'2026-07-01 00:00:00'` → `'2026-07-01'`, mantendo o comportamento atual para serial do Excel, `Date` e `m/d/aaaa`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `tests/parse.test.js` (e incluir `toNumberBr` no `require` da linha 3):

```js
test('toNumberBr converte formato brasileiro do CSV do ERP', () => {
  assert.equal(toNumberBr('R$3383,15'), 3383.15);
  assert.equal(toNumberBr('R$1.234,56'), 1234.56);
  assert.equal(toNumberBr('R$ 15980,89'), 15980.89);
  assert.equal(toNumberBr('R$0,00'), 0);
  assert.equal(toNumberBr('R$1.000'), 1000);
});

test('toNumberBr aceita número e trata vazio como 0', () => {
  assert.equal(toNumberBr(424.97), 424.97);
  assert.equal(toNumberBr(''), 0);
  assert.equal(toNumberBr(null), 0);
  assert.equal(toNumberBr(undefined), 0);
  assert.equal(toNumberBr('-'), 0);
  assert.equal(toNumberBr('abc'), 0);
});

test('toIsoDate aceita data ISO com hora (formato do CSV do ERP)', () => {
  assert.equal(toIsoDate('2026-07-01 00:00:00'), '2026-07-01');
  assert.equal(toIsoDate('2026-12-31'), '2026-12-31');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/parse.test.js`
Expected: FAIL — `toNumberBr is not a function` e `toIsoDate('2026-07-01 00:00:00')` devolvendo `null`

- [ ] **Step 3: Implementar em `src/parse.js`**

Em `toIsoDate`, inserir o reconhecimento do ISO **antes** do `match` de `m/d/aaaa` (o formato ISO é inequívoco, então não conflita com a planilha legada):

```js
  const s = String(v).trim();
  if (!s) return null;
  // CSV do ERP: "2026-07-01 00:00:00" — prefixo ISO é inequívoco, ao contrário
  // do m/d/aaaa da planilha legada.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
```

Acrescentar a função depois de `toNumber`:

```js
// Valores do CSV do ERP vêm em formato brasileiro: "R$3383,15" (vírgula
// decimal) e, quando há milhar, "R$1.234,56". Diferente de toNumber, que trata
// o formato americano da planilha legada.
function toNumberBr(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$|\s/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.000" = mil
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
```

E incluir `toNumberBr` no `module.exports`.

- [ ] **Step 4: Rodar a suíte inteira (garantir que a planilha legada não quebrou)**

Run: `npm test`
Expected: PASS — inclusive `tests/parse.test.js` e `tests/importer.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/parse.js tests/parse.test.js
git commit -m "feat: toNumberBr e data iso com hora no parse"
```

---

### Task 3: Colunas de desconto no banco

**Files:**
- Modify: `src/db.js` (`SCHEMA_SQL` e `MIGRACOES_PROPOSTAS`)
- Modify: `src/propostaUpdate.js` (`CAMPOS_PROPOSTA`)
- Test: `tests/db.test.js` (acrescentar teste)

**Interfaces:**
- Consumes: nada.
- Produces: colunas `vlr_desconto` e `vlr_total_com_desconto` (`REAL DEFAULT 0`) em `propostas`, atualizáveis por `atualizarProposta()`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `tests/db.test.js`:

```js
test('propostas tem colunas de desconto do CSV do ERP', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  for (const c of ['vlr_desconto', 'vlr_total_com_desconto']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve existir`);
  }
});
```

E, no teste `openDb migra banco antigo sem colunas de custo`, acrescentar as duas colunas à lista verificada e conferir o preenchimento das linhas antigas:

```js
  for (const c of ['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
                   'vlr_desconto', 'vlr_total_com_desconto']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve ser adicionada na migração`);
  }
```

e, junto dos asserts da proposta antiga:

```js
  assert.equal(antiga.vlr_desconto, 0); // DEFAULT 0 preenche as linhas antigas
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/db.test.js`
Expected: FAIL — "coluna vlr_desconto deve existir"

- [ ] **Step 3: Implementar**

Em `src/db.js`, dentro de `SCHEMA_SQL`, logo após a linha `vlr_total REAL DEFAULT 0,`:

```sql
  vlr_desconto REAL DEFAULT 0,
  vlr_total_com_desconto REAL DEFAULT 0,
```

E em `MIGRACOES_PROPOSTAS`:

```js
  origem: 'TEXT',
  vlr_desconto: 'REAL DEFAULT 0',
  vlr_total_com_desconto: 'REAL DEFAULT 0',
```

Em `src/propostaUpdate.js`, acrescentar as duas colunas ao fim de `CAMPOS_PROPOSTA`:

```js
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
  'vlr_desconto', 'vlr_total_com_desconto',
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/propostaUpdate.js tests/db.test.js
git commit -m "feat: colunas de desconto nas propostas"
```

---

### Task 4: Plano da importação (`planejarImportacaoCsv`)

**Files:**
- Create: `src/csvPropostas.js`
- Test: `tests/csvPropostas.test.js`

**Interfaces:**
- Consumes: `parseCsv` (Task 1), `toIsoDate`/`toNumberBr` (Task 2), colunas de desconto (Task 3).
- Produces:
  - `csvParaTexto(buffer)` → `string` (UTF-8 com fallback latin1).
  - `planejarImportacaoCsv(db, texto)` → plano:
    ```js
    {
      novas: [{ linha, numero, filial_codigo, cliente, vlr_total, dados }],
      atualizadas: [{ linha, id, numero, cliente,
                      mudancas: [{ campo, de, para }], dados }],
      semMudanca: 0,
      invalidas: [{ linha, motivo }],
      filiaisNovas: [{ codigo, nome }],
      consultoresNovos: ['NOME'],
    }
    ```
    `dados` é o objeto pronto para gravar: nas novas contém exatamente as chaves de `CAMPOS_INSERT`; nas atualizadas, só as colunas que mudaram. `mudancas` existe para exibição (o campo `consultor` aparece com o **nome**, não o id).
  - `CAMPOS_INSERT` (array de colunas usado no INSERT das novas).
  - Lança `Error` com mensagem em português quando o arquivo está vazio ou falta coluna obrigatória.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/csvPropostas.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { planejarImportacaoCsv, csvParaTexto } = require('../src/csvPropostas');

const CABECALHO = 'CODFIL,SIGFIL,Nº PROP.,DATA,NOME DO CLIENTE,TIPO NEGOC.,STATUS,'
  + 'DT. FECHADA,VLR. COMOD.,VLR. SERV. AD.,VLR. MENSAL,VLR.TX.ADESÃO,VLR. VENDA,'
  + 'VLR. INSTAL.,VLR.SRV.ESP.,VLR. TOTAL,VLR. DESC.,VLR. TOTAL C/DESC.,'
  + 'REPRESENTANTE,DescricaoProposta,Observacao';

// Monta uma linha do CSV do ERP com os campos que o teste quiser mudar.
function linha(campos = {}) {
  const c = {
    CODFIL: '1001', SIGFIL: 'Servis Eletrônica Ceará', numero: '27178',
    DATA: '2026-07-08 00:00:00', cliente: 'CONDOMINIO GREEN VILLAGE',
    tipo: 'PORTARIA INTELIGENTE', status: 'Analise Cliente', fechada: '',
    comodato: '"R$3383,15"', servAd: '"R$35,00"', mensal: '"R$3418,15"', adesao: '',
    venda: '"R$0,00"', instal: '', servEsp: '', total: '"R$3418,15"', desc: '',
    totalDesc: '"R$3418,15"', representante: 'LUIS JOSE SANTIAGO CAMPOS',
    descricao: '', observacao: '', ...campos,
  };
  return [c.CODFIL, `"${c.SIGFIL}"`, c.numero, c.DATA, `"${c.cliente}"`, c.tipo,
    c.status, c.fechada, c.comodato, c.servAd, c.mensal, c.adesao, c.venda,
    c.instal, c.servEsp, c.total, c.desc, c.totalDesc, `"${c.representante}"`,
    `"${c.descricao}"`, `"${c.observacao}"`].join(',');
}

function csv(...linhas) {
  return `\uFEFF${CABECALHO}\r\n${linhas.join('\r\n')}\r\n`;
}

function bancoBase() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('LUIS JOSE SANTIAGO CAMPOS','FRANQUEADO')").run();
  return db;
}

test('planejar marca proposta inexistente como nova, com etapa vinda do STATUS', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.novas.length, 1);
  assert.equal(plano.atualizadas.length, 0);
  const nova = plano.novas[0];
  assert.equal(nova.numero, '27178');
  assert.equal(nova.cliente, 'CONDOMINIO GREEN VILLAGE');
  assert.equal(nova.vlr_total, 3418.15);
  assert.equal(nova.dados.status, 'ATIVA');
  assert.equal(nova.dados.etapa, 'ANALISE CLIENTE');
  assert.equal(nova.dados.data_emissao, '2026-07-08');
  assert.equal(nova.dados.vlr_comodato, 3383.15);
  assert.equal(nova.dados.vlr_total_com_desconto, 3418.15);
  assert.equal(nova.dados.vlr_desconto, 0);
  assert.equal(nova.dados.data_fechamento, null);
});

test('planejar trata DT. FECHADA e status de perda nas novas', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ numero: '1', fechada: '2026-07-20 00:00:00' }),
    linha({ numero: '2', status: 'Perdida' }),
    linha({ numero: '3', status: 'Cancelado' }),
  ));
  const por = n => plano.novas.find(x => x.numero === n).dados;
  assert.equal(por('1').status, 'FECHADA');
  assert.equal(por('1').etapa, 'FECHADO');
  assert.equal(por('1').data_fechamento, '2026-07-20');
  assert.equal(por('2').status, 'PERDIDA');
  assert.equal(por('2').etapa, 'PERDIDO');
  assert.equal(por('3').status, 'PERDIDA');
});

test('planejar lista só os campos divergentes de proposta existente', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PERDIDA','PERDIDO',
    3383.15, 35, 3418.15, 3000, 3000, 1)`).run();

  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.novas.length, 0);
  assert.equal(plano.atualizadas.length, 1);
  const campos = plano.atualizadas[0].mudancas.map(m => m.campo).sort();
  assert.deepEqual(campos, ['vlr_total', 'vlr_total_com_desconto']);
  const total = plano.atualizadas[0].mudancas.find(m => m.campo === 'vlr_total');
  assert.equal(total.de, 3000);
  assert.equal(total.para, 3418.15);
  // status, etapa e demais campos de acompanhamento ficam fora do plano
  assert.equal(plano.atualizadas[0].dados.status, undefined);
  assert.equal(plano.atualizadas[0].dados.etapa, undefined);
});

test('planejar conta como sem mudança quando o CSV está igual ao banco', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, tipo_negocio,
    status, vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PORTARIA INTELIGENTE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1)`).run();

  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.semMudanca, 1);
  assert.equal(plano.atualizadas.length, 0);
  assert.equal(plano.novas.length, 0);
});

test('planejar não apaga descrição, observação nem consultor com campo vazio no CSV', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto,
    consultor_id, descricao, observacao)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1, 'DESCRICAO DO APP', 'ANOTACAO DO APP')`).run();

  const plano = planejarImportacaoCsv(db, csv(linha({ descricao: '', observacao: '', representante: '' })));
  assert.equal(plano.semMudanca, 1);
  assert.equal(plano.atualizadas.length, 0);
});

test('planejar sobrescreve descrição quando o CSV traz texto', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto,
    consultor_id, descricao)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1, 'ANTIGA')`).run();

  const plano = planejarImportacaoCsv(db, csv(linha({ descricao: 'UPGRADE DA PORTARIA' })));
  const mudanca = plano.atualizadas[0].mudancas.find(m => m.campo === 'descricao');
  assert.equal(mudanca.de, 'ANTIGA');
  assert.equal(mudanca.para, 'UPGRADE DA PORTARIA');
});

test('planejar aponta filial e consultor que precisarão ser criados', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ CODFIL: '4001', SIGFIL: 'Servis Eletrônica Bahia', numero: '9', representante: 'NOVO REPRESENTANTE' })
  ));
  assert.deepEqual(plano.filiaisNovas, [{ codigo: '4001', nome: 'Servis Eletrônica Bahia' }]);
  assert.deepEqual(plano.consultoresNovos, ['NOVO REPRESENTANTE']);
  assert.equal(plano.novas.length, 1);
});

test('planejar reporta linha sem cliente, com data inválida e repetida no arquivo', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ numero: '1', cliente: '' }),
    linha({ numero: '2', DATA: '' }),
    linha({ numero: '3' }),
    linha({ numero: '3' }),
  ));
  assert.equal(plano.invalidas.length, 3);
  assert.equal(plano.novas.length, 1);
  assert.match(plano.invalidas[0].motivo, /filial, número.*cliente/i);
  assert.match(plano.invalidas[1].motivo, /[Dd]ata/);
  assert.match(plano.invalidas[2].motivo, /repetida/i);
  assert.equal(plano.invalidas[2].linha, 5);
});

test('planejar recusa arquivo sem as colunas do ERP e arquivo vazio', () => {
  const db = bancoBase();
  assert.throws(() => planejarImportacaoCsv(db, 'A,B\n1,2\n'), /CODFIL/);
  assert.throws(() => planejarImportacaoCsv(db, `${CABECALHO}\n`), /vazio/i);
});

test('csvParaTexto decodifica UTF-8 e cai para latin1 em arquivo ANSI', () => {
  assert.match(csvParaTexto(Buffer.from('CEARÁ', 'utf8')), /CEARÁ/);
  assert.match(csvParaTexto(Buffer.from('CEARÁ', 'latin1')), /CEARÁ/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/csvPropostas.test.js`
Expected: FAIL — `Cannot find module '../src/csvPropostas'`

- [ ] **Step 3: Implementar `src/csvPropostas.js` (parte do plano)**

```js
const { parseCsv } = require('./csv');
const { toIsoDate, toNumberBr } = require('./parse');

const COLUNAS_OBRIGATORIAS = ['CODFIL', 'Nº PROP.', 'DATA', 'NOME DO CLIENTE', 'VLR. TOTAL'];

// coluna do banco -> cabeçalho no CSV do ERP
const VALORES = {
  vlr_comodato: 'VLR. COMOD.',
  vlr_serv_adicional: 'VLR. SERV. AD.',
  vlr_mensal: 'VLR. MENSAL',
  vlr_taxa_adesao: 'VLR.TX.ADESÃO',
  vlr_venda: 'VLR. VENDA',
  vlr_instalacao: 'VLR. INSTAL.',
  vlr_serv_especial: 'VLR.SRV.ESP.',
  vlr_total: 'VLR. TOTAL',
  vlr_desconto: 'VLR. DESC.',
  vlr_total_com_desconto: 'VLR. TOTAL C/DESC.',
};

const CAMPOS_INSERT = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'consultor_id', 'descricao', 'observacao', ...Object.keys(VALORES),
];

// Export do ERP às vezes vem em UTF-8 (com BOM) e às vezes em ANSI
// (Windows-1252). O caractere de substituição delata o segundo caso.
function csvParaTexto(buffer) {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('\uFFFD') ? buffer.toString('latin1') : utf8;
}

// Status/etapa só das propostas NOVAS: nas existentes o acompanhamento do app
// manda, e o ERP costuma continuar dizendo "Analise Cliente".
function situacaoDoCsv(statusCsv, dataFechada) {
  const v = String(statusCsv || '').trim().toUpperCase();
  if (dataFechada) return { status: 'FECHADA', etapa: 'FECHADO', data_fechamento: dataFechada };
  if (v.includes('PERDID') || v.includes('CANCEL')) {
    return { status: 'PERDIDA', etapa: 'PERDIDO', data_fechamento: null };
  }
  return { status: 'ATIVA', etapa: v || null, data_fechamento: null };
}

// Dinheiro em REAL: comparar com 2 casas evita "mudança" só por ruído de float.
function valorDiferente(a, b) {
  return Math.round((Number(a) || 0) * 100) !== Math.round((Number(b) || 0) * 100);
}

function planejarImportacaoCsv(db, texto) {
  const { colunas, registros } = parseCsv(texto);
  const faltando = COLUNAS_OBRIGATORIAS.filter(c => !colunas.includes(c));
  if (faltando.length) {
    throw new Error(
      `Este arquivo não parece ser a relação de propostas do ERP — falta a coluna ${faltando.join(', ')}.`
    );
  }
  if (!registros.length) throw new Error('O arquivo está vazio: só tem o cabeçalho.');

  const buscaFilial = db.prepare('SELECT id FROM filiais WHERE codigo = ?');
  const buscaConsultor = db.prepare('SELECT id FROM consultores WHERE nome = ?');
  const buscaProposta = db.prepare(`
    SELECT p.id, p.cliente, p.data_emissao, p.tipo_negocio, p.consultor_id,
           p.descricao, p.observacao, c.nome consultor, ${Object.keys(VALORES).map(v => `p.${v}`).join(', ')}
    FROM propostas p LEFT JOIN consultores c ON c.id = p.consultor_id
    WHERE p.filial_id = ? AND p.numero = ?
  `);

  const plano = {
    novas: [], atualizadas: [], semMudanca: 0, invalidas: [],
    filiaisNovas: [], consultoresNovos: [],
  };
  const vistos = new Set();

  for (const reg of registros) {
    const linha = reg._linha;
    const codFilial = reg['CODFIL'];
    const numero = reg['Nº PROP.'];
    const cliente = reg['NOME DO CLIENTE'];
    if (!codFilial || !numero || !cliente) {
      plano.invalidas.push({ linha, motivo: 'Falta filial, número da proposta ou cliente' });
      continue;
    }
    const dataEmissao = toIsoDate(reg['DATA']);
    if (!dataEmissao) {
      plano.invalidas.push({ linha, motivo: `Data de emissão inválida: "${reg['DATA']}"` });
      continue;
    }
    const chave = `${codFilial}|${numero}`;
    if (vistos.has(chave)) {
      plano.invalidas.push({
        linha, motivo: `Proposta ${numero} repetida no arquivo (vale a primeira ocorrência)`,
      });
      continue;
    }
    vistos.add(chave);

    const filial = buscaFilial.get(codFilial);
    if (!filial && !plano.filiaisNovas.some(f => f.codigo === codFilial)) {
      plano.filiaisNovas.push({ codigo: codFilial, nome: reg['SIGFIL'] || '' });
    }

    const representante = reg['REPRESENTANTE'] || '';
    const consultor = representante ? buscaConsultor.get(representante) : undefined;
    if (representante && !consultor && !plano.consultoresNovos.includes(representante)) {
      plano.consultoresNovos.push(representante);
    }

    const valores = {};
    for (const [coluna, cabecalho] of Object.entries(VALORES)) {
      valores[coluna] = toNumberBr(reg[cabecalho]);
    }
    const tipoNegocio = reg['TIPO NEGOC.'] || '';
    const descricao = reg['DescricaoProposta'] || '';
    const observacao = reg['Observacao'] || '';

    const atual = filial ? buscaProposta.get(filial.id, numero) : undefined;

    if (!atual) {
      plano.novas.push({
        linha, numero, filial_codigo: codFilial, cliente, vlr_total: valores.vlr_total,
        dados: {
          filial_id: filial ? filial.id : null,
          numero, data_emissao: dataEmissao, cliente,
          tipo_negocio: tipoNegocio || 'PORTARIA INTELIGENTE',
          consultor_id: consultor ? consultor.id : null,
          descricao: descricao || null,
          observacao: observacao || null,
          ...situacaoDoCsv(reg['STATUS'], toIsoDate(reg['DT. FECHADA'])),
          ...valores,
        },
      });
      continue;
    }

    const mudancas = [];
    const dados = {};
    const anotar = (campo, de, para) => { mudancas.push({ campo, de, para }); dados[campo] = para; };

    for (const coluna of Object.keys(VALORES)) {
      if (valorDiferente(atual[coluna], valores[coluna])) {
        anotar(coluna, Number(atual[coluna]) || 0, valores[coluna]);
      }
    }
    if (cliente !== atual.cliente) anotar('cliente', atual.cliente, cliente);
    if (dataEmissao !== atual.data_emissao) anotar('data_emissao', atual.data_emissao, dataEmissao);
    // Campo vazio no CSV = ERP não tem a informação; não apaga o que está no app.
    if (tipoNegocio && tipoNegocio !== atual.tipo_negocio) {
      anotar('tipo_negocio', atual.tipo_negocio, tipoNegocio);
    }
    if (descricao && descricao !== atual.descricao) anotar('descricao', atual.descricao, descricao);
    if (observacao && observacao !== atual.observacao) anotar('observacao', atual.observacao, observacao);
    // consultor: mostra o nome na prévia, grava o id. Se o consultor ainda não
    // existe no banco, quem cria é aplicarImportacaoCsv antes de replanejar.
    if (representante && consultor && consultor.id !== atual.consultor_id) {
      mudancas.push({ campo: 'consultor', de: atual.consultor || '—', para: representante });
      dados.consultor_id = consultor.id;
    }

    if (!mudancas.length) { plano.semMudanca++; continue; }
    plano.atualizadas.push({ linha, id: atual.id, numero, cliente, mudancas, dados });
  }

  return plano;
}

module.exports = {
  csvParaTexto, planejarImportacaoCsv, CAMPOS_INSERT, COLUNAS_OBRIGATORIAS,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tests/csvPropostas.test.js`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/csvPropostas.js tests/csvPropostas.test.js
git commit -m "feat: plano de importacao do csv do erp"
```

---

### Task 5: Aplicação do plano (`aplicarImportacaoCsv`)

**Files:**
- Modify: `src/csvPropostas.js`
- Test: `tests/csvPropostas.test.js` (acrescentar testes)

**Interfaces:**
- Consumes: `planejarImportacaoCsv`, `CAMPOS_INSERT` (Task 4), `atualizarProposta` de `src/propostaUpdate.js`.
- Produces: `aplicarImportacaoCsv(db, texto)` → `{ inseridas, atualizadas, semMudanca, invalidas, filiaisCriadas, consultoresCriados }`. Grava tudo numa transação.

Nota de implementação: a função cria primeiro as filiais e consultores que faltam e **replaneja em seguida**, para que `filial_id` e `consultor_id` já estejam resolvidos na gravação. Planejar duas vezes custa nada (dezenas de linhas) e elimina o caso especial de id inexistente.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `tests/csvPropostas.test.js` (incluir `aplicarImportacaoCsv` no `require` do topo):

```js
test('aplicar insere as novas, criando filial e consultor que faltavam', () => {
  const db = bancoBase();
  const resumo = aplicarImportacaoCsv(db, csv(
    linha(),
    linha({ CODFIL: '4001', SIGFIL: 'Servis Eletrônica Bahia', numero: '9', representante: 'NOVO REPRESENTANTE' }),
  ));
  assert.equal(resumo.inseridas, 2);
  assert.equal(resumo.filiaisCriadas, 1);
  assert.equal(resumo.consultoresCriados, 1);

  const p = db.prepare(`SELECT p.*, f.codigo filial_codigo, c.nome consultor
    FROM propostas p JOIN filiais f ON f.id = p.filial_id
    LEFT JOIN consultores c ON c.id = p.consultor_id WHERE p.numero = '9'`).get();
  assert.equal(p.filial_codigo, '4001');
  assert.equal(p.consultor, 'NOVO REPRESENTANTE');
  assert.equal(p.status, 'ATIVA');
  assert.equal(p.etapa, 'ANALISE CLIENTE');
  assert.equal(p.vlr_total, 3418.15);

  const filial = db.prepare("SELECT * FROM filiais WHERE codigo = '4001'").get();
  assert.equal(filial.estado, 'Servis Eletrônica Bahia');
  assert.equal(filial.tipo, 'FILIAL');
});

test('aplicar corrige o valor e preserva todo o acompanhamento do app', () => {
  const db = bancoBase();
  const id = db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    etapa, termometro, proxima_data_contato, data_fechamento, custo_dep01, roi_dep01,
    marcada_relatorio, observacao, vlr_comodato, vlr_serv_adicional, vlr_mensal,
    vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PERDIDA','PERDIDO','QUENTE',
    '2026-08-10','2026-07-30', 500, 12, 1, 'ANOTACAO DO APP',
    3383.15, 35, 3418.15, 3000, 3000, 1)`).run().lastInsertRowid;
  db.prepare("INSERT INTO contatos (proposta_id, data, anotacao) VALUES (?, '2026-07-20', 'ligou')").run(id);

  const resumo = aplicarImportacaoCsv(db, csv(linha()));
  assert.equal(resumo.inseridas, 0);
  assert.equal(resumo.atualizadas, 1);

  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
  assert.equal(p.vlr_total, 3418.15);            // corrigido pelo ERP
  assert.equal(p.status, 'PERDIDA');             // preservado
  assert.equal(p.etapa, 'PERDIDO');
  assert.equal(p.termometro, 'QUENTE');
  assert.equal(p.proxima_data_contato, '2026-08-10');
  assert.equal(p.data_fechamento, '2026-07-30');
  assert.equal(p.custo_dep01, 500);
  assert.equal(p.roi_dep01, 12);
  assert.equal(p.marcada_relatorio, 1);
  assert.equal(p.observacao, 'ANOTACAO DO APP');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contatos WHERE proposta_id = ?').get(id).n, 1);
});

test('aplicar duas vezes não muda nada na segunda (idempotente)', () => {
  const db = bancoBase();
  const primeira = aplicarImportacaoCsv(db, csv(linha(), linha({ numero: '2' })));
  assert.equal(primeira.inseridas, 2);
  const segunda = aplicarImportacaoCsv(db, csv(linha(), linha({ numero: '2' })));
  assert.equal(segunda.inseridas, 0);
  assert.equal(segunda.atualizadas, 0);
  assert.equal(segunda.semMudanca, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 2);
});

test('aplicar conta as inválidas e não grava nada delas', () => {
  const db = bancoBase();
  const resumo = aplicarImportacaoCsv(db, csv(
    linha({ numero: '1', cliente: '' }),
    linha({ numero: '2' }),
  ));
  assert.equal(resumo.invalidas, 1);
  assert.equal(resumo.inseridas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 1);
});

test('planejar não grava nada (prévia é só leitura)', () => {
  const db = bancoBase();
  planejarImportacaoCsv(db, csv(linha()));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM consultores').get().n, 1);
});

test('aplicar troca o consultor quando o representante do ERP mudou', () => {
  const db = bancoBase();
  const outro = db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('OUTRO CONSULTOR','CLT')")
    .run().lastInsertRowid;
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, ?)`).run(outro);

  aplicarImportacaoCsv(db, csv(linha()));
  const p = db.prepare(`SELECT c.nome consultor FROM propostas p
    JOIN consultores c ON c.id = p.consultor_id WHERE p.numero = '27178'`).get();
  assert.equal(p.consultor, 'LUIS JOSE SANTIAGO CAMPOS');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/csvPropostas.test.js`
Expected: FAIL — `aplicarImportacaoCsv is not a function`

- [ ] **Step 3: Implementar em `src/csvPropostas.js`**

Acrescentar o `require` no topo:

```js
const { atualizarProposta } = require('./propostaUpdate');
```

E a função, antes do `module.exports`:

```js
function aplicarImportacaoCsv(db, texto) {
  const insFilial = db.prepare(
    "INSERT OR IGNORE INTO filiais (codigo, tipo, estado) VALUES (?, 'FILIAL', ?)"
  );
  const insConsultor = db.prepare(
    "INSERT OR IGNORE INTO consultores (nome, tipo) VALUES (?, 'FRANQUEADO')"
  );
  const insProposta = db.prepare(`
    INSERT INTO propostas (${CAMPOS_INSERT.join(', ')})
    VALUES (${CAMPOS_INSERT.map(() => '?').join(', ')})
  `);

  const resumo = {
    inseridas: 0, atualizadas: 0, semMudanca: 0, invalidas: 0,
    filiaisCriadas: 0, consultoresCriados: 0,
  };

  const aplicar = db.transaction(() => {
    const previa = planejarImportacaoCsv(db, texto);
    for (const f of previa.filiaisNovas) resumo.filiaisCriadas += insFilial.run(f.codigo, f.nome).changes;
    for (const nome of previa.consultoresNovos) resumo.consultoresCriados += insConsultor.run(nome).changes;

    // Replaneja com as filiais e consultores já criados: assim filial_id e
    // consultor_id estão resolvidos e a gravação não tem caso especial.
    const plano = planejarImportacaoCsv(db, texto);
    resumo.semMudanca = plano.semMudanca;
    resumo.invalidas = plano.invalidas.length;

    for (const nova of plano.novas) {
      insProposta.run(...CAMPOS_INSERT.map(c => nova.dados[c] ?? null));
      resumo.inseridas++;
    }
    for (const alvo of plano.atualizadas) {
      // atualizarProposta nunca recebe status aqui, então o sincronizarFechamento
      // embutido nele não mexe em etapa nem em data de fechamento.
      const { changes } = atualizarProposta(db, alvo.id, { ...alvo.dados }, null);
      if (changes) resumo.atualizadas++;
    }
  });
  aplicar();

  return resumo;
}
```

E incluir `aplicarImportacaoCsv` no `module.exports`.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/csvPropostas.js tests/csvPropostas.test.js
git commit -m "feat: aplicacao do csv do erp preservando o acompanhamento"
```

---

### Task 6: Rotas de prévia e importação

**Files:**
- Modify: `src/routes.js`
- Test: `tests/routes.test.js` (acrescentar testes)

**Interfaces:**
- Consumes: `csvParaTexto`, `planejarImportacaoCsv`, `aplicarImportacaoCsv` (Tasks 4 e 5).
- Produces: `POST /api/importar-csv/previa` e `POST /api/importar-csv`, corpo `{ arquivo: <base64> }`; erro de arquivo/cabeçalho → HTTP 400 `{ erro }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `tests/routes.test.js`:

```js
const CABECALHO_CSV = 'CODFIL,SIGFIL,Nº PROP.,DATA,NOME DO CLIENTE,TIPO NEGOC.,STATUS,'
  + 'DT. FECHADA,VLR. COMOD.,VLR. SERV. AD.,VLR. MENSAL,VLR.TX.ADESÃO,VLR. VENDA,'
  + 'VLR. INSTAL.,VLR.SRV.ESP.,VLR. TOTAL,VLR. DESC.,VLR. TOTAL C/DESC.,'
  + 'REPRESENTANTE,DescricaoProposta,Observacao';

const LINHA_CSV = '1001,"Servis Eletrônica Ceará",27178,2026-07-08 00:00:00,'
  + '"CONDOMINIO GREEN VILLAGE",PORTARIA INTELIGENTE,Analise Cliente,,"R$3383,15",'
  + '"R$35,00","R$3418,15",,"R$0,00",,,"R$3418,15",,"R$3418,15",'
  + '"LUIS JOSE SANTIAGO CAMPOS",,';

function csvBase64(...linhas) {
  return Buffer.from(`\uFEFF${CABECALHO_CSV}\r\n${linhas.join('\r\n')}\r\n`, 'utf8').toString('base64');
}

test('POST /importar-csv/previa mostra o plano sem gravar; /importar-csv grava', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const previa = await (await fetch(`${base}/api/importar-csv/previa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV) }),
  })).json();
  assert.equal(previa.novas.length, 1);
  assert.equal(previa.novas[0].numero, '27178');
  assert.deepEqual(previa.consultoresNovos, ['LUIS JOSE SANTIAGO CAMPOS']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 0);

  const resumo = await (await fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV) }),
  })).json();
  assert.equal(resumo.inseridas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 1);
});

test('POST /importar-csv recusa arquivo que não é do ERP e corpo sem arquivo', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const enviar = corpo => fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  const errada = await enviar({ arquivo: Buffer.from('A,B\n1,2\n').toString('base64') });
  assert.equal(errada.status, 400);
  assert.match((await errada.json()).erro, /CODFIL/);

  const vazio = await enviar({});
  assert.equal(vazio.status, 400);
  assert.match((await vazio.json()).erro, /arquivo/i);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- tests/routes.test.js`
Expected: FAIL — resposta 404 nas rotas novas

- [ ] **Step 3: Implementar em `src/routes.js`**

No topo, junto dos outros `require`:

```js
const { csvParaTexto, planejarImportacaoCsv, aplicarImportacaoCsv } = require('./csvPropostas');
```

Dentro de `criarRotas`, depois da rota `POST /importar`:

```js
  function textoCsvDoCorpo(body) {
    if (!body || !body.arquivo) throw new Error('Nenhum arquivo enviado');
    return csvParaTexto(Buffer.from(body.arquivo, 'base64'));
  }

  r.post('/importar-csv/previa', (req, res) => {
    try {
      res.json(planejarImportacaoCsv(db, textoCsvDoCorpo(req.body)));
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  });

  r.post('/importar-csv', (req, res) => {
    try {
      res.json(aplicarImportacaoCsv(db, textoCsvDoCorpo(req.body)));
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  });
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes.js tests/routes.test.js
git commit -m "feat: rotas de previa e importacao do csv"
```

---

### Task 7: Tela — botão, prévia e confirmação

**Files:**
- Create: `public/js/importacaoCsv.js`
- Modify: `public/index.html` (linha 59, junto dos outros `<script>`)
- Modify: `public/js/app.js` (`abrirConfig`)
- Modify: `public/styles.css` (bloco novo no fim)

**Interfaces:**
- Consumes: `apiSend`, `aviso` (`public/js/api.js`), `fmtMoeda`, `fmtData`, `esc` (`public/js/format.js`), `App.abrirModal/fecharModal/recarregarTela` (`public/js/app.js`), rotas da Task 6.
- Produces: objeto global `ImportacaoCsv` com `escolher(input)` — recebe o `<input type="file">` já com arquivo escolhido, mostra a prévia no modal e cuida do Confirmar/Cancelar.

- [ ] **Step 1: Criar `public/js/importacaoCsv.js`**

```js
// Importação do CSV do ERP: mostra a prévia do que vai mudar e só grava depois
// do Confirmar. O arquivo é reenviado na confirmação — o servidor não guarda
// estado entre a prévia e a gravação.
const ImportacaoCsv = {
  ROTULOS: {
    cliente: 'Cliente', data_emissao: 'Data de emissão', tipo_negocio: 'Tipo de negócio',
    consultor: 'Representante', descricao: 'Descrição', observacao: 'Observação',
    vlr_comodato: 'Comodato', vlr_serv_adicional: 'Serviço adicional', vlr_mensal: 'Mensal',
    vlr_taxa_adesao: 'Taxa de adesão', vlr_venda: 'Venda', vlr_instalacao: 'Instalação',
    vlr_serv_especial: 'Serviço especial', vlr_total: 'Valor total',
    vlr_desconto: 'Desconto', vlr_total_com_desconto: 'Total c/ desconto',
  },

  fmtCampo(campo, valor) {
    if (campo.startsWith('vlr_')) return fmtMoeda(valor);
    if (campo.startsWith('data_')) return fmtData(valor);
    return valor === null || valor === '' ? '—' : String(valor);
  },

  async lerBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result.split(',')[1]);
      leitor.onerror = reject;
      leitor.readAsDataURL(arquivo);
    });
  },

  async escolher(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const base64 = await this.lerBase64(arquivo);
      const plano = await apiSend('POST', '/api/importar-csv/previa', { arquivo: base64 });
      this.render(arquivo.name, plano, base64);
    } catch (e) {
      aviso(e.message, true);
    } finally {
      input.value = '';
    }
  },

  render(nomeArquivo, plano, base64) {
    const lista = (titulo, itens, html) => !itens.length ? '' : `
      <div class="previa-secao">
        <div class="titulo-secao">${titulo} (${itens.length})</div>
        <div class="previa-lista">${itens.map(html).join('')}</div>
      </div>`;

    document.getElementById('modal-caixa').innerHTML = `
      <div class="modal-titulo">
        <h2>Importar CSV do ERP</h2>
        <button class="btn" id="csv-fechar">✕</button>
      </div>
      <div class="previa-arquivo">${esc(nomeArquivo)}</div>
      <div class="previa-contagens">
        <span><b>${plano.novas.length}</b> novas</span>
        <span><b>${plano.atualizadas.length}</b> a atualizar</span>
        <span><b>${plano.semMudanca}</b> sem mudança</span>
        <span><b>${plano.invalidas.length}</b> com problema</span>
      </div>
      ${lista('Propostas novas', plano.novas, p => `
        <div class="previa-item">
          <span class="previa-num">${esc(p.numero)}</span>
          <span class="previa-cliente">${esc(p.cliente)}</span>
          <span class="num">${fmtMoeda(p.vlr_total)}</span>
        </div>`)}
      ${lista('Propostas a atualizar', plano.atualizadas, p => `
        <div class="previa-item previa-item-col">
          <div>
            <span class="previa-num">${esc(p.numero)}</span>
            <span class="previa-cliente">${esc(p.cliente)}</span>
          </div>
          ${p.mudancas.map(m => `
            <div class="previa-mudanca">
              ${esc(this.ROTULOS[m.campo] || m.campo)}:
              <span class="previa-de">${esc(this.fmtCampo(m.campo, m.de))}</span>
              → <b>${esc(this.fmtCampo(m.campo, m.para))}</b>
            </div>`).join('')}
        </div>`)}
      ${lista('Serão criados', [...plano.filiaisNovas.map(f => `Filial ${f.codigo} — ${f.nome}`),
        ...plano.consultoresNovos.map(c => `Representante ${c}`)],
        t => `<div class="previa-mudanca">${esc(t)}</div>`)}
      ${lista('Linhas com problema (não serão importadas)', plano.invalidas,
        i => `<div class="previa-mudanca">Linha ${i.linha}: ${esc(i.motivo)}</div>`)}
      <div class="acoes-modal">
        <button class="btn btn-primario" id="csv-confirmar"
          ${plano.novas.length || plano.atualizadas.length ? '' : 'disabled'}>Confirmar importação</button>
        <button class="btn" id="csv-cancelar">Cancelar</button>
      </div>
    `;
    App.abrirModal();
    document.getElementById('csv-fechar').onclick = () => App.fecharModal();
    document.getElementById('csv-cancelar').onclick = () => App.fecharModal();
    document.getElementById('csv-confirmar').onclick = async e => {
      e.target.disabled = true;
      try {
        const r = await apiSend('POST', '/api/importar-csv', { arquivo: base64 });
        aviso(`Importação: ${r.inseridas} novas, ${r.atualizadas} atualizadas, `
          + `${r.semMudanca} sem mudança`
          + (r.invalidas ? `, ${r.invalidas} com problema` : '') + '.');
        App.fecharModal();
        App.recarregarTela();
      } catch (err) {
        aviso(err.message, true);
        e.target.disabled = false;
      }
    };
  },
};
```

- [ ] **Step 2: Registrar o script e o botão**

Em `public/index.html`, antes de `<script src="js/app.js"></script>`:

```html
<script src="js/importacaoCsv.js"></script>
```

Em `public/js/app.js`, dentro do `abrirConfig`, no bloco `acoes-modal`, depois do botão `cfg-importar`:

```html
        <button class="btn" id="cfg-csv" title="Importa o CSV exportado do ERP: insere as propostas novas e corrige os valores das existentes">Importar CSV do ERP</button>
        <input type="file" id="cfg-csv-arquivo" accept=".csv" class="oculta">
```

E, junto dos outros handlers do mesmo método:

```js
    document.getElementById('cfg-csv').onclick = () => {
      document.getElementById('cfg-csv-arquivo').click();
    };
    document.getElementById('cfg-csv-arquivo').onchange = e => ImportacaoCsv.escolher(e.target);
```

- [ ] **Step 3: Estilo da prévia**

Acrescentar ao fim de `public/styles.css`:

```css
/* ===== Prévia da importação de CSV ===== */
.previa-arquivo { font-size: 12.5px; color: var(--tinta-2); margin-bottom: 10px; }
.previa-contagens { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; }
.previa-contagens b { font-variant-numeric: tabular-nums; font-size: 15px; }
.previa-secao { margin-top: 16px; }
.previa-lista { max-height: 220px; overflow-y: auto; }
.previa-item {
  display: flex; gap: 10px; align-items: baseline; padding: 6px 0;
  border-bottom: 1px dashed var(--borda); font-size: 12.5px;
}
.previa-item-col { display: block; }
.previa-item .num { margin-left: auto; }
.previa-num { font-family: Consolas, monospace; font-weight: 650; }
.previa-cliente { color: var(--tinta-2); }
.previa-mudanca { font-size: 12.5px; padding: 2px 0; }
.previa-de { color: var(--tinta-2); text-decoration: line-through; }
```

- [ ] **Step 4: Conferir na tela**

Run: `npm start` (a porta é a **3060**) e abrir `http://localhost:3060`.

Fazer, com uma **cópia** do CSV real:
1. ⚙ Configurações → "Importar CSV do ERP" → escolher o arquivo.
2. Conferir na prévia: contagens, lista de novas, mudanças no formato `campo: antes → depois`, avisos.
3. Clicar em **Cancelar** e confirmar na tela Propostas que **nada** foi gravado (o total do mês de julho/2026 continua igual).
4. Reabrir, escolher o arquivo e clicar em **Confirmar importação**; conferir o aviso com o resumo e as propostas novas no grid.
5. Testar o tema escuro (🌙) e conferir a legibilidade da prévia.

Expected: prévia legível nos dois temas, Cancelar não grava, Confirmar grava e o grid recarrega.

- [ ] **Step 5: Commit**

```bash
git add public/js/importacaoCsv.js public/index.html public/js/app.js public/styles.css
git commit -m "feat: tela de importacao do csv com previa"
```

---

### Task 8: Conferência com o arquivo real e documentação

**Files:**
- Modify: `README.md`
- Test: conferência manual com o arquivo real (não entra no repositório)

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada de código.

- [ ] **Step 1: Ensaio contra uma cópia do banco real**

Copiar o banco e rodar a importação na cópia — sem tocar em `dados/propostas.db`:

```bash
SCRATCH="C:/Users/RODRIG~1.CAR/AppData/Local/Temp/claude/C--Users-rodrigo-carvalho-Meu-Drive-Empresas-QuanttIA-Sistemas-Claude-Gest-oPropostas/47eff1d7-267c-4d7d-b67d-c217f052d160/scratchpad"
cp dados/propostas.db "$SCRATCH/ensaio.db"
node -e "
const fs = require('node:fs');
const { openDb } = require('./src/db');
const { csvParaTexto, planejarImportacaoCsv, aplicarImportacaoCsv } = require('./src/csvPropostas');
const db = openDb(process.argv[1]);
const texto = csvParaTexto(fs.readFileSync(process.argv[2]));
const plano = planejarImportacaoCsv(db, texto);
console.log('novas', plano.novas.length, '| atualizar', plano.atualizadas.length,
  '| sem mudança', plano.semMudanca, '| problema', plano.invalidas.length);
console.log('filiais novas', plano.filiaisNovas, '| consultores novos', plano.consultoresNovos);
console.log(plano.invalidas);
console.log(plano.atualizadas.slice(0, 5).map(a => [a.numero, a.mudancas]));
console.log('antes', db.prepare(\"SELECT COUNT(*) n FROM propostas WHERE data_emissao LIKE '2026-07%'\").get());
console.log('aplicar', aplicarImportacaoCsv(db, texto));
console.log('depois', db.prepare(\"SELECT COUNT(*) n FROM propostas WHERE data_emissao LIKE '2026-07%'\").get());
console.log('2a vez', aplicarImportacaoCsv(db, texto));
" "$SCRATCH/ensaio.db" "C:/Users/rodrigo.carvalho/Downloads/RELAÇÃO DAS PROPOSTAS ATUALIZADA 03082026.csv"
```

Expected:
- Nenhuma linha inválida (o arquivo tem 46 linhas completas).
- `filiaisNovas` vazio (1001, 1002, 1003 e 3001 já existem).
- Julho/2026 sai de 5 propostas para 46 no total do mês depois de aplicar (as 5 existentes viram atualizadas ou sem mudança).
- A segunda execução devolve `inseridas: 0` e `atualizadas: 0`.
- As mudanças exibidas são de valor/descrição — **nenhuma** de `status` ou `etapa`.

Se algo divergir, corrigir antes de seguir.

- [ ] **Step 2: Documentar no README**

Em `README.md`, no item **⚙ Configurações** da seção "Uso no dia a dia", trocar o texto atual por:

```markdown
- **⚙ Configurações** — probabilidades do termômetro (quente/morno/frio), prazo do alerta
  de proposta esquecida, reimportação da planilha (adiciona só propostas novas, sem duplicar)
  e **importação do CSV do ERP**.

### Importar o CSV do ERP

Em **⚙ Configurações → Importar CSV do ERP**, escolha o arquivo exportado do ERP
(`RELAÇÃO DAS PROPOSTAS ATUALIZADA <data>.csv`). O sistema mostra uma prévia com o que
vai acontecer — quantas propostas são novas, quais valores serão corrigidos, quais filiais
e representantes serão criados e quais linhas têm problema — e só grava depois do
**Confirmar importação**.

A importação **insere** as propostas que faltam e **corrige** os valores das que já
existem. Ela nunca mexe no acompanhamento feito aqui: status, etapa, termômetro, próximo
contato, histórico de contatos, custos DEP/ROI e a marcação do relatório ficam como estão.
Descrição e observação só são sobrescritas quando o CSV traz texto — campo vazio no ERP
não apaga o que você escreveu.

Pode importar o mesmo arquivo duas vezes sem medo: na segunda vez nada muda.
```

- [ ] **Step 3: Rodar a suíte inteira uma última vez**

Run: `npm test`
Expected: PASS em todos os arquivos de teste

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: readme com a importacao do csv do erp"
```

- [ ] **Step 5: Importação de verdade**

Com o servidor rodando (`npm start`), o usuário faz a importação real pela tela, com o
arquivo `RELAÇÃO DAS PROPOSTAS ATUALIZADA 03082026.csv`, e confere o mês de julho/2026 na
tela Propostas. Antes disso, copiar `dados/propostas.db` para um backup (a pasta já está
no Google Drive, mas uma cópia manual custa nada).

Depois disso, usar a skill `superpowers:finishing-a-development-branch` para decidir o
merge da branch `importar-csv-propostas` em `master`.
