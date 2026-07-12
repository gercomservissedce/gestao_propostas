# Filtros de Data e Termômetro na Tela Consultores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar filtros de período de emissão (de/até) e termômetro à tela Consultores, aplicados no servidor, recalculando KPIs de resumo e cards juntos.

**Architecture:** O frontend envia `de`, `ate` e `termometro` como query string ao endpoint existente `GET /api/consultores/stats`. O backend já filtra por datas via `filtroSql` (`src/stats.js`); este plano adiciona o termômetro ao `filtroSql` e ao `filtrosDaQuery` (`src/routes.js`). No frontend, `consultores.js` ganha estado de filtros, inputs de data, select de termômetro e botão Limpar; os KPIs já são calculados sobre `this.dados`, que passam a chegar filtrados — nenhuma lógica nova de agregação.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), vanilla JS (frontend), `node --test` (testes).

## Global Constraints

- Convenção do termômetro idêntica à rota de propostas (`src/routes.js:44-45`): `'NULA'` → `p.termometro IS NULL`; valor (`QUENTE`/`MORNO`/`FRIO`) → `p.termometro = ?`; vazio/ausente → sem condição.
- Filtros de data e termômetro afetam KPIs de resumo E cards (dados filtrados no servidor). O filtro de **tipo** permanece client-side e afeta apenas grade/contador.
- Botão **Limpar** zera todos os filtros: data, termômetro e tipo.
- Regra `emitidas > 0` para exibir consultor mantida (no frontend).
- Textos da UI em português; ids/classes em português seguindo o padrão do app (`cons-*`).
- TDD no backend: teste de `consultorStats` filtrado escrito antes da implementação.
- `npm test` completo deve passar ao final de cada task.
- Servidor de teste em `http://localhost:3051` (porta 3050 ocupada pelo Firebird); estáticos servidos do disco, basta recarregar o navegador.

---

### Task 1: Backend — termômetro no `filtroSql` (TDD)

**Files:**
- Modify: `src/stats.js:13-21` (função `filtroSql`)
- Modify: `src/routes.js:19-26` (função `filtrosDaQuery`)
- Test: `tests/stats.test.js`

**Interfaces:**
- Consumes: `consultorStats(db, filtros)` e `filtroSql(filtros)` existentes em `src/stats.js`; seed `seedDb()` existente em `tests/stats.test.js` (propostas: 1=QUENTE ativa 1000 ANA há 10 dias; 2=MORNO ativa 2000 ANA há 50 dias; 3=FRIO ativa 3000 BETO há 50 dias; 4=null ativa 4000 BETO há 5 dias; 5=null FECHADA 5000 ANA há 20 dias; 6=null PERDIDA 6000 BETO há 90 dias).
- Produces: `GET /api/consultores/stats?termometro=QUENTE|MORNO|FRIO|NULA&de=YYYY-MM-DD&ate=YYYY-MM-DD` — mesma resposta de hoje, agregada só sobre as propostas do recorte. Task 2 consome esta query string.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/stats.test.js`:

```js
test('consultorStats aplica filtro de termômetro e datas', () => {
  const db = seedDb();

  // QUENTE: só a proposta 1 (ANA, ATIVA, 1000)
  const quentes = consultorStats(db, { termometro: 'QUENTE' });
  const anaQ = quentes.find(c => c.nome === 'ANA');
  assert.equal(anaQ.emitidas, 1);
  assert.equal(anaQ.valorTotal, 1000);
  assert.equal(anaQ.fechadas, 0);
  const betoQ = quentes.find(c => c.nome === 'BETO');
  assert.equal(betoQ.emitidas, 0); // BETO segue na lista (ativo=1), sem propostas no recorte

  // NULA: propostas 4 (BETO 4000), 5 (ANA FECHADA 5000) e 6 (BETO PERDIDA 6000)
  const nulas = consultorStats(db, { termometro: 'NULA' });
  const anaN = nulas.find(c => c.nome === 'ANA');
  assert.equal(anaN.emitidas, 1);
  assert.equal(anaN.valorFechado, 5000);
  const betoN = nulas.find(c => c.nome === 'BETO');
  assert.equal(betoN.emitidas, 2);

  // Período: últimos 15 dias → proposta 1 (ANA) e proposta 4 (BETO)
  const recentes = consultorStats(db, { de: hoje(15) });
  assert.equal(recentes.find(c => c.nome === 'ANA').emitidas, 1);
  assert.equal(recentes.find(c => c.nome === 'BETO').emitidas, 1);

  // Combinado: termômetro + período sem interseção → ninguém tem emitidas
  const vazio = consultorStats(db, { termometro: 'MORNO', de: hoje(15) });
  assert.ok(vazio.every(c => c.emitidas === 0));
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/stats.test.js`
Expected: FAIL — o caso novo quebra em `assert.equal(anaQ.emitidas, 1)` (sem o filtro, ANA tem 3 emitidas), enquanto os testes antigos passam.

- [ ] **Step 3: Implementar o filtro no backend**

Em `src/stats.js`, a função `filtroSql` fica:

```js
// Monta WHERE dinâmico sobre a tabela propostas (alias p)
function filtroSql(filtros = {}) {
  const cond = [];
  const params = [];
  if (filtros.filial_id) { cond.push('p.filial_id = ?'); params.push(filtros.filial_id); }
  if (filtros.consultor_id) { cond.push('p.consultor_id = ?'); params.push(filtros.consultor_id); }
  if (filtros.de) { cond.push('p.data_emissao >= ?'); params.push(filtros.de); }
  if (filtros.ate) { cond.push('p.data_emissao <= ?'); params.push(filtros.ate); }
  if (filtros.termometro === 'NULA') cond.push('p.termometro IS NULL');
  else if (filtros.termometro) { cond.push('p.termometro = ?'); params.push(filtros.termometro); }
  return { where: cond.length ? 'AND ' + cond.join(' AND ') : '', params };
}
```

Em `src/routes.js`, a função `filtrosDaQuery` fica:

```js
function filtrosDaQuery(q) {
  return {
    filial_id: q.filial_id ? Number(q.filial_id) : null,
    consultor_id: q.consultor_id ? Number(q.consultor_id) : null,
    de: q.de || null,
    ate: q.ate || null,
    termometro: q.termometro || null,
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/stats.test.js`
Expected: PASS em todos os casos do arquivo.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam (34 no total, 0 falhas).

- [ ] **Step 6: Commit**

```bash
git add src/stats.js src/routes.js tests/stats.test.js
git commit -m "feat: filtro de termometro no consultorStats e filtrosDaQuery"
```

---

### Task 2: Frontend — filtros na tela Consultores

**Files:**
- Modify: `public/js/consultores.js`

**Interfaces:**
- Consumes: `GET /api/consultores/stats?de=YYYY-MM-DD&ate=YYYY-MM-DD&termometro=QUENTE|MORNO|FRIO|NULA` (Task 1); helpers globais `apiGet`, `aviso` (`public/js/api.js`).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar estado e query string**

Em `public/js/consultores.js`, o topo do objeto e o `carregar()` ficam:

```js
const Consultores = {
  ordem: 'valorFechado',
  filtroTipo: '',
  filtros: { de: '', ate: '', termometro: '' },
  dados: [],

  async carregar() {
    const query = new URLSearchParams(
      Object.entries(this.filtros).filter(([, v]) => v)).toString();
    this.dados = await apiGet('/api/consultores/stats' + (query ? '?' + query : ''));
    this.render();
  },
```

(O restante — `iniciais`, `avatarCor` — não muda.)

- [ ] **Step 2: Nova linha de filtros no template**

Dentro de `render()`, substituir o bloco `<div class="linha-filtros">` que hoje contém só Tipo/Ordenar/contador (após o `</div>` dos KPIs) por:

```js
      <div class="linha-filtros">
        <div class="campo"><label>Emitidas de</label><input type="date" id="cons-de" value="${this.filtros.de}"></div>
        <div class="campo"><label>até</label><input type="date" id="cons-ate" value="${this.filtros.ate}"></div>
        <div class="campo"><label>Termômetro</label>
          <select id="cons-termometro">
            <option value="">Todos</option>
            <option value="QUENTE" ${this.filtros.termometro === 'QUENTE' ? 'selected' : ''}>Quente</option>
            <option value="MORNO" ${this.filtros.termometro === 'MORNO' ? 'selected' : ''}>Morno</option>
            <option value="FRIO" ${this.filtros.termometro === 'FRIO' ? 'selected' : ''}>Frio</option>
            <option value="NULA" ${this.filtros.termometro === 'NULA' ? 'selected' : ''}>Não classificada</option>
          </select>
        </div>
        <div class="campo"><label>Tipo</label>
          <select id="cons-tipo">
            <option value="">Todos</option>
            <option value="FRANQUEADO" ${this.filtroTipo === 'FRANQUEADO' ? 'selected' : ''}>Franqueados</option>
            <option value="CONSULTOR CLT" ${this.filtroTipo === 'CONSULTOR CLT' ? 'selected' : ''}>CLT</option>
          </select>
        </div>
        <div class="campo"><label>Ordenar por</label>
          <select id="cons-ordem">
            ${opcoesOrdem.map(([v, r]) => `<option value="${v}" ${this.ordem === v ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <button class="btn" id="cons-limpar">Limpar</button>
        <span class="cons-contador">${d.length} ${d.length === 1 ? 'consultor' : 'consultores'}</span>
      </div>
```

Os KPIs, a grade de cards, o estado vazio e o restante do template não mudam.

- [ ] **Step 3: Handlers dos filtros novos**

Adicionar um helper ao objeto (após `carregar()`):

```js
  aplicarFiltro(campo, valor) {
    this.filtros[campo] = valor;
    this.carregar().catch(e => aviso(e.message, true));
  },
```

E, junto aos handlers existentes de `cons-tipo`/`cons-ordem` no final de `render()`:

```js
    document.getElementById('cons-de').onchange = e => this.aplicarFiltro('de', e.target.value);
    document.getElementById('cons-ate').onchange = e => this.aplicarFiltro('ate', e.target.value);
    document.getElementById('cons-termometro').onchange = e => this.aplicarFiltro('termometro', e.target.value);
    document.getElementById('cons-limpar').onclick = () => {
      this.filtros = { de: '', ate: '', termometro: '' };
      this.filtroTipo = '';
      this.carregar().catch(e => aviso(e.message, true));
    };
```

Os handlers de `cons-tipo` e `cons-ordem` continuam como estão (re-render local, sem nova busca).

- [ ] **Step 4: Verificar a API filtrada (sanidade via curl)**

Run: `curl -s "http://localhost:3051/api/consultores/stats?termometro=QUENTE" | head -c 300`
Expected: JSON de consultores em que a soma de `emitidas` é menor que sem o filtro (apenas propostas quentes).

- [ ] **Step 5: Verificar no navegador**

Recarregar http://localhost:3051 → Consultores:
- Linha de filtros com: Emitidas de / até / Termômetro / Tipo / Ordenar por / Limpar / contador.
- Escolher um período: KPIs de resumo E cards mudam juntos.
- Termômetro "Quente": números diminuem em KPIs e cards; "Não classificada" também funciona.
- Tipo: continua filtrando só a grade (KPIs não mudam).
- Limpar: restaura tudo (datas vazias, termômetro Todos, tipo Todos).

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 7: Commit**

```bash
git add public/js/consultores.js
git commit -m "feat: filtros de data e termometro na tela consultores"
```
