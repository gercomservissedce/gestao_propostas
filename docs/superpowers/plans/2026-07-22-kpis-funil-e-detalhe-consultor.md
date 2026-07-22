# KPIs de Funil no Dashboard e Detalhe por Consultor na Análise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar, no Dashboard, os 4 totais do funil geral (geradas, em andamento, fechadas, perdidas) e, na Análise, os números de cada status e a conversão ao lado da barra por consultor que já existe.

**Architecture:** `dashboardStats` (`src/stats.js`) ganha três campos novos (`geradas`, `fechadasTotal`, `perdidas`), reaproveitando o `filtroSql` que a função já usa — o Dashboard só precisa renderizar uma linha nova de KPIs com esses campos. Na Análise, tudo já é calculado no frontend a partir de `/api/propostas` (sem mudança de backend); o agrupamento por consultor que já existe ganha um campo `conversao` e o template ganha dois elementos novos por linha.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), vanilla JS (frontend), `node --test` (testes).

## Global Constraints

- Nenhuma mudança de schema de banco.
- Fórmula de conversão em toda a app: `100 * fechadas / total` (mesma usada em filial/origem/consultorStats) — não exclui perdidas do denominador.
- Textos da UI em português; classes CSS em português seguindo o padrão do app.
- TDD no backend (Task 1): teste escrito e visto falhar antes da implementação.
- `npm test` completo deve passar ao final de cada task.
- Servidor de teste em `http://localhost:3051` (porta 3050 ocupada por outro processo nesta máquina); estáticos servidos do disco, basta recarregar o navegador.

---

### Task 1: Backend — `geradas`, `fechadasTotal` e `perdidas` em `dashboardStats` (TDD)

**Files:**
- Modify: `src/stats.js:25-100` (função `dashboardStats`)
- Test: `tests/stats.test.js`

**Interfaces:**
- Consumes: `filtroSql(filtros)` já existente em `src/stats.js` (retorna `{ where, params }`); `seedDb()` já existente em `tests/stats.test.js` — 6 propostas: 1 (ANA, ATIVA, 1000, QUENTE), 2 (ANA, ATIVA, 2000, MORNO), 3 (BETO, ATIVA, 3000, FRIO), 4 (BETO, ATIVA, 4000, sem termômetro), 5 (ANA, FECHADA, 5000), 6 (BETO, PERDIDA, 6000).
- Produces: `dashboardStats(db, filtros)` passa a retornar também `geradas: { qtde, valor }` (todas as propostas do filtro, qualquer status), `fechadasTotal: { qtde, valor }` (status `FECHADA` no filtro) e `perdidas: { qtde, valor }` (status `PERDIDA` no filtro). Task 2 consome esses três campos.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/stats.test.js`:

```js
test('dashboardStats calcula geradas, fechadasTotal e perdidas', () => {
  const db = seedDb();
  const s = dashboardStats(db, {});
  assert.equal(s.geradas.qtde, 6);
  assert.equal(s.geradas.valor, 21000);
  assert.equal(s.fechadasTotal.qtde, 1);
  assert.equal(s.fechadasTotal.valor, 5000);
  assert.equal(s.perdidas.qtde, 1);
  assert.equal(s.perdidas.valor, 6000);
});

test('dashboardStats aplica filtro de consultor a geradas/fechadasTotal/perdidas', () => {
  const db = seedDb();
  const s = dashboardStats(db, { consultor_id: 1 }); // ANA: propostas 1, 2, 5
  assert.equal(s.geradas.qtde, 3);
  assert.equal(s.geradas.valor, 8000);
  assert.equal(s.fechadasTotal.qtde, 1);
  assert.equal(s.fechadasTotal.valor, 5000);
  assert.equal(s.perdidas.qtde, 0);
  assert.equal(s.perdidas.valor, 0);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/stats.test.js`
Expected: FAIL nos dois casos novos com `TypeError: Cannot read properties of undefined (reading 'qtde')` (campos ainda não existem), os demais casos do arquivo continuam passando.

- [ ] **Step 3: Implementar os três campos no backend**

Em `src/stats.js`, dentro de `dashboardStats`, adicionar as três queries logo após o bloco de `conv` (antes de `const funil = ...`):

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

E no `return`, adicionar os três campos (mantendo os existentes):

```js
  return {
    totalAtivas: { qtde: totalAtivas.qtde, valor: totalAtivas.valor },
    previsaoPonderada: prev.v,
    fechadasMes: { qtde: fechadasMes.qtde, valor: fechadasMes.valor },
    taxaConversao: conv.total ? (100 * (conv.fechadas || 0)) / conv.total : 0,
    geradas: { qtde: geradas.qtde, valor: geradas.valor },
    fechadasTotal: { qtde: fechadasTotal.qtde, valor: fechadasTotal.valor },
    perdidas: { qtde: perdidas.qtde, valor: perdidas.valor },
    funil,
    termometro,
    esquecidas,
    naoClassificadas,
    config: cfg,
  };
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/stats.test.js`
Expected: PASS em todos os casos do arquivo.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add src/stats.js tests/stats.test.js
git commit -m "feat: geradas, fechadasTotal e perdidas no dashboardStats"
```

---

### Task 2: Frontend — nova linha de KPIs no Dashboard

**Files:**
- Modify: `public/js/dashboard.js:39-60` (template de `carregar()`)

**Interfaces:**
- Consumes: `GET /api/dashboard` retornando também `geradas`, `fechadasTotal`, `perdidas` (Task 1); helper `fmtMoeda` (`public/js/format.js`); classes CSS já existentes `.kpis` e `.cartao.kpi` (`public/styles.css`) — nenhuma classe nova necessária.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar a linha de KPIs no template**

Em `public/js/dashboard.js`, dentro do template de `carregar()`, imediatamente **depois** do `</div>` que fecha o bloco `<div class="kpis">` existente (linha 60) e **antes** de `<div class="cartao regua-wrap">` (linha 62), inserir:

```html
      <div class="kpis">
        <div class="cartao kpi">
          <div class="rotulo">Geradas</div>
          <div class="valor">${fmtMoeda(d.geradas.valor)}</div>
          <div class="detalhe">${d.geradas.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Em andamento</div>
          <div class="valor">${fmtMoeda(d.totalAtivas.valor)}</div>
          <div class="detalhe">${d.totalAtivas.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Fechadas</div>
          <div class="valor">${fmtMoeda(d.fechadasTotal.valor)}</div>
          <div class="detalhe">${d.fechadasTotal.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Perdidas</div>
          <div class="valor">${fmtMoeda(d.perdidas.valor)}</div>
          <div class="detalhe">${d.perdidas.qtde} propostas</div>
        </div>
      </div>
```

O restante do template (régua de termômetro, funil, esquecidas) não muda.

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam (nenhum teste de backend foi tocado nesta task).

- [ ] **Step 3: Verificar a API (sanidade via curl)**

Com o servidor de teste rodando (`PORTA=3051 node server.js`):

Run: `curl -s http://localhost:3051/api/dashboard | grep -o '"geradas":{[^}]*}'`
Expected: algo como `"geradas":{"qtde":481,"valor":2556603.07}` (números reais da base local).

- [ ] **Step 4: Verificar no navegador**

Recarregar `http://localhost:3051` → Dashboard:
- Duas linhas de KPIs: a de sempre (Em negociação / Previsão ponderada / Fechadas no mês / Taxa de conversão) e, abaixo dela, a nova (Geradas / Em andamento / Fechadas / Perdidas).
- "Em andamento" (linha nova) e "Em negociação" (linha existente) mostram o mesmo valor — esperado.
- Aplicar um filtro de filial ou consultor: os 4 KPIs novos recalculam junto com os demais.

- [ ] **Step 5: Commit**

```bash
git add public/js/dashboard.js
git commit -m "feat: linha de kpis do funil geral no dashboard"
```

---

### Task 3: Frontend — conversão e contagem por status na linha do consultor (Análise)

**Files:**
- Modify: `public/js/analise.js:22-32` (agrupamento `porConsultor`) e `:141-152` (template da linha)
- Modify: `public/styles.css:326-338` (`.cons-linha` e classes novas)

**Interfaces:**
- Consumes: nada de outra task — `porConsultor`/`consultores` já existentes em `analise.js`; helper `fmtPct` (`public/js/format.js`).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Calcular a conversão por consultor**

Em `public/js/analise.js`, a linha que hoje é:

```js
    const consultores = Object.values(porConsultor).sort((a, b) => b.total - a.total);
```

fica:

```js
    const consultores = Object.values(porConsultor)
      .map(c => ({ ...c, conversao: c.total ? 100 * c.FECHADA / c.total : 0 }))
      .sort((a, b) => b.total - a.total);
```

- [ ] **Step 2: Atualizar o template da linha**

O bloco atual (dentro de `.lista-consultores`):

```js
            <div class="cons-linha clicavel" data-consultor="${esc(c.nome)}" title="Ver propostas de ${esc(c.nome)}">
              <span class="cons-nome">${esc(primeiroNome(c.nome))}</span>
              <div class="barra-emp" style="width:${(100 * c.total / maxCons).toFixed(1)}%">
                ${c.ATIVA ? `<div class="seg-status-ativa" style="flex:${c.ATIVA}" title="${c.ATIVA} em aberto"></div>` : ''}
                ${c.FECHADA ? `<div class="seg-status-fechada" style="flex:${c.FECHADA}" title="${c.FECHADA} fechadas"></div>` : ''}
                ${c.PERDIDA ? `<div class="seg-status-perdida" style="flex:${c.PERDIDA}" title="${c.PERDIDA} perdidas"></div>` : ''}
              </div>
              <span class="cons-num">${c.total}${c.FECHADA ? ` <em>(${c.FECHADA}✓)</em>` : ''}</span>
            </div>`
```

fica (troca só o `<span class="cons-num">` final por contagem compacta + conversão):

```js
            <div class="cons-linha clicavel" data-consultor="${esc(c.nome)}" title="Ver propostas de ${esc(c.nome)}">
              <span class="cons-nome">${esc(primeiroNome(c.nome))}</span>
              <div class="barra-emp" style="width:${(100 * c.total / maxCons).toFixed(1)}%">
                ${c.ATIVA ? `<div class="seg-status-ativa" style="flex:${c.ATIVA}" title="${c.ATIVA} em aberto"></div>` : ''}
                ${c.FECHADA ? `<div class="seg-status-fechada" style="flex:${c.FECHADA}" title="${c.FECHADA} fechadas"></div>` : ''}
                ${c.PERDIDA ? `<div class="seg-status-perdida" style="flex:${c.PERDIDA}" title="${c.PERDIDA} perdidas"></div>` : ''}
              </div>
              <span class="cons-contagem">
                ${[
                  c.ATIVA ? `<b class="txt-ativa">${c.ATIVA}</b>` : '',
                  c.FECHADA ? `<b class="txt-fechada">${c.FECHADA}</b>` : '',
                  c.PERDIDA ? `<b class="txt-perdida">${c.PERDIDA}</b>` : '',
                ].filter(Boolean).join('<span class="sep">·</span>')}
              </span>
              <span class="cons-conv">conv ${fmtPct(c.conversao)}</span>
            </div>`
```

- [ ] **Step 3: Ajustar o grid da linha e adicionar as classes de cor**

Em `public/styles.css`, a regra:

```css
.cons-linha {
  display: grid; grid-template-columns: 150px 1fr 62px; gap: 8px;
  align-items: center; padding: 4px 2px; font-size: 12.5px; border-radius: 4px;
}
```

fica (4 colunas: nome, barra, contagem, conversão):

```css
.cons-linha {
  display: grid; grid-template-columns: 150px 1fr 92px 58px; gap: 8px;
  align-items: center; padding: 4px 2px; font-size: 12.5px; border-radius: 4px;
}
```

E, imediatamente depois da regra `.cons-num em { ... }` (última linha do bloco), adicionar:

```css
.cons-contagem { font-variant-numeric: tabular-nums; font-size: 12px; white-space: nowrap; text-align: right; }
.cons-contagem .sep { color: var(--tinta-3); margin: 0 2px; }
.txt-ativa { color: var(--frio); }
.txt-fechada { color: var(--fechada); }
.txt-perdida { color: var(--neutro); }
.cons-conv { font-size: 11.5px; color: var(--tinta-2); white-space: nowrap; text-align: right; }
```

(A regra `.cons-num` e `.cons-num em` deixam de ser usadas neste card, mas seguem existindo — a tela Consultores não usa essas classes, então não há impacto ali; podem ficar no CSS sem problema.)

- [ ] **Step 4: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam (nenhum teste de backend foi tocado nesta task).

- [ ] **Step 5: Verificar no navegador**

Com o servidor de teste rodando (`PORTA=3051 node server.js`), recarregar `http://localhost:3051` → Análise:
- Card "Propostas por consultor e situação": cada linha mostra, além da barra colorida, os números de cada status presente (ex.: `12·5·2`) nas cores correspondentes (aberto = azul frio, fechada = verde, perdida = cinza) e a conversão (ex.: `conv 26,3%`).
- Consultor sem perdidas mostra só dois números (ex.: `12·5`), sem "·0" nem separador sobrando.
- Clicar numa linha continua levando para Propostas filtrado por aquele consultor (comportamento existente, não deve ter sido alterado).
- Comparar a conversão exibida com a tela Consultores para um mesmo consultor sem filtro de data/termômetro — os números devem coincidir.

- [ ] **Step 6: Commit**

```bash
git add public/js/analise.js public/styles.css
git commit -m "feat: contagem por status e conversao na linha do consultor na analise"
```
