# Gestão de Propostas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema local (Node.js + Express + SQLite) para o gerente comercial gerenciar propostas, com dashboard/termômetro, análise por consultor, importação da planilha existente e relatório PDF para diretoria.

**Architecture:** Servidor Express serve API REST + frontend estático vanilla em `http://localhost:3050`. Banco SQLite (`better-sqlite3`) em `dados/propostas.db`. Importador lê o `.xlsx` com a lib `xlsx` (raw values + cellDates). PDF gerado com `puppeteer-core` usando o Edge do Windows.

**Tech Stack:** Node.js 24, Express 4, better-sqlite3, xlsx, puppeteer-core, node:test (testes), HTML/CSS/JS vanilla (sem build).

## Global Constraints

- Idioma da interface: português (BR). Moeda `R$ 1.234,56`, datas `DD/MM/AAAA`.
- Porta padrão: `3050`.
- Banco: `dados/propostas.db` (criado automaticamente). Planilha modelo: `Modelo/RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx`.
- Termômetro: `QUENTE`/`MORNO`/`FRIO`/`NULL` (não classificada). Probabilidades padrão: 70/40/10 (configuráveis).
- Status: `ATIVA`/`FECHADA`/`PERDIDA`. Etapas: `ELABORANDO PROPOSTA`, `AGENDADO VISITA`, `AGUARDANDO VISITA`, `EM NEGOCIAÇÃO`, `FECHADO`, `PERDIDO`.
- Alerta "esquecida"/termômetro desatualizado: 30 dias sem contato (configurável).
- Dedup de importação: `(filial_codigo, numero)`.
- Testes com `node:test` nativo (`npm test` → `node --test tests/`).
- Commits frequentes, mensagens em pt-BR estilo `feat:`/`fix:`/`test:`.

## File Structure

```
GestãoPropostas/
├── package.json
├── server.js                  # entrada: express + rotas + static
├── src/
│   ├── db.js                  # abre SQLite, cria schema, seeds de config
│   ├── importer.js            # lê xlsx → insere no banco (dedup)
│   ├── parse.js               # conversões: datas excel, moeda, mapeamento status/etapa
│   ├── stats.js               # cálculos: previsão ponderada, funil, esquecidas, consultores
│   ├── routes.js              # rotas REST
│   └── pdf.js                 # geração de PDF via Edge
├── public/
│   ├── index.html             # shell SPA (abas)
│   ├── styles.css
│   ├── js/
│   │   ├── api.js             # fetch helpers
│   │   ├── format.js          # moeda/data pt-BR
│   │   ├── dashboard.js
│   │   ├── propostas.js
│   │   ├── consultores.js
│   │   └── relatorio.js
│   └── relatorio-print.html   # template do PDF (rota /relatorio/print)
├── tests/
│   ├── parse.test.js
│   ├── stats.test.js
│   └── importer.test.js
├── dados/                     # .db (gitignored)
├── relatorios/                # PDFs gerados (gitignored)
└── Iniciar Gestão de Propostas.bat
```

---

### Task 1: Scaffold + banco de dados

**Files:**
- Create: `package.json`, `.gitignore`, `src/db.js`, `tests/db.test.js`

**Interfaces:**
- Produces: `db.js` exporta `openDb(caminho)` → instância better-sqlite3 com schema criado e config semeada; `SCHEMA_SQL` (string).

- [ ] **Step 1:** `npm init -y`; instalar deps: `npm i express better-sqlite3 xlsx puppeteer-core`. Ajustar `package.json`: `"scripts": {"start": "node server.js", "test": "node --test tests/"}`.
- [ ] **Step 2:** Criar `.gitignore` com `node_modules/`, `dados/`, `relatorios/`, `~$*`.
- [ ] **Step 3:** Teste falhando `tests/db.test.js`: abre banco em memória (`openDb(':memory:')`), verifica que tabelas `filiais, consultores, propostas, contatos, config` existem e que `config` tem `prob_quente=70`, `prob_morno=40`, `prob_frio=10`, `dias_alerta=30`.
- [ ] **Step 4:** Implementar `src/db.js`:

```js
const Database = require('better-sqlite3');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS filiais (
  id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'FILIAL', estado TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS consultores (
  id INTEGER PRIMARY KEY, nome TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'FRANQUEADO', ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS propostas (
  id INTEGER PRIMARY KEY,
  filial_id INTEGER NOT NULL REFERENCES filiais(id),
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,          -- ISO yyyy-mm-dd
  cliente TEXT NOT NULL,
  tipo_negocio TEXT DEFAULT 'PORTARIA INTELIGENTE',
  status TEXT NOT NULL DEFAULT 'ATIVA',    -- ATIVA|FECHADA|PERDIDA
  etapa TEXT,                               -- ver Global Constraints
  data_fechamento TEXT,
  vlr_comodato REAL DEFAULT 0, vlr_serv_adicional REAL DEFAULT 0,
  vlr_mensal REAL DEFAULT 0, vlr_taxa_adesao REAL DEFAULT 0,
  vlr_venda REAL DEFAULT 0, vlr_instalacao REAL DEFAULT 0,
  vlr_serv_especial REAL DEFAULT 0, vlr_total REAL DEFAULT 0,
  consultor_id INTEGER REFERENCES consultores(id),
  descricao TEXT, observacao TEXT,
  termometro TEXT,                          -- QUENTE|MORNO|FRIO|NULL
  proxima_data_contato TEXT,
  marcada_relatorio INTEGER NOT NULL DEFAULT 0,
  valor_minimo_fechamento REAL,
  criada_em TEXT NOT NULL DEFAULT (date('now')),
  UNIQUE (filial_id, numero));
CREATE TABLE IF NOT EXISTS contatos (
  id INTEGER PRIMARY KEY,
  proposta_id INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  data TEXT NOT NULL, anotacao TEXT, proximo_contato TEXT);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
`;

const CONFIG_PADRAO = { prob_quente: '70', prob_morno: '40', prob_frio: '10', dias_alerta: '30' };

function openDb(caminho) {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  const ins = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [k, v] of Object.entries(CONFIG_PADRAO)) ins.run(k, v);
  return db;
}
module.exports = { openDb, SCHEMA_SQL };
```

- [ ] **Step 5:** `npm test` → PASS. Commit `feat: scaffold e schema do banco`.

---

### Task 2: Parsing e importação da planilha

**Files:**
- Create: `src/parse.js`, `src/importer.js`, `tests/parse.test.js`, `tests/importer.test.js`

**Interfaces:**
- Consumes: `openDb` (Task 1).
- Produces: `parse.js`: `toIsoDate(v)` (Date|string M/D/YY → 'yyyy-mm-dd'|null), `toNumber(v)` (number|'R$ 1,234.56'|null → number), `mapStatus(s)` ('Analise Cliente'→'ATIVA', 'Fechada'→'FECHADA', default 'ATIVA'), `mapEtapa(s)` (trim/upper ou null; 'FECHADO'→status implícito tratado no importer). `importer.js`: `importarPlanilha(db, caminhoXlsx)` → `{inseridas, ignoradas, consultores, filiais}`.
- Regras: ler xlsx com `XLSX.readFile(caminho, {cellDates:true})` e `sheet_to_json(ws, {raw:true})`; abas EMPRESAS e CONSULTORES populam `filiais`/`consultores` (INSERT OR IGNORE); PROPOSTAS com dedup `(filial_id, numero)`; linha com etapa `FECHADO` → status `FECHADA`; etapa `PERDIDO` → status `PERDIDA`; termômetro vazio → NULL.

- [ ] **Step 1:** Testes falhando de `parse.js` (datas Date e string '2/5/25'→'2025-02-05', moeda 5685.31 e 'R$ 5,685.31'→5685.31, ' R$ -   '→0, mapStatus, mapEtapa).
- [ ] **Step 2:** Implementar `parse.js`; testes PASS. Commit `feat: parsers de data, moeda e status`.
- [ ] **Step 3:** Teste falhando de `importer.js`: gerar workbook em memória com `XLSX.utils` (2 propostas, 1 duplicada na reimportação), importar em db `:memory:`, verificar contagens e dedup (reimportar → `ignoradas: 2`).
- [ ] **Step 4:** Implementar `importer.js`; testes PASS. Commit `feat: importador da planilha`.
- [ ] **Step 5:** Smoke real: script único `node -e` importando a planilha verdadeira em `dados/propostas.db`; conferir: 481 propostas, soma vlr_total ≈ 2.556.603,07, 4 filiais, 33+ consultores. Commit `feat: importacao validada com planilha real`.

---

### Task 3: Cálculos de negócio (stats)

**Files:**
- Create: `src/stats.js`, `tests/stats.test.js`

**Interfaces:**
- Consumes: db aberto (Task 1).
- Produces:
  - `getConfig(db)` → `{prob_quente, prob_morno, prob_frio, dias_alerta}` (números)
  - `dashboardStats(db, filtros)` → `{totalAtivas: {qtde, valor}, previsaoPonderada, fechadasMes: {qtde, valor}, taxaConversao, funil: [{etapa, qtde, valor}], termometro: [{nivel, qtde, valor}], esquecidas: [{id, numero, cliente, consultor, valor, diasSemContato}], naoClassificadas}`
  - `consultorStats(db, filtros)` → array `{id, nome, tipo, emitidas, valorTotal, fechadas, valorFechado, taxaConversao, ticketMedio, tempoMedioFechamentoDias, paradas}`
  - `filtros = {filial_id?, consultor_id?, de?, ate?}` aplicados via WHERE dinâmico.
- Regras: previsão ponderada = Σ vlr_total × prob(termometro)/100 sobre ATIVAs (NULL não pontua). "Esquecida" = ATIVA sem contato há > dias_alerta (max entre última data de contato e data_emissao). Última data de contato = `MAX(contatos.data)`.

- [ ] **Step 1:** Testes falhando com banco em memória semeado (propostas quente/morno/frio/sem classificação, contatos antigos/recentes, fechadas): previsão ponderada exata, lista de esquecidas, taxa de conversão, consultorStats.
- [ ] **Step 2:** Implementar `stats.js`; PASS. Commit `feat: calculos de dashboard e consultores`.

---

### Task 4: API REST + servidor

**Files:**
- Create: `server.js`, `src/routes.js`

**Interfaces:**
- Consumes: `openDb`, `importarPlanilha`, `dashboardStats`, `consultorStats`, `gerarPdf` (Task 6, ligado depois).
- Produces (JSON, prefixo `/api`):
  - `GET /api/dashboard?filial_id=&consultor_id=&de=&ate=` → dashboardStats
  - `GET /api/propostas?busca=&filial_id=&consultor_id=&status=&etapa=&termometro=&marcadas=` → lista com joins (nome consultor, estado filial, ultima_data_contato)
  - `POST /api/propostas`, `PUT /api/propostas/:id`, `GET /api/propostas/:id` (inclui contatos)
  - `POST /api/propostas/:id/contatos` `{data, anotacao, proximo_contato}`
  - `GET /api/consultores/stats`, `GET /api/consultores`, `GET /api/filiais`
  - `GET /api/config`, `PUT /api/config`
  - `POST /api/importar` → roda importer na planilha do `Modelo/`
  - `POST /api/relatorio/pdf` → gera PDF, retorna `{arquivo}`
- `server.js`: express.json(), static `public/`, abre `dados/propostas.db`, porta 3050, na subida importa automaticamente se tabela propostas vazia.

- [ ] **Step 1:** Implementar rotas + server. Sem testes unitários de rota (cobertura via stats/importer); verificação por smoke com `curl`/`Invoke-RestMethod` em `/api/dashboard` e `/api/propostas` com servidor de pé.
- [ ] **Step 2:** Commit `feat: API REST e servidor`.

---

### Task 5: Frontend (shell, dashboard, propostas, consultores)

**Files:**
- Create: `public/index.html`, `public/styles.css`, `public/js/{api,format,dashboard,propostas,consultores,relatorio}.js`

**Interfaces:**
- Consumes: API da Task 4.
- Produces: SPA com 4 abas (Dashboard, Propostas, Consultores, Relatório Diretoria). `format.js`: `fmtMoeda(n)`, `fmtData(iso)`. `api.js`: `apiGet(url)`, `apiSend(method, url, body)`.
- ANTES de codar: invocar skills `frontend-design` (direção visual) e `dataviz` (funil, termômetro, gráficos — SVG inline, sem libs externas).
- Dashboard: cartões, funil, distribuição do termômetro, tabela "Propostas esquecidas" (link abre a proposta), filtros filial/consultor/período.
- Propostas: tabela com busca+filtros, modal/painel de edição com todos os campos, detalhe com histórico de contatos + form de novo contato, badge de alerta quando sem contato > dias_alerta, ações Fechar (data) / Perder.
- Consultores: tabela-ranking ordenável, comparativo FRANQUEADO×CLT, clique → propostas do consultor.
- Relatório: lista de ATIVAs com checkbox `marcada_relatorio` + input `valor_minimo_fechamento` (salva via PUT), prévia dos totais, botão Gerar PDF.

- [ ] **Step 1:** Shell + styles + api/format. Commit `feat: shell do frontend`.
- [ ] **Step 2:** Tela Propostas completa (CRUD + contatos). Verificar manualmente no navegador. Commit.
- [ ] **Step 3:** Dashboard com gráficos. Commit.
- [ ] **Step 4:** Consultores. Commit.
- [ ] **Step 5:** Aba Relatório (seleção/valores). Commit.

---

### Task 6: PDF para diretoria

**Files:**
- Create: `src/pdf.js`, `public/relatorio-print.html` (servida como rota `GET /relatorio/print` que injeta dados)

**Interfaces:**
- Consumes: db, stats.
- Produces: `gerarPdf(db, urlBase)` → caminho do PDF salvo em `relatorios/Relatorio-Diretoria-YYYY-MM-DD.pdf`.
- Implementação: `puppeteer-core` com `executablePath` do Edge (procurar em `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` e `C:\Program Files\Microsoft\Edge\Application\msedge.exe`), `page.goto(urlBase + '/relatorio/print')`, `page.pdf({format:'A4', printBackground:true})`. Rota `POST /api/relatorio/pdf` chama e retorna o caminho; frontend mostra link.
- Conteúdo do print: cabeçalho com data, resumo executivo (totais/funil/termômetro), tabela das marcadas: cliente, consultor, filial, valor original, valor mínimo p/ fechamento, diferença (R$ e %), total geral da viabilização.

- [ ] **Step 1:** Rota print + template. Verificar no navegador.
- [ ] **Step 2:** `pdf.js` + botão. Gerar PDF real e abrir para conferir. Commit `feat: relatorio PDF para diretoria`.

---

### Task 7: Launcher + verificação final

**Files:**
- Create: `Iniciar Gestão de Propostas.bat`, `README.md`

- [ ] **Step 1:** `.bat`: `cd /d "%~dp0" && start http://localhost:3050 && node server.js` (com título e chcp 65001).
- [ ] **Step 2:** README curto: como iniciar, onde fica o banco, como reimportar, como gerar PDF, backup.
- [ ] **Step 3:** Verificação de ponta a ponta (skill `verify`): subir pelo .bat, conferir totais do dashboard contra a planilha (481 propostas / R$ 2.556.603,07), criar proposta teste, registrar contato, gerar PDF. Excluir a proposta teste. Commit final.
```
