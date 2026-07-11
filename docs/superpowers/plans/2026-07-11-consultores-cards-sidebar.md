# Sidebar + Consultores em Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as abas do topo por uma sidebar de navegação (todas as telas) e redesenhar a tela Consultores como grade de cards com avatar, badge de tipo, métricas com mini-barras e ações por card.

**Architecture:** Frontend vanilla JS servido por Express. A navegação continua controlada por `App.trocarTela` via delegação de clique no container `#abas` — o container muda de `<nav>` no header para `<aside class="sidebar">`, mantendo id, classes `aba`/`ativa` e atributos `data-tela`, então `app.js` não muda. A tela Consultores é re-renderizada por string template em `consultores.js`; a tabela vira grade de cards alimentada pela mesma API `/api/consultores/stats`.

**Tech Stack:** HTML/CSS/JS vanilla (sem build), Express estático, tema claro/escuro via CSS custom properties em `:root[data-theme]`.

## Global Constraints

- Sidebar somente texto — **sem emojis/ícones** nos itens de navegação (decisão do usuário).
- Sem seção "Filiais" na sidebar.
- Zero mudança de backend (rotas, banco, API).
- Estilos novos usam as variáveis de tema existentes (`--fundo`, `--cartao`, `--borda`, `--tinta*`, `--marca*`, `--frio`, `--fechada*`) para funcionar nos dois temas.
- Textos da UI em português, seguindo o padrão do app (classes e identificadores em português, como `rep-cartao`, `cons-ordem`).
- Não há testes de frontend no projeto; `npm test` (backend) deve continuar passando após cada task.
- O servidor de teste roda em `http://localhost:3051` (porta 3050 está ocupada pelo Firebird nesta máquina); arquivos estáticos são servidos direto do disco, basta recarregar o navegador.

---

### Task 1: Sidebar de navegação (todas as telas)

**Files:**
- Modify: `public/index.html` (header + estrutura de duas colunas)
- Modify: `public/styles.css` (remove estilos de abas do topo; adiciona sidebar; ajusta print)

**Interfaces:**
- Consumes: `App.trocarTela(nome)` e o listener de clique em `#abas` (`public/js/app.js:82-84`) — inalterados.
- Produces: container `<aside class="sidebar" id="abas">` com botões `.aba[data-tela]` (mesmo contrato de antes); classe `.corpo` como wrapper flex de sidebar + main. Task 2 não depende desta task, mas ambas convivem no mesmo CSS.

- [ ] **Step 1: Reestruturar `public/index.html`**

Substituir o bloco do `<header>` até o fechamento de `</main>` (linhas 20–45 atuais) por:

```html
<header class="topo">
  <div class="topo-marca">
    <span class="topo-logo">🌡️</span>
    <div>
      <h1>Gestão de Propostas</h1>
      <span class="topo-sub">Acompanhamento comercial</span>
    </div>
  </div>
  <span class="topo-espaco"></span>
  <button class="btn-icone" id="btn-tema" title="Alternar tema claro/escuro">🌙</button>
  <button class="btn-icone" id="btn-config" title="Configurações">⚙</button>
</header>

<div class="corpo">
  <aside class="sidebar" id="abas">
    <div class="sidebar-rotulo">Navegação</div>
    <button class="aba ativa" data-tela="dashboard">Dashboard</button>
    <button class="aba" data-tela="propostas">Propostas</button>
    <button class="aba" data-tela="consultores">Consultores</button>
    <button class="aba" data-tela="analise">Análise</button>
    <button class="aba" data-tela="relatorio">Relatório Diretoria</button>
  </aside>

  <main>
    <section id="tela-dashboard" class="tela"></section>
    <section id="tela-propostas" class="tela oculta"></section>
    <section id="tela-consultores" class="tela oculta"></section>
    <section id="tela-analise" class="tela oculta"></section>
    <section id="tela-relatorio" class="tela oculta"></section>
  </main>
</div>
```

Notas:
- `id="abas"` fica no `<aside>` para o listener de `app.js` continuar funcionando sem mudança.
- O emoji 🌡️ do logo permanece (a restrição "sem emojis" vale para os itens de navegação).
- Nada muda do `<div id="modal-fundo">` para baixo.

- [ ] **Step 2: Atualizar `public/styles.css`**

2a. Na seção `/* ===== Topo ===== */`, **remover** as regras `.abas` e `.aba`/`.aba:hover`/`.aba.ativa` (linhas 92–99 atuais) e **adicionar** o espaçador. A regra de `:focus-visible` (linha 100) permanece como está. O bloco do topo fica:

```css
/* ===== Topo ===== */
.topo {
  display: flex; align-items: center; gap: 28px;
  background: var(--marca-solida); color: #fff;
  padding: 10px 24px; height: 58px;
  position: sticky; top: 0; z-index: 20;
}
.topo-marca { display: flex; align-items: center; gap: 10px; }
.topo-logo { font-size: 26px; }
.topo h1 { font-size: 17px; font-weight: 650; letter-spacing: .2px; }
.topo-sub { font-size: 11px; opacity: .75; text-transform: uppercase; letter-spacing: 1px; }
.topo-espaco { flex: 1; }
.aba:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid #7fb2d9; outline-offset: 1px;
}
```

2b. Logo após o bloco do topo (antes de `main {`), adicionar a seção da sidebar:

```css
/* ===== Corpo: sidebar + conteúdo ===== */
.corpo { display: flex; align-items: flex-start; }
.sidebar {
  width: 220px; flex-shrink: 0;
  background: var(--cartao); border-right: 1px solid var(--borda);
  padding: 14px 10px;
  position: sticky; top: 58px; height: calc(100vh - 58px);
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
}
.sidebar-rotulo {
  font-size: 10px; font-weight: 650; color: var(--tinta-3);
  text-transform: uppercase; letter-spacing: .08em;
  padding: 4px 12px 6px;
}
.sidebar .aba {
  display: block; width: 100%; text-align: left;
  background: transparent; border: none; color: var(--tinta-2);
  padding: 9px 12px; font-size: 13.5px; font-weight: 500;
  border-radius: 6px; cursor: pointer; font-family: inherit;
}
.sidebar .aba:hover { background: var(--marca-claro); color: var(--tinta); }
.sidebar .aba.ativa { background: var(--marca-claro); color: var(--marca); font-weight: 650; }
```

2c. Ajustar a regra de `main` (linha 109 atual) para conviver com o flex:

```css
main { flex: 1; min-width: 0; max-width: 1280px; margin: 0 auto; padding: 20px 24px 60px; }
```

2d. Atualizar a regra de impressão (última linha do arquivo):

```css
@media print { .topo, .btn, .sidebar { display: none; } }
```

- [ ] **Step 3: Verificar no navegador**

Com o servidor rodando (`PORTA=3051 node server.js` se não estiver no ar):

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3051`
Expected: `200`

No navegador (recarregar http://localhost:3051), conferir:
- Sidebar à esquerda com rótulo "NAVEGAÇÃO" e 5 itens de texto, sem emojis.
- Clique em cada item troca a tela e destaca o item ativo.
- Header sem abas; botões 🌙 e ⚙ à direita funcionando.
- Alternar tema: sidebar legível nos dois temas.
- Rolar uma tela longa (Propostas): sidebar permanece fixa.

- [ ] **Step 4: Rodar testes de backend**

Run: `npm test`
Expected: todos os testes passam (nenhum toca o frontend).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: sidebar de navegacao substitui abas do topo"
```

---

### Task 2: Tela Consultores em cards

**Files:**
- Modify: `public/js/consultores.js` (reescrita do render)
- Modify: `public/styles.css` (classes `rep-*`, `cons-contador`, badges de tipo)

**Interfaces:**
- Consumes: `apiGet('/api/consultores/stats')` — retorna array com `{ id, nome, tipo ('FRANQUEADO' | 'CONSULTOR CLT'), emitidas, fechadas, valorTotal, valorFechado, taxaConversao, ticketMedio, tempoMedioFechamentoDias, paradas }`; helpers globais `fmtMoeda`, `fmtPct`, `esc`, `aviso`, `apiSend`; `Propostas.filtros` + `App.trocarTela('propostas')` para navegação; endpoint `GET /api/consultores/{id}/exportar` (download xlsx) e `POST /api/consultores/importar-atualizacoes`.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Reescrever `public/js/consultores.js`**

Conteúdo completo do arquivo:

```js
const Consultores = {
  ordem: 'valorFechado',
  filtroTipo: '',
  dados: [],

  async carregar() {
    this.dados = await apiGet('/api/consultores/stats');
    this.render();
  },

  iniciais(nome) {
    const partes = String(nome).trim().split(/\s+/);
    return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
  },

  avatarCor(nome) {
    const cores = ['#3e7cb1', '#2e7d46', '#b87503', '#7b5cb8', '#c2503f', '#178f8f'];
    let h = 0;
    for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return cores[h % cores.length];
  },

  render() {
    const tela = document.getElementById('tela-consultores');

    const grupo = tipo => {
      const g = this.dados.filter(c => c.tipo === tipo && c.emitidas > 0);
      const emitidas = g.reduce((s, c) => s + c.emitidas, 0);
      const fechadas = g.reduce((s, c) => s + c.fechadas, 0);
      return {
        n: g.length, emitidas, fechadas,
        valorFechado: g.reduce((s, c) => s + c.valorFechado, 0),
        conversao: emitidas ? (100 * fechadas) / emitidas : 0,
      };
    };
    const fr = grupo('FRANQUEADO');
    const clt = grupo('CONSULTOR CLT');

    const ativos = this.dados.filter(c =>
      c.emitidas > 0 && (!this.filtroTipo || c.tipo === this.filtroTipo));
    const d = [...ativos].sort((a, b) => (b[this.ordem] ?? -1) - (a[this.ordem] ?? -1));
    const maximo = chave => Math.max(1, ...ativos.map(c => c[chave] || 0));
    const maximos = {
      emitidas: maximo('emitidas'), valorTotal: maximo('valorTotal'),
      fechadas: maximo('fechadas'), valorFechado: maximo('valorFechado'),
    };

    const metrica = (c, chave, rotulo, valor, cor) => `
      <div class="rep-metrica">
        <div class="rotulo">${rotulo}</div>
        <div class="valor" style="color:var(${cor})">${valor}</div>
        <div class="rep-barra"><div style="width:${Math.round(100 * (c[chave] || 0) / maximos[chave])}%;background:var(${cor})"></div></div>
      </div>`;

    const opcoesOrdem = [
      ['valorFechado', 'Valor fechado'],
      ['emitidas', 'Emitidas'],
      ['taxaConversao', 'Conversão'],
      ['valorTotal', 'Valor emitido'],
    ];

    tela.innerHTML = `
      <div class="linha-filtros" style="margin-bottom:10px">
        <button class="btn" id="cons-importar">Importar atualizações</button>
        <input type="file" id="cons-arquivo" accept=".xlsx" style="display:none">
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
      <div class="linha-filtros">
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
        <span class="cons-contador">${d.length} consultores</span>
      </div>
      <div class="rep-grade">
        ${d.map(c => `
        <div class="rep-cartao">
          <div class="rep-topo">
            <div class="rep-avatar" style="background:${this.avatarCor(c.nome)}">${this.iniciais(c.nome)}</div>
            <div class="rep-id">
              <div class="rep-nome">${esc(c.nome)}</div>
              <span class="badge ${c.tipo === 'FRANQUEADO' ? 'badge-FRANQUEADO' : 'badge-CLT'}">${c.tipo === 'FRANQUEADO' ? 'Franqueado' : 'CLT'}</span>
            </div>
          </div>
          <div class="rep-metricas">
            ${metrica(c, 'emitidas', 'Emitidas', c.emitidas, '--frio')}
            ${metrica(c, 'valorTotal', 'Valor emitido', fmtMoeda(c.valorTotal), '--frio')}
            ${metrica(c, 'fechadas', 'Fechadas', c.fechadas, '--fechada')}
            ${metrica(c, 'valorFechado', 'Valor fechado', fmtMoeda(c.valorFechado), '--fechada')}
          </div>
          <div class="rep-acoes">
            <button class="btn" data-ver="${c.id}">📋 Ver propostas</button>
            <button class="btn" data-planilha="${c.id}">📊 Gerar planilha</button>
          </div>
        </div>`).join('')}
      </div>
    `;

    document.getElementById('cons-tipo').onchange = e => {
      this.filtroTipo = e.target.value;
      this.render();
    };
    document.getElementById('cons-ordem').onchange = e => {
      this.ordem = e.target.value;
      this.render();
    };

    tela.querySelectorAll('[data-ver]').forEach(btn => {
      btn.onclick = () => {
        Propostas.filtros = { busca: '', filial_id: '', consultor_id: btn.dataset.ver, status: '', etapa: '', termometro: '' };
        App.trocarTela('propostas');
      };
    });
    tela.querySelectorAll('[data-planilha]').forEach(btn => {
      btn.onclick = () => {
        window.location.href = `/api/consultores/${btn.dataset.planilha}/exportar`;
      };
    });

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

Notas:
- Some a tabela, a ordenação por cabeçalho, a seleção por rádio e o estado `selecionado`.
- A ordenação nova é sempre numérica decrescente (todas as 4 opções são números).
- As mini-barras usam o máximo entre os consultores **exibidos** (`ativos`), então mudam com o filtro de tipo — intencional, conforme a spec.
- KPIs de resumo continuam calculados sobre todos os dados, ignorando o filtro.
- Avatar usa paleta fixa de 6 cores sólidas (funcionam com texto branco nos dois temas); hash simples do nome escolhe a cor.

- [ ] **Step 2: Adicionar CSS dos cards em `public/styles.css`**

Adicionar após a seção `/* ===== Tabelas ===== */` (ou logo antes de `/* Badges */`):

```css
/* ===== Consultores: cards ===== */
.cons-contador { margin-left: auto; align-self: center; font-size: 12px; color: var(--tinta-2); }
.rep-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.rep-cartao {
  background: var(--cartao); border: 1px solid var(--borda);
  border-radius: var(--raio); box-shadow: var(--sombra);
  padding: 14px; display: flex; flex-direction: column; gap: 12px;
}
.rep-topo { display: flex; gap: 10px; align-items: flex-start; }
.rep-avatar {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.rep-id { min-width: 0; }
.rep-nome { font-weight: 650; font-size: 13.5px; line-height: 1.3; overflow-wrap: anywhere; }
.rep-id .badge { margin-top: 4px; }
.rep-metricas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rep-metrica { background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px; padding: 8px 10px; min-width: 0; }
.rep-metrica .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: var(--tinta-3); font-weight: 650; }
.rep-metrica .valor { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rep-barra { height: 3px; background: var(--borda); border-radius: 2px; margin-top: 7px; overflow: hidden; }
.rep-barra div { height: 100%; border-radius: 2px; }
.rep-acoes { display: flex; gap: 8px; margin-top: auto; }
.rep-acoes .btn { flex: 1; }
```

E na seção `/* Badges */`, adicionar junto aos demais badges:

```css
.badge-FRANQUEADO { background: var(--marca-claro); color: var(--marca); }
.badge-CLT { background: var(--fechada-fundo); color: var(--fechada); }
```

- [ ] **Step 3: Verificar no navegador**

Recarregar http://localhost:3051 e abrir Consultores:
- Grade de cards com avatar/iniciais, nome, badge de tipo.
- 4 métricas por card com mini-barras proporcionais (azul para emitidas/valor emitido, verde para fechadas/valor fechado).
- Filtro "Tipo" reduz a grade e o contador; KPIs do topo não mudam.
- "Ordenar por" reordena os cards.
- "Ver propostas" abre a tela Propostas filtrada pelo consultor.
- "Gerar planilha" baixa o xlsx do consultor.
- "Importar atualizações" abre o seletor de arquivo direto (sem exigir seleção).
- Alternar tema: cards legíveis nos dois temas.

- [ ] **Step 4: Rodar testes de backend**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add public/js/consultores.js public/styles.css
git commit -m "feat: tela consultores em cards com filtro de tipo e ordenacao"
```
