# Propostas: filtro mês/ano, agrupamento por mês e cabeçalho com logo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar filtro por mês e ano na tela de Propostas, separar o grid em blocos mensais recolhíveis com subtotais, e trocar o cabeçalho do sistema pela logo da Servis.

**Architecture:** A filtragem por mês/ano é feita no SQL (`strftime`) dentro do `GET /propostas` que já existe, para que o contador e o total no topo do grid continuem batendo com o que está na tela. Os anos do select vêm de um endpoint novo `GET /propostas/anos`. O agrupamento é puramente de apresentação: acontece no cliente, dentro de `listar()`, varrendo linearmente a lista que a API já devolve ordenada por `data_emissao DESC`.

**Tech Stack:** Node.js + Express 5, SQLite via `better-sqlite3`, frontend HTML/CSS/JS vanilla sem build step, testes com `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-02-propostas-filtro-mes-e-cabecalho-design.md`

## Global Constraints

- Rodar tudo a partir da raiz do projeto: `C:\Users\rodrigo.carvalho\Meu Drive\Empresas\QuanttIA\Sistemas\Claude\GestãoPropostas`
- O servidor sobe na porta **3060** (`npm start`). A 3050 é do Firebird nesta máquina e **não** deve ser usada.
- Comando de teste: `npm test` (equivale a `node --test`). Não há runner de teste de frontend — o projeto só tem testes de servidor em `tests/*.test.js`.
- Frontend é JS vanilla carregado por `<script>` em `public/index.html`. Não há import/export: os arquivos definem funções globais. `js/format.js` carrega **antes** de `js/propostas.js`, então funções declaradas nele estão disponíveis lá.
- Textos de interface em português, com acento.
- Cores sempre via tokens CSS existentes (`var(--marca)`, `var(--tinta-2)`, …), nunca hex direto — é o que faz o tema claro/escuro funcionar.
- `data_emissao` está gravada em ISO (`2026-07-01`). Não converter.
- Um commit por task, mensagem em português no padrão `feat:` / `test:` do repositório.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Mudança |
|---|---|---|
| `src/routes.js` | Rotas da API | Endpoint `/propostas/anos`; filtros `mes`/`ano` no `GET /propostas` |
| `tests/routes.test.js` | Testes das rotas | 4 testes novos |
| `public/js/format.js` | Formatação compartilhada | `NOMES_MES` e `fmtMesAno()` |
| `public/js/propostas.js` | Tela de Propostas | Selects Mês/Ano; agrupamento e recolher em `listar()` |
| `public/styles.css` | Estilos | `.grupo-mes*`; troca das regras do cabeçalho |
| `public/index.html` | Estrutura da página | Cabeçalho com a logo |
| `public/img/` | Imagens | Pasta nova para `logo-servis.png` |

---

### Task 1: Endpoint `GET /api/propostas/anos`

**Files:**
- Modify: `src/routes.js` (inserir imediatamente antes de `r.get('/propostas/:id', …)`, hoje na linha 68)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: `subirApp()`, o helper que já existe no topo de `tests/routes.test.js`
- Produces: `GET /api/propostas/anos` → array de strings de 4 dígitos em ordem decrescente, ex.: `["2026","2025","2024"]`. A Task 3 consome isso para montar o select de Ano.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar no fim de `tests/routes.test.js`:

```js
test('GET /propostas/anos devolve anos distintos em ordem decrescente', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente: 'COND ANOS' }),
  });
  await criar('1', '2024-11-11');
  await criar('2', '2026-07-01');
  await criar('3', '2026-02-05');
  await criar('4', '2025-03-09');

  const resposta = await fetch(`${base}/api/propostas/anos`);
  assert.equal(resposta.status, 200);
  // 2026 está em duas propostas e aparece uma única vez na resposta
  assert.deepEqual(await resposta.json(), ['2026', '2025', '2024']);
});

test('/propostas/anos não é capturado pela rota /propostas/:id', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  // Banco vazio. Se 'anos' cair em /propostas/:id, a resposta é
  // 404 { erro: 'Proposta não encontrada' } em vez de uma lista vazia.
  const resposta = await fetch(`${base}/api/propostas/anos`);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), []);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: os dois testes novos falham com `AssertionError: 404 != 200` — a requisição está caindo em `/propostas/:id`.

- [ ] **Step 3: Implementar**

Em `src/routes.js`, inserir **antes** de `r.get('/propostas/:id', …)`:

```js
  // Precisa vir ANTES de '/propostas/:id': o Express casa as rotas na ordem
  // de declaração e 'anos' seria lido como um id de proposta.
  r.get('/propostas/anos', (req, res) => {
    res.json(db.prepare(`
      SELECT DISTINCT strftime('%Y', data_emissao) ano
      FROM propostas
      WHERE data_emissao IS NOT NULL AND data_emissao <> ''
      ORDER BY ano DESC
    `).all().map(r2 => r2.ano));
  });
```

- [ ] **Step 4: Rodar para ver passar**

Rodar: `npm test`
Esperado: PASS nos dois testes novos e nos 36 que já existiam — 38 no total.

- [ ] **Step 5: Commit**

```bash
git add src/routes.js tests/routes.test.js
git commit -m "feat: endpoint /propostas/anos com os anos de emissao distintos"
```

---

### Task 2: Filtros `mes` e `ano` no `GET /api/propostas`

**Files:**
- Modify: `src/routes.js` (bloco de `cond.push` dentro de `r.get('/propostas', …)`, hoje nas linhas 39-47)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: nada da Task 1
- Produces: `GET /api/propostas` passa a aceitar `mes` (`'01'`…`'12'`) e `ano` (`'2026'`). Os dois são independentes e opcionais, e se somam aos filtros existentes. A Task 3 envia esses parâmetros.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar no fim de `tests/routes.test.js`:

```js
test('GET /propostas filtra por mes e por ano de emissão, de forma independente', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente: 'COND MES' }),
  });
  await criar('1', '2026-06-10');
  await criar('2', '2026-06-28');
  await criar('3', '2026-07-01');
  await criar('4', '2025-06-15');

  const numeros = async qs =>
    (await (await fetch(`${base}/api/propostas?${qs}`)).json()).map(p => p.numero).sort();

  assert.deepEqual(await numeros('mes=06&ano=2026'), ['1', '2'], 'mês e ano juntos');
  assert.deepEqual(await numeros('mes=06'), ['1', '2', '4'], 'junho de qualquer ano');
  assert.deepEqual(await numeros('ano=2026'), ['1', '2', '3'], '2026 inteiro');
  assert.deepEqual(await numeros(''), ['1', '2', '3', '4'], 'sem filtro');
});

test('mes/ano se somam aos outros filtros em vez de substituí-los', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao, cliente) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente }),
  });
  await criar('1', '2026-06-10', 'COND ALFA');
  await criar('2', '2026-06-11', 'COND BETA');
  await criar('3', '2026-07-10', 'COND ALFA');

  const lista = await (await fetch(
    `${base}/api/propostas?mes=06&ano=2026&cliente=${encodeURIComponent('COND ALFA')}`
  )).json();
  assert.deepEqual(lista.map(p => p.numero), ['1']);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: o primeiro teste falha na primeira asserção (`mes=06&ano=2026` devolve as 4 propostas porque os parâmetros são ignorados); o segundo devolve `['1','3']` em vez de `['1']`.

- [ ] **Step 3: Implementar**

Em `src/routes.js`, dentro de `r.get('/propostas', …)`, logo depois da linha do `origem`:

```js
    if (q.origem) { cond.push('p.origem = ?'); params.push(q.origem); }
    // padStart aceita tanto mes=6 quanto mes=06; strftime('%m') devolve com zero à esquerda
    if (q.mes) { cond.push("strftime('%m', p.data_emissao) = ?"); params.push(String(q.mes).padStart(2, '0')); }
    if (q.ano) { cond.push("strftime('%Y', p.data_emissao) = ?"); params.push(String(q.ano)); }
```

- [ ] **Step 4: Rodar para ver passar**

Rodar: `npm test`
Esperado: PASS — 40 testes no total.

- [ ] **Step 5: Commit**

```bash
git add src/routes.js tests/routes.test.js
git commit -m "feat: filtros mes e ano em GET /propostas"
```

---

### Task 3: Selects Mês e Ano na tela de Propostas

**Files:**
- Modify: `public/js/format.js` (acrescentar no fim)
- Modify: `public/js/propostas.js` (objeto `filtros`, `carregar()`)

**Interfaces:**
- Consumes: `GET /api/propostas/anos` (Task 1); parâmetros `mes`/`ano` de `GET /api/propostas` (Task 2)
- Produces: `NOMES_MES` (array de 12 strings, `'Janeiro'`…`'Dezembro'`) e `fmtMesAno(chave)` em `format.js`, ambos usados pela Task 4. `Propostas.filtros.mes` e `Propostas.filtros.ano`.

- [ ] **Step 1: Acrescentar os helpers de mês em `format.js`**

No fim de `public/js/format.js`:

```js
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// '2026-07' -> 'Julho 2026'. Chave vazia ou inválida -> 'Sem data'.
function fmtMesAno(chave) {
  const [ano, mes] = String(chave || '').split('-');
  const nome = NOMES_MES[Number(mes) - 1];
  if (!nome || !/^\d{4}$/.test(ano)) return 'Sem data';
  return `${nome} ${ano}`;
}
```

- [ ] **Step 2: Acrescentar `mes` e `ano` ao estado dos filtros**

Em `public/js/propostas.js`, na linha do objeto `filtros` (hoje linha 15), acrescentar as duas chaves no fim:

```js
  filtros: { busca: '', cliente: '', filial_id: '', consultor_id: '', status: 'ATIVA', etapa: '', termometro: '', origem: '', mes: '', ano: '' },
```

- [ ] **Step 3: Carregar a lista de anos junto com os outros dados**

Em `carregar()`, trocar o `Promise.all` (hoje linhas 22-24) por:

```js
    const [filiais, consultores, cfg, clientes, anos] = await Promise.all([
      apiGet('/api/filiais'), apiGet('/api/consultores'), apiGet('/api/config'),
      apiGet('/api/clientes'), apiGet('/api/propostas/anos'),
    ]);
```

- [ ] **Step 4: Acrescentar os dois selects ao HTML dos filtros**

No template de `carregar()`, entre o `<div class="campo">` de Origem e o `<button id="pr-nova">`:

```html
        <div class="campo"><label>Mês</label><select id="pr-mes">
          <option value="">Todos</option>
          ${NOMES_MES.map((nome, i) => {
            const v = String(i + 1).padStart(2, '0');
            return `<option value="${v}" ${v === this.filtros.mes ? 'selected' : ''}>${nome}</option>`;
          }).join('')}
        </select></div>
        <div class="campo"><label>Ano</label><select id="pr-ano">
          <option value="">Todos</option>
          ${anos.map(a => `<option ${a === this.filtros.ano ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select></div>
```

- [ ] **Step 5: Ligar os selects ao `listar()`**

Em `carregar()`, junto das outras chamadas de `liga(…)` (hoje linhas 84-89), acrescentar depois de `liga('pr-origem', 'origem');`:

```js
    liga('pr-mes', 'mes');
    liga('pr-ano', 'ano');
```

Nada mais é necessário: `listar()` monta a querystring com `Object.entries(this.filtros).filter(([, v]) => v)`, então `Todos` (valor `''`) já sai da URL sozinho.

- [ ] **Step 6: Verificar no navegador**

Rodar: `npm start` e abrir `http://localhost:3060` → aba **Propostas**.

Conferir:
1. Os selects **Mês** e **Ano** aparecem depois de Origem, antes do botão "+ Nova proposta"
2. Ano lista `Todos`, `2026`, `2025`, `2024`
3. Selecionar Mês = Junho e Ano = 2026 reduz o grid, e a linha de contagem no topo (`N proposta(s) · R$ …`) muda junto
4. Selecionar só Mês = Junho traz junho de 2024, 2025 e 2026
5. Voltar os dois para `Todos` restaura a lista completa

Encerrar o servidor (Ctrl+C) antes de commitar.

- [ ] **Step 7: Commit**

```bash
git add public/js/format.js public/js/propostas.js
git commit -m "feat: filtros de mes e ano na tela de propostas"
```

---

### Task 4: Agrupamento por mês no grid

**Files:**
- Modify: `public/js/propostas.js` (novo campo `mesesRecolhidos`, novos métodos `agrupar()` e `faixaMes()`, reescrita de `listar()`)
- Modify: `public/styles.css` (acrescentar depois do bloco `/* ===== Tabelas ===== */`, que termina hoje na linha 217)

**Interfaces:**
- Consumes: `fmtMesAno(chave)` e `esc()`, `fmtMoeda()`, `fmtData()` de `format.js`
- Produces: nada consumido por tasks posteriores

- [ ] **Step 1: Acrescentar o estado dos meses recolhidos**

Em `public/js/propostas.js`, junto dos outros campos do objeto `Propostas` (depois de `diasAlerta: 30,`):

```js
  // Chaves 'AAAA-MM' dos meses recolhidos. Fica no objeto (e não em
  // localStorage) para sobreviver a trocas de filtro, mas recomeçar
  // tudo aberto a cada recarregamento da página.
  mesesRecolhidos: new Set(),
```

- [ ] **Step 2: Acrescentar os métodos `agrupar()` e `faixaMes()`**

Em `public/js/propostas.js`, imediatamente **antes** de `async listar() {`:

```js
  // A API devolve ordenado por data_emissao DESC, então basta varrer em ordem
  // e quebrar quando a chave AAAA-MM muda. Propostas sem data caem em
  // 'sem-data', que o SQLite já deixa no fim da ordenação decrescente.
  agrupar(lista) {
    const grupos = [];
    let atual = null;
    for (const p of lista) {
      const chave = p.data_emissao ? String(p.data_emissao).slice(0, 7) : 'sem-data';
      if (!atual || atual.chave !== chave) {
        atual = { chave, itens: [], total: 0 };
        grupos.push(atual);
      }
      atual.itens.push(p);
      atual.total += p.vlr_total || 0;
    }
    return grupos;
  },

  faixaMes(g) {
    const recolhido = this.mesesRecolhidos.has(g.chave);
    const plural = g.itens.length === 1 ? 'proposta' : 'propostas';
    return `
      <tr class="grupo-mes" data-mes="${esc(g.chave)}">
        <td colspan="11">
          <div class="grupo-mes-faixa">
            <span class="grupo-mes-seta">${recolhido ? '▸' : '▾'}</span>
            <span>${esc(fmtMesAno(g.chave))}</span>
            <span class="grupo-mes-totais">${g.itens.length} ${plural} · <b>${fmtMoeda(g.total)}</b></span>
          </div>
        </td>
      </tr>`;
  },
```

O `colspan="11"` corresponde às 11 colunas do `<thead>`: Nº, Data, Cliente, Filial, Consultor, Valor total, Termômetro, Etapa, Origem, Últ. contato, Status.

- [ ] **Step 3: Reescrever o corpo da tabela em `listar()`**

Em `listar()`, substituir tudo a partir de `alvo.innerHTML = \`` até o `.forEach` final por:

```js
    const linha = (p, chave) => `
      <tr class="clicavel${this.mesesRecolhidos.has(chave) ? ' oculta' : ''}" data-id="${p.id}" data-mes="${esc(chave)}">
        <td class="cod">${esc(p.numero)}</td>
        <td class="num">${fmtData(p.data_emissao)}</td>
        <td>${esc(p.cliente)}</td>
        <td>${esc(p.filial || '')}</td>
        <td>${esc((p.consultor || '—').split(' ').slice(0, 2).join(' '))}</td>
        <td class="num">${fmtMoeda(p.vlr_total)}</td>
        <td>${badgeTerm(p.termometro)}</td>
        <td style="font-size:11.5px">${esc((p.etapa || '—').toLowerCase())}</td>
        <td style="font-size:11.5px">${esc(p.origem || '—')}</td>
        <td class="num">${p.status === 'ATIVA' && p.dias_sem_contato > this.diasAlerta
          ? `<span class="badge badge-alerta" title="Sem contato há ${p.dias_sem_contato} dias">${p.ultima_data_contato ? fmtData(p.ultima_data_contato) : 'nunca'} ⚠</span>`
          : (p.ultima_data_contato ? fmtData(p.ultima_data_contato) : '—')}</td>
        <td><span class="badge badge-${p.status}">${p.status}</span></td>
      </tr>`;

    alvo.innerHTML = `
      <p style="margin-bottom:8px;color:var(--tinta-2);font-size:12.5px">${lista.length} proposta(s) · ${fmtMoeda(lista.reduce((s, p) => s + (p.vlr_total || 0), 0))}</p>
      <table class="tabela">
      <thead><tr>
        <th>Nº</th><th>Data</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
        <th style="text-align:right">Valor total</th><th>Termômetro</th><th>Etapa</th><th>Origem</th><th>Últ. contato</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${this.agrupar(lista).map(g =>
          this.faixaMes(g) + g.itens.map(p => linha(p, g.chave)).join('')
        ).join('')}
      </tbody></table>`;

    // Só as linhas de proposta abrem o formulário — a faixa do mês não tem data-id
    // e o seletor deixa isso explícito em vez de depender disso.
    alvo.querySelectorAll('tr.clicavel[data-id]').forEach(tr => {
      tr.onclick = () => this.abrirDetalhe(Number(tr.dataset.id));
    });

    alvo.querySelectorAll('tr.grupo-mes').forEach(tr => {
      tr.onclick = () => {
        const chave = tr.dataset.mes;
        const recolher = !this.mesesRecolhidos.has(chave);
        if (recolher) this.mesesRecolhidos.add(chave);
        else this.mesesRecolhidos.delete(chave);
        tr.querySelector('.grupo-mes-seta').textContent = recolher ? '▸' : '▾';
        alvo.querySelectorAll(`tr.clicavel[data-mes="${CSS.escape(chave)}"]`)
          .forEach(l => l.classList.toggle('oculta', recolher));
      };
    });
```

O `badgeTerm` declarado logo acima em `listar()` continua onde está — `linha` usa ele por closure.

- [ ] **Step 4: Estilizar a faixa**

Em `public/styles.css`, depois da linha `.rolagem { overflow-x: auto; }` (fim do bloco de Tabelas):

```css
/* ===== Faixa de mês no grid de Propostas ===== */
.tabela tr.grupo-mes { cursor: pointer; user-select: none; }
/* anula o hover genérico de linha, que aqui atrapalharia a leitura da faixa */
.tabela tbody tr.grupo-mes:hover { background: transparent; }
.tabela tr.grupo-mes td { padding: 0; border-bottom: 1px solid var(--borda); }
.grupo-mes-faixa {
  display: flex; align-items: center; gap: 10px;
  background: var(--marca-claro); border-left: 3px solid var(--marca);
  padding: 7px 12px;
  font-size: 12px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase;
}
.grupo-mes-seta { width: 12px; color: var(--tinta-2); font-size: 11px; }
.grupo-mes-totais {
  margin-left: auto; color: var(--tinta-2);
  font-size: 11.5px; font-weight: 400; letter-spacing: 0; text-transform: none;
  font-variant-numeric: tabular-nums;
}
.grupo-mes-totais b { color: var(--tinta); font-weight: 650; }
```

- [ ] **Step 5: Verificar no navegador**

Rodar: `npm start` e abrir `http://localhost:3060` → aba **Propostas**.

Conferir:
1. Sem filtro de mês/ano, o grid mostra uma faixa por mês, em ordem decrescente, cada uma com `JULHO 2026` à esquerda e `N propostas · R$ …` à direita
2. Somar as contagens das faixas dá exatamente o número da linha de contagem no topo
3. Clicar numa faixa esconde as linhas daquele mês e a seta vira `▸`; clicar de novo reabre e volta para `▾`
4. Com um mês recolhido, trocar o filtro de Consultor — o mês continua recolhido depois que a lista recarrega
5. Com um mês recolhido, o total no topo **não** muda (o mês está filtrado dentro, só não está visível)
6. Clicar numa linha de proposta abre o formulário; clicar na faixa **não** abre
7. Selecionar Mês = Junho e Ano = 2026 deixa uma faixa só, cujo total bate com o total do topo
8. Alternar o tema (🌙/☀) — a faixa continua legível nos dois, sem cor chapada

Encerrar o servidor (Ctrl+C) antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add public/js/propostas.js public/styles.css
git commit -m "feat: agrupamento por mes no grid de propostas, com subtotal e recolher"
```

---

### Task 5: Cabeçalho com a logo da Servis

**Files:**
- Modify: `public/index.html:20-31`
- Modify: `public/styles.css:88-91`
- Create: `public/img/.gitkeep`

**Interfaces:**
- Consumes: nada
- Produces: nada

**Contexto:** a barra usa `var(--marca-solida)`, definido só em `:root` (`#17435e`) e não sobrescrito no tema escuro — o cabeçalho é o mesmo azul escuro nos dois temas, então basta **uma** versão da logo. O arquivo ainda não existe; o fallback cobre a ausência.

- [ ] **Step 1: Criar a pasta de imagens**

```bash
mkdir -p public/img
touch public/img/.gitkeep
```

- [ ] **Step 2: Trocar o cabeçalho no HTML**

Em `public/index.html`, substituir o bloco `<header class="topo"> … </header>` (linhas 20-31) por:

```html
<header class="topo">
  <span class="topo-marca" id="topo-marca">
    <img src="img/logo-servis.png" alt="Servis Eletrônica"
         onerror="this.remove(); document.getElementById('topo-marca').textContent = 'Gestão de Propostas';">
  </span>
  <span class="topo-espaco"></span>
  <button class="btn-icone" id="btn-tema" title="Alternar tema claro/escuro">🌙</button>
  <button class="btn-icone" id="btn-config" title="Configurações">⚙</button>
</header>
```

O `onerror` inline (e não em `app.js`) é proposital: o erro de carregamento da imagem pode disparar antes de os `<script>` do fim do `<body>` rodarem.

- [ ] **Step 3: Trocar as regras de CSS do cabeçalho**

Em `public/styles.css`, substituir as linhas 88-91:

```css
.topo-marca { display: flex; align-items: center; gap: 10px; }
.topo-logo { font-size: 26px; }
.topo h1 { font-size: 17px; font-weight: 650; letter-spacing: .2px; }
.topo-sub { font-size: 11px; opacity: .75; text-transform: uppercase; letter-spacing: 1px; }
```

por:

```css
/* Mesma altura que o bloco título+subtítulo ocupava, para a barra não mudar de altura.
   O font-size/weight vale para o texto de fallback quando a logo não carrega. */
.topo-marca { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 650; }
.topo-marca img { height: 30px; width: auto; display: block; }
```

- [ ] **Step 4: Verificar no navegador**

Rodar: `npm start` e abrir `http://localhost:3060`.

Conferir:
1. Sem o arquivo `public/img/logo-servis.png`, o cabeçalho mostra o texto "Gestão de Propostas" e nenhum ícone quebrado
2. A barra continua com 58px de altura — o conteúdo abaixo não desceu nem subiu
3. Os botões 🌙 e ⚙ continuam alinhados à direita e funcionando
4. Alternar o tema — a barra segue azul escura nos dois, como antes

Depois, para conferir o caminho da imagem: copiar qualquer PNG para `public/img/logo-servis.png`, dar F5 e confirmar que a imagem aparece no lugar do texto e que a barra não muda de altura. Apagar o arquivo de teste em seguida (o arquivo real virá do usuário).

Encerrar o servidor (Ctrl+C) antes de commitar.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/img/.gitkeep
git commit -m "feat: cabecalho com a logo da servis e fallback em texto"
```

---

## Fechamento

- [ ] **Rodar a suíte inteira**

Rodar: `npm test`
Esperado: 40 testes, 0 falhas.

- [ ] **Atualizar o README**

Em `README.md`, na descrição da aba **Propostas**, acrescentar depois da frase sobre clicar na linha:

```
  O grid vem separado por mês de emissão, com a quantidade e o valor de cada mês
  na faixa — clique na faixa para recolher o mês. Os filtros **Mês** e **Ano**
  isolam um período (podem ser usados juntos ou separados).
```

Commit: `git commit -am "docs: readme com o filtro de mes/ano e o agrupamento do grid"`

## Pendência conhecida

`public/img/logo-servis.png` não existe e será fornecido pelo usuário. Até lá o cabeçalho mostra o texto de fallback — isso é o comportamento esperado, não um bug. Quando o arquivo chegar, basta salvá-lo no caminho; nenhuma mudança de código é necessária.
