# Campo Origem da proposta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um campo opcional "Origem" (Lead, Prospecção Ativa, Indicação,
Renovação, Evento) às propostas: persistência, filtro na listagem, campo no
formulário e um cartão de conversão por origem na aba Análise.

**Architecture:** Segue exatamente os padrões já existentes no projeto para campos
de lista fechada armazenados como texto livre (`etapa`, `termometro`): migração de
coluna em `src/db.js`, persistência genérica via `CAMPOS_PROPOSTA` em
`src/propostaUpdate.js`, filtro por igualdade exata em `src/routes.js`, e telas em
`public/js/propostas.js`/`public/js/analise.js` seguindo o mesmo HTML/JS já usado
para Etapa/Termômetro/Filial.

**Tech Stack:** Node.js, Express, better-sqlite3, `node:test` para os testes. Sem
dependências novas.

## Global Constraints

- Sem migração de dados existentes além de adicionar a coluna (propostas antigas
  ficam com `origem = NULL`).
- Campo opcional — sem validação obrigatória no servidor nem no formulário.
- Valores aceitos (lista fechada só na UI, sem `CHECK` no SQL): `LEAD`,
  `PROSPECÇÃO ATIVA`, `INDICAÇÃO`, `RENOVAÇÃO`, `EVENTO`.
- Não mexer em `src/importer.js` (planilha legada não tem coluna de origem) nem em
  `src/consultorPlanilha.js` (fora de escopo).

---

### Task 1: Migração, persistência e filtro (backend)

**Files:**
- Modify: `src/db.js` (`MIGRACOES_PROPOSTAS`)
- Modify: `src/propostaUpdate.js` (`CAMPOS_PROPOSTA`)
- Modify: `src/routes.js` (`GET /propostas`)
- Modify: `tests/db.test.js`, `tests/propostaUpdate.test.js`, `tests/routes.test.js`

**Interfaces:**
- Produces: coluna `origem TEXT` na tabela `propostas`; `CAMPOS_PROPOSTA` (já
  exportado por `src/propostaUpdate.js`) passa a incluir `'origem'`, então
  `atualizarProposta` e o `POST /api/propostas` (que já usa `CAMPOS_PROPOSTA`
  genericamente) já gravam o campo sem lógica nova. `GET /api/propostas?origem=`
  filtra por igualdade exata.
- Consumes: nenhuma interface de outra task.

- [ ] **Step 1: Escrever os testes (vão falhar — coluna/filtro ainda não existem)**

Em `tests/db.test.js`, troque o teste `'openDb migra banco antigo sem colunas de custo'`
para também cobrir `origem` — troque as duas ocorrências do array de colunas:

```js
  for (const c of ['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve ser adicionada na migração`);
  }
```

(era `['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02']` — só adicione
`'origem'` no final do array, mantendo o resto do teste igual). Logo abaixo, ao lado
de `assert.equal(antiga.custo_dep01, null);`, adicione:

```js
  assert.equal(antiga.origem, null);
```

Adicione um teste novo, logo após o teste `'propostas tem colunas de custo e roi'`:

```js
test('propostas tem coluna origem', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  assert.ok(colunas.includes('origem'), 'coluna origem deve existir');
});
```

Em `tests/propostaUpdate.test.js`, adicione ao final:

```js
test('atualizarProposta grava origem', () => {
  const { db, id } = dbComProposta();
  const r = atualizarProposta(db, id, { origem: 'LEAD' }, '2026-07-10');
  assert.equal(r.changes, 1);
  const p = db.prepare('SELECT origem FROM propostas WHERE id = ?').get(id);
  assert.equal(p.origem, 'LEAD');
});
```

Em `tests/routes.test.js`, adicione ao final:

```js
test('POST /propostas persiste origem; GET /propostas filtra por origem', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, cliente, origem) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao: '2026-07-10', cliente, origem }),
  });
  await criar('900', 'COND LEAD', 'LEAD');
  await criar('901', 'COND INDICACAO', 'INDICAÇÃO');

  const soLead = await (await fetch(`${base}/api/propostas?origem=LEAD`)).json();
  assert.equal(soLead.length, 1);
  assert.equal(soLead[0].cliente, 'COND LEAD');
  assert.equal(soLead[0].origem, 'LEAD');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — os três testes novos/alterados falham (coluna `origem` não existe;
`atualizarProposta` não grava um campo que não está em `CAMPOS_PROPOSTA`; filtro
`?origem=` não existe, então `soLead.length` não bate).

- [ ] **Step 3: Adicionar a migração em `src/db.js`**

Troque:

```js
const MIGRACOES_PROPOSTAS = {
  custo_dep01: 'REAL',
  roi_dep01: 'REAL',
  custo_dep02: 'REAL',
  roi_dep02: 'REAL',
};
```

por:

```js
const MIGRACOES_PROPOSTAS = {
  custo_dep01: 'REAL',
  roi_dep01: 'REAL',
  custo_dep02: 'REAL',
  roi_dep02: 'REAL',
  origem: 'TEXT',
};
```

- [ ] **Step 4: Adicionar `'origem'` a `CAMPOS_PROPOSTA` em `src/propostaUpdate.js`**

Troque:

```js
const CAMPOS_PROPOSTA = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'vlr_comodato', 'vlr_serv_adicional', 'vlr_mensal', 'vlr_taxa_adesao',
  'vlr_venda', 'vlr_instalacao', 'vlr_serv_especial', 'vlr_total', 'consultor_id',
  'descricao', 'observacao', 'termometro', 'proxima_data_contato',
  'marcada_relatorio', 'valor_minimo_fechamento',
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02',
];
```

por:

```js
const CAMPOS_PROPOSTA = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'vlr_comodato', 'vlr_serv_adicional', 'vlr_mensal', 'vlr_taxa_adesao',
  'vlr_venda', 'vlr_instalacao', 'vlr_serv_especial', 'vlr_total', 'consultor_id',
  'descricao', 'observacao', 'termometro', 'proxima_data_contato',
  'marcada_relatorio', 'valor_minimo_fechamento',
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
];
```

- [ ] **Step 5: Adicionar o filtro em `src/routes.js`**

Na rota `GET /propostas`, troque:

```js
    if (q.etapa) { cond.push('p.etapa = ?'); params.push(q.etapa); }
    if (q.termometro === 'NULA') cond.push('p.termometro IS NULL');
```

por:

```js
    if (q.etapa) { cond.push('p.etapa = ?'); params.push(q.etapa); }
    if (q.origem) { cond.push('p.origem = ?'); params.push(q.origem); }
    if (q.termometro === 'NULA') cond.push('p.termometro IS NULL');
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — toda a suíte, incluindo os testes novos/alterados.

- [ ] **Step 7: Commit**

```bash
git add src/db.js src/propostaUpdate.js src/routes.js tests/db.test.js tests/propostaUpdate.test.js tests/routes.test.js
git commit -m "feat: campo origem da proposta (migracao, persistencia e filtro)"
```

---

### Task 2: Tela Propostas — formulário, listagem e filtro

**Files:**
- Modify: `public/js/propostas.js`

**Interfaces:**
- Consumes: `GET /api/propostas?origem=` e a persistência de `origem` via
  `POST`/`PUT /api/propostas` (Task 1).
- Produces: nenhuma interface consumida por outro arquivo desta feature — é uma
  tela final.

Sem teste automatizado (não há harness de DOM no projeto); a verificação é manual
no navegador, no Step 5.

- [ ] **Step 1: Adicionar a constante `ORIGENS` e o campo no estado de filtros**

Logo abaixo da linha `const ETAPAS = [...]` no topo do arquivo, adicione:

```js
const ORIGENS = ['LEAD', 'PROSPECÇÃO ATIVA', 'INDICAÇÃO', 'RENOVAÇÃO', 'EVENTO'];
```

Troque a linha (dentro do objeto `Propostas`):

```js
  filtros: { busca: '', cliente: '', filial_id: '', consultor_id: '', status: 'ATIVA', etapa: '', termometro: '' },
```

por:

```js
  filtros: { busca: '', cliente: '', filial_id: '', consultor_id: '', status: 'ATIVA', etapa: '', termometro: '', origem: '' },
```

- [ ] **Step 2: Adicionar o filtro "Origem" na linha de filtros**

Troque:

```js
        <div class="campo"><label>Termômetro</label><select id="pr-term">
          <option value="">Todos</option>
          <option value="QUENTE" ${this.filtros.termometro === 'QUENTE' ? 'selected' : ''}>Quente</option>
          <option value="MORNO" ${this.filtros.termometro === 'MORNO' ? 'selected' : ''}>Morno</option>
          <option value="FRIO" ${this.filtros.termometro === 'FRIO' ? 'selected' : ''}>Frio</option>
          <option value="NULA" ${this.filtros.termometro === 'NULA' ? 'selected' : ''}>Não classificada</option>
        </select></div>
        <button class="btn btn-primario" id="pr-nova">+ Nova proposta</button>
```

por:

```js
        <div class="campo"><label>Termômetro</label><select id="pr-term">
          <option value="">Todos</option>
          <option value="QUENTE" ${this.filtros.termometro === 'QUENTE' ? 'selected' : ''}>Quente</option>
          <option value="MORNO" ${this.filtros.termometro === 'MORNO' ? 'selected' : ''}>Morno</option>
          <option value="FRIO" ${this.filtros.termometro === 'FRIO' ? 'selected' : ''}>Frio</option>
          <option value="NULA" ${this.filtros.termometro === 'NULA' ? 'selected' : ''}>Não classificada</option>
        </select></div>
        <div class="campo"><label>Origem</label><select id="pr-origem">
          <option value="">Todas</option>
          ${ORIGENS.map(o => `<option ${o === this.filtros.origem ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>
        <button class="btn btn-primario" id="pr-nova">+ Nova proposta</button>
```

Logo abaixo, troque:

```js
    liga('pr-term', 'termometro');
    document.getElementById('pr-nova').onclick = () => this.abrirForm(null);
```

por:

```js
    liga('pr-term', 'termometro');
    liga('pr-origem', 'origem');
    document.getElementById('pr-nova').onclick = () => this.abrirForm(null);
```

- [ ] **Step 3: Adicionar a coluna "Origem" na tabela de listagem**

Troque:

```js
      <thead><tr>
        <th>Nº</th><th>Data</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
        <th style="text-align:right">Valor total</th><th>Termômetro</th><th>Etapa</th><th>Últ. contato</th><th>Status</th>
      </tr></thead>
```

por:

```js
      <thead><tr>
        <th>Nº</th><th>Data</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
        <th style="text-align:right">Valor total</th><th>Termômetro</th><th>Etapa</th><th>Origem</th><th>Últ. contato</th><th>Status</th>
      </tr></thead>
```

E troque:

```js
          <td style="font-size:11.5px">${esc((p.etapa || '—').toLowerCase())}</td>
          <td class="num">${p.status === 'ATIVA' && p.dias_sem_contato > this.diasAlerta
```

por:

```js
          <td style="font-size:11.5px">${esc((p.etapa || '—').toLowerCase())}</td>
          <td style="font-size:11.5px">${esc(p.origem || '—')}</td>
          <td class="num">${p.status === 'ATIVA' && p.dias_sem_contato > this.diasAlerta
```

- [ ] **Step 4: Adicionar o campo "Origem" no formulário de criar/editar**

Troque:

```js
        <div class="campo"><label>Termômetro</label><select id="f-termometro">
          <option value="">Não classificada</option>
          ${['QUENTE', 'MORNO', 'FRIO'].map(t => `<option ${t === p.termometro ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Status</label><select id="f-status">
```

por:

```js
        <div class="campo"><label>Termômetro</label><select id="f-termometro">
          <option value="">Não classificada</option>
          ${['QUENTE', 'MORNO', 'FRIO'].map(t => `<option ${t === p.termometro ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Origem</label><select id="f-origem">
          <option value="">—</option>
          ${ORIGENS.map(o => `<option ${o === p.origem ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Status</label><select id="f-status">
```

Na função `coletar()`, troque:

```js
      tipo_negocio: document.getElementById('f-tipo_negocio').value.trim(),
      etapa: document.getElementById('f-etapa').value || '',
```

por:

```js
      tipo_negocio: document.getElementById('f-tipo_negocio').value.trim(),
      etapa: document.getElementById('f-etapa').value || '',
      origem: document.getElementById('f-origem').value || '',
```

- [ ] **Step 5: Verificação manual no navegador**

Suba o servidor (`npm start`), abra `http://localhost:3050`, vá em **Propostas**:
1. Abra "+ Nova proposta" — confirme que aparece o campo Origem (com as 5 opções +
   "—"), crie uma proposta escolhendo uma origem e salve.
2. Reabra a proposta criada — confirme que a origem escolhida aparece selecionada
   no formulário, e que a coluna Origem na listagem mostra o valor certo.
3. Use o filtro Origem na linha de filtros e confirme que a listagem filtra
   corretamente.
4. Crie/edite uma proposta sem escolher origem — confirme que salva normalmente
   (campo opcional) e a listagem mostra "—".

- [ ] **Step 6: Commit**

```bash
git add public/js/propostas.js
git commit -m "feat: campo origem no formulario, listagem e filtro de propostas"
```

---

### Task 3: Tela Análise — conversão por origem

**Files:**
- Modify: `public/js/analise.js`

**Interfaces:**
- Consumes: campo `origem` já presente em cada proposta retornada por
  `GET /api/propostas` (Task 1) — nenhuma chamada de API nova, a tela já busca
  `/api/propostas` inteiro e agrupa no cliente, igual ao agrupamento por filial
  existente.

Sem teste automatizado; verificação manual no Step 2.

- [ ] **Step 1: Adicionar o agrupamento por origem e o cartão na tela**

Logo após o bloco `// ----- agrupamento por filial -----` (que termina em
`.sort((a, b) => b.total - a.total);` atribuído a `filiais`), adicione:

```js
    // ----- agrupamento por origem -----
    const porOrigem = {};
    for (const p of props) {
      const g = porOrigem[p.origem || 'Sem origem'] ??= { nome: p.origem || 'Sem origem', total: 0, fechadas: 0, valorFechado: 0 };
      g.total++;
      if (p.status === 'FECHADA') { g.fechadas++; g.valorFechado += p.vlr_total || 0; }
    }
    const origens = Object.values(porOrigem).map(o => ({ ...o, conversao: o.total ? 100 * o.fechadas / o.total : 0 }))
      .sort((a, b) => b.total - a.total);
```

Na função de render, troque o final do template (o fechamento do `grade-2` seguido
do fechamento da template string):

```js
        </div>
      </div>
    `;
```

(esse é o fechamento do `<div class="grade-2">` — a última ocorrência no arquivo,
logo antes do `tela.querySelectorAll('[data-consultor]')`) por:

```js
        </div>
      </div>

      <div class="cartao" style="margin-top:14px">
        <div class="titulo-secao">Conversão por origem</div>
        <table class="tabela">
          <thead><tr><th>Origem</th><th class="num">Emitidas</th><th class="num">Fechadas</th><th class="num">Conversão</th><th class="num">Valor fechado</th></tr></thead>
          <tbody>${origens.map(o => `
            <tr>
              <td>${esc(o.nome)}</td>
              <td class="num">${o.total}</td>
              <td class="num">${o.fechadas}</td>
              <td class="num"><b>${fmtPct(o.conversao)}</b></td>
              <td class="num">${fmtMoeda(o.valorFechado)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
```

- [ ] **Step 2: Verificação manual no navegador**

Rodar `npm test` primeiro (garantir que nenhum teste de backend quebrou — não deve
haver nenhuma mudança de backend nesta task). Depois, com o servidor no ar, abra a
aba **Análise** e confirme que o cartão "Conversão por origem" aparece abaixo do
grid de duas colunas, com uma linha "Sem origem" agrupando as propostas sem
origem definida, e uma linha por origem usada, com números de emitidas/fechadas/
conversão/valor batendo com o que se vê na tela Propostas ao filtrar por cada
origem.

- [ ] **Step 3: Commit**

```bash
git add public/js/analise.js
git commit -m "feat: cartao de conversao por origem na tela Analise"
```
