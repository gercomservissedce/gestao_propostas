# Relatório Diretoria — Resumo por selecionadas + Custo/ROI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No Relatório Diretoria, o resumo do pipeline e a tabela de propostas passam
a refletir só as propostas selecionadas (não mais o pipeline inteiro), com dois cards
novos — Custo total e Taxa de ROI — e colunas de Custo/ROI por proposta, tanto na
tela de seleção quanto no PDF/prévia.

**Architecture:** Mudança 100% front-end, em dois arquivos independentes que já têm
suas próprias cópias de helpers de formatação (`public/relatorio-print.html` é uma
página HTML autônoma com `<script>` inline; `public/js/relatorio.js` é um módulo da
SPA que já usa `public/js/format.js`). Nenhum endpoint novo — todos os campos usados
(`custo_dep01`, `custo_dep02`, `vlr_mensal`, `valor_minimo_fechamento`, `termometro`,
`vlr_total`) já vêm em `GET /api/propostas`. A página de impressão para de chamar
`/api/dashboard` e passa a calcular tudo (incluindo a previsão ponderada e o
agrupamento por termômetro) no cliente, a partir da lista de selecionadas + `/api/config`.

## Global Constraints

- Custo (por proposta) = `custo_dep01 + custo_dep02` (ambos podem ser `null`, tratar
  como 0).
- ROI (por proposta) = `custo ÷ vlr_mensal`, em meses, formatado como `"X,X meses"`;
  se `vlr_mensal` for 0/`null`, mostrar `"—"`.
- Taxa de ROI agregada (cards e rodapé de tabela) = (soma dos custos das
  selecionadas) ÷ (soma das mensalidades das selecionadas), mesma formatação/regra de
  `"—"`.
- Previsão ponderada = `vlr_total × probabilidade do termômetro / 100` (probabilidades
  de `/api/config`), somada só sobre as selecionadas.
- Sem mudança de backend — nenhum arquivo em `src/` é tocado neste plano.
- Fora de escopo: o resumo simples no topo da tela de seleção
  (`.relatorio-resumo` em `public/js/relatorio.js`) não muda.

---

### Task 1: Página de impressão/PDF (`public/relatorio-print.html`)

**Files:**
- Modify: `public/relatorio-print.html`

**Interfaces:**
- Consumes: `GET /api/propostas?status=ATIVA&marcadas=1` (já existente) e
  `GET /api/config` (já existente, usado hoje só na tela de configurações — mesma
  rota, mesmo formato `{ prob_quente, prob_morno, prob_frio, dias_alerta }`).
- Produces: nenhuma interface consumida por outro arquivo — é a página final gerada
  em PDF via `src/pdf.js` (que só navega até `/relatorio/print` e espera o elemento
  `#pronto` aparecer — nenhuma mudança necessária ali).

Sem teste automatizado (página HTML autônoma, sem harness de DOM no projeto);
verificação manual no Step 3.

- [ ] **Step 1: Adicionar os helpers de cálculo**

Logo após a linha:

```js
const CORES = { QUENTE: '#c93a2e', MORNO: '#b87503', FRIO: '#3e7cb1', 'NÃO CLASSIFICADA': '#8a8f98' };
```

adicione:

```js
function custoProposta(p) {
  return (p.custo_dep01 || 0) + (p.custo_dep02 || 0);
}
function roiProposta(p) {
  if (!p.vlr_mensal) return null;
  return custoProposta(p) / p.vlr_mensal;
}
function fmtMeses(v) {
  return v == null ? '—' : `${v.toFixed(1).replace('.', ',')} meses`;
}
```

- [ ] **Step 2: Trocar o IIFE inteiro por uma versão que não depende de `/api/dashboard`**

Troque o bloco inteiro (do `(async () => {` até o `})();` que fecha a função,
logo antes de `</script>`):

```js
(async () => {
  const [d, marcadas] = await Promise.all([
    fetch('/api/dashboard').then(r => r.json()),
    fetch('/api/propostas?status=ATIVA&marcadas=1').then(r => r.json()),
  ]);
  const hoje = new Date();
  const dataStr = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;

  const totalOriginal = marcadas.reduce((s, p) => s + (p.vlr_total || 0), 0);
  const totalMinimo = marcadas.reduce((s, p) => s + (p.valor_minimo_fechamento ?? p.vlr_total ?? 0), 0);
  const ordemTerm = ['QUENTE', 'MORNO', 'FRIO', 'NÃO CLASSIFICADA'];
  const term = ordemTerm.map(n => d.termometro.find(t => t.nivel === n)).filter(Boolean);
  const totalTerm = term.reduce((s, t) => s + t.valor, 0) || 1;

  document.getElementById('conteudo').innerHTML = `
    <div class="cabecalho">
      <h1>Relatório para a Diretoria — Propostas Comerciais</h1>
      <div class="sub">Viabilização de fechamentos · emitido em ${dataStr}</div>
    </div>

    <h2>Resumo do pipeline</h2>
    <div class="kpis">
      <div class="kpi"><div class="rotulo">Em negociação</div><div class="valor">${fmtMoeda(d.totalAtivas.valor)}</div><div>${d.totalAtivas.qtde} propostas ativas</div></div>
      <div class="kpi"><div class="rotulo">Previsão ponderada</div><div class="valor">${fmtMoeda(d.previsaoPonderada)}</div><div>pela temperatura das negociações</div></div>
      <div class="kpi"><div class="rotulo">Fechadas no mês</div><div class="valor">${fmtMoeda(d.fechadasMes.valor)}</div><div>${d.fechadasMes.qtde} proposta(s)</div></div>
      <div class="kpi"><div class="rotulo">Taxa de conversão</div><div class="valor">${(d.taxaConversao).toFixed(1).replace('.', ',')}%</div><div>histórico geral</div></div>
    </div>

    <h2>Termômetro do pipeline</h2>
    <div class="regua">
      ${term.map(t => `<div style="flex:${(t.valor / totalTerm).toFixed(4)};background:${CORES[t.nivel]}"></div>`).join('')}
    </div>
    <div class="legenda">
      ${term.map(t => `<span><span class="bolinha" style="background:${CORES[t.nivel]}"></span>${t.nivel.toLowerCase()}: <b>${t.qtde}</b> · ${fmtMoeda(t.valor)}</span>`).join('')}
    </div>

    <h2>Propostas para viabilização (${marcadas.length})</h2>
    ${marcadas.length ? `
    <table>
      <thead><tr>
        <th>Nº</th><th>Cliente</th><th>Filial</th><th>Consultor</th><th>Emissão</th><th>Term.</th>
        <th style="text-align:right">Valor original</th>
        <th style="text-align:right">Valor p/ fechamento</th>
        <th style="text-align:right">Redução</th>
      </tr></thead>
      <tbody>
        ${marcadas.map(p => {
          const minimo = p.valor_minimo_fechamento ?? p.vlr_total ?? 0;
          const dif = (p.vlr_total || 0) - minimo;
          const pct = p.vlr_total ? (100 * dif / p.vlr_total) : 0;
          return `<tr>
            <td>${esc(p.numero)}</td>
            <td>${esc(p.cliente)}</td>
            <td>${esc(p.filial || '')}</td>
            <td>${esc((p.consultor || '—').split(' ').slice(0, 2).join(' '))}</td>
            <td>${fmtData(p.data_emissao)}</td>
            <td>${p.termometro ? `<span class="badge badge-${p.termometro}">${p.termometro}</span>` : '<span class="badge badge-NC">s/ classif.</span>'}</td>
            <td class="num">${fmtMoeda(p.vlr_total)}</td>
            <td class="num">${fmtMoeda(minimo)}</td>
            <td class="num destaque">${fmtMoeda(dif)} (${pct.toFixed(1).replace('.', ',')}%)</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="6">Total</td>
        <td class="num">${fmtMoeda(totalOriginal)}</td>
        <td class="num">${fmtMoeda(totalMinimo)}</td>
        <td class="num destaque">${fmtMoeda(totalOriginal - totalMinimo)} (${totalOriginal ? (100 * (totalOriginal - totalMinimo) / totalOriginal).toFixed(1).replace('.', ',') : '0,0'}%)</td>
      </tr></tfoot>
    </table>
    <div class="nota">
      <b>Solicitação:</b> aprovação dos valores mínimos de fechamento acima, que representam uma redução total de
      <b>${fmtMoeda(totalOriginal - totalMinimo)}</b> sobre os valores originais para viabilizar
      <b>${fmtMoeda(totalMinimo)}</b> em novos contratos.
    </div>` : '<p>Nenhuma proposta marcada para viabilização.</p>'}

    <div class="rodape">Gerado pelo sistema Gestão de Propostas em ${dataStr}.</div>
  `;
  document.title = `Relatório Diretoria ${dataStr}`;
  const pronto = document.createElement('div');
  pronto.id = 'pronto';
  document.body.appendChild(pronto);
})();
```

por:

```js
(async () => {
  const [cfg, marcadas] = await Promise.all([
    fetch('/api/config').then(r => r.json()),
    fetch('/api/propostas?status=ATIVA&marcadas=1').then(r => r.json()),
  ]);
  const hoje = new Date();
  const dataStr = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;

  const totalOriginal = marcadas.reduce((s, p) => s + (p.vlr_total || 0), 0);
  const totalMinimo = marcadas.reduce((s, p) => s + (p.valor_minimo_fechamento ?? p.vlr_total ?? 0), 0);
  const totalCusto = marcadas.reduce((s, p) => s + custoProposta(p), 0);
  const totalMensal = marcadas.reduce((s, p) => s + (p.vlr_mensal || 0), 0);
  const roiAgregado = totalMensal ? totalCusto / totalMensal : null;

  const previsaoPonderada = marcadas.reduce((s, p) => {
    const prob = { QUENTE: cfg.prob_quente, MORNO: cfg.prob_morno, FRIO: cfg.prob_frio }[p.termometro] || 0;
    return s + (p.vlr_total || 0) * prob / 100;
  }, 0);

  const ordemTerm = ['QUENTE', 'MORNO', 'FRIO', 'NÃO CLASSIFICADA'];
  const porTermometro = {};
  for (const p of marcadas) {
    const nivel = p.termometro || 'NÃO CLASSIFICADA';
    const g = porTermometro[nivel] ??= { nivel, qtde: 0, valor: 0 };
    g.qtde++;
    g.valor += p.vlr_total || 0;
  }
  const term = ordemTerm.map(n => porTermometro[n]).filter(Boolean);
  const totalTerm = term.reduce((s, t) => s + t.valor, 0) || 1;

  document.getElementById('conteudo').innerHTML = `
    <div class="cabecalho">
      <h1>Relatório para a Diretoria — Propostas Comerciais</h1>
      <div class="sub">Viabilização de fechamentos · emitido em ${dataStr}</div>
    </div>

    <h2>Resumo do pipeline</h2>
    <div class="kpis">
      <div class="kpi"><div class="rotulo">Em negociação</div><div class="valor">${fmtMoeda(totalOriginal)}</div><div>${marcadas.length} proposta(s) selecionada(s)</div></div>
      <div class="kpi"><div class="rotulo">Previsão ponderada</div><div class="valor">${fmtMoeda(previsaoPonderada)}</div><div>pela temperatura das selecionadas</div></div>
      <div class="kpi"><div class="rotulo">Custo total</div><div class="valor">${fmtMoeda(totalCusto)}</div><div>DEP 01 + DEP 02 das selecionadas</div></div>
      <div class="kpi"><div class="rotulo">Taxa de ROI</div><div class="valor">${fmtMeses(roiAgregado)}</div><div>custo ÷ mensalidades das selecionadas</div></div>
    </div>

    <h2>Termômetro do pipeline</h2>
    <div class="regua">
      ${term.map(t => `<div style="flex:${(t.valor / totalTerm).toFixed(4)};background:${CORES[t.nivel]}"></div>`).join('')}
    </div>
    <div class="legenda">
      ${term.map(t => `<span><span class="bolinha" style="background:${CORES[t.nivel]}"></span>${t.nivel.toLowerCase()}: <b>${t.qtde}</b> · ${fmtMoeda(t.valor)}</span>`).join('')}
    </div>

    <h2>Propostas para viabilização (${marcadas.length})</h2>
    ${marcadas.length ? `
    <table>
      <thead><tr>
        <th>Nº</th><th>Cliente</th><th>Filial</th><th>Consultor</th><th>Emissão</th><th>Term.</th>
        <th style="text-align:right">Valor original</th>
        <th style="text-align:right">Custo</th>
        <th style="text-align:right">ROI</th>
        <th style="text-align:right">Valor p/ fechamento</th>
        <th style="text-align:right">Redução</th>
      </tr></thead>
      <tbody>
        ${marcadas.map(p => {
          const minimo = p.valor_minimo_fechamento ?? p.vlr_total ?? 0;
          const dif = (p.vlr_total || 0) - minimo;
          const pct = p.vlr_total ? (100 * dif / p.vlr_total) : 0;
          return `<tr>
            <td>${esc(p.numero)}</td>
            <td>${esc(p.cliente)}</td>
            <td>${esc(p.filial || '')}</td>
            <td>${esc((p.consultor || '—').split(' ').slice(0, 2).join(' '))}</td>
            <td>${fmtData(p.data_emissao)}</td>
            <td>${p.termometro ? `<span class="badge badge-${p.termometro}">${p.termometro}</span>` : '<span class="badge badge-NC">s/ classif.</span>'}</td>
            <td class="num">${fmtMoeda(p.vlr_total)}</td>
            <td class="num">${fmtMoeda(custoProposta(p))}</td>
            <td class="num">${fmtMeses(roiProposta(p))}</td>
            <td class="num">${fmtMoeda(minimo)}</td>
            <td class="num destaque">${fmtMoeda(dif)} (${pct.toFixed(1).replace('.', ',')}%)</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="6">Total</td>
        <td class="num">${fmtMoeda(totalOriginal)}</td>
        <td class="num">${fmtMoeda(totalCusto)}</td>
        <td class="num">${fmtMeses(roiAgregado)}</td>
        <td class="num">${fmtMoeda(totalMinimo)}</td>
        <td class="num destaque">${fmtMoeda(totalOriginal - totalMinimo)} (${totalOriginal ? (100 * (totalOriginal - totalMinimo) / totalOriginal).toFixed(1).replace('.', ',') : '0,0'}%)</td>
      </tr></tfoot>
    </table>
    <div class="nota">
      <b>Solicitação:</b> aprovação dos valores mínimos de fechamento acima, que representam uma redução total de
      <b>${fmtMoeda(totalOriginal - totalMinimo)}</b> sobre os valores originais para viabilizar
      <b>${fmtMoeda(totalMinimo)}</b> em novos contratos.
    </div>` : '<p>Nenhuma proposta marcada para viabilização.</p>'}

    <div class="rodape">Gerado pelo sistema Gestão de Propostas em ${dataStr}.</div>
  `;
  document.title = `Relatório Diretoria ${dataStr}`;
  const pronto = document.createElement('div');
  pronto.id = 'pronto';
  document.body.appendChild(pronto);
})();
```

- [ ] **Step 3: Verificação manual no navegador**

Rodar `npm test` primeiro (garantir que nenhum teste de backend quebrou — não deve
haver nenhuma mudança de backend nesta task). Depois, com o servidor no ar:
1. Vá em **Relatório Diretoria**, marque 2-3 propostas com `custo_dep01`/`custo_dep02`
   e `vlr_mensal` preenchidos (edite alguma proposta antes se precisar, para ter
   dados de teste).
2. Clique em "Ver prévia no navegador" (abre `/relatorio/print` numa aba nova).
3. Confira que os 4 cards do "Resumo do pipeline" batem com as propostas
   selecionadas (não com o pipeline inteiro): "Em negociação" = soma dos valores
   originais das marcadas; "Custo total" = soma de `custo_dep01+custo_dep02`;
   "Taxa de ROI" = custo total ÷ mensalidades total, em meses.
4. Confira que a barra de termômetro reflete só as propostas marcadas.
5. Confira que a tabela tem as colunas Custo e ROI entre "Valor original" e "Valor
   p/ fechamento", com os valores batendo por proposta, e que o rodapé soma
   corretamente.
6. Desmarque todas as propostas e confira que a página mostra "Nenhuma proposta
   marcada para viabilização" sem erro no console (division-by-zero/`NaN`).

- [ ] **Step 4: Commit**

```bash
git add public/relatorio-print.html
git commit -m "feat: relatorio diretoria mostra resumo e custo/roi das propostas selecionadas"
```

---

### Task 2: Tela de seleção (`public/js/relatorio.js`)

**Files:**
- Modify: `public/js/relatorio.js`

**Interfaces:**
- Consumes: campos `custo_dep01`, `custo_dep02`, `vlr_mensal` já presentes em cada
  proposta retornada por `GET /api/propostas` (nenhuma chamada de API nova).
- Produces: nenhuma interface consumida por outro arquivo — tela final.

Sem teste automatizado; verificação manual no Step 3.

- [ ] **Step 1: Adicionar os helpers de cálculo**

Logo no início do arquivo, antes de `const Relatorio = {`, adicione:

```js
function custoProposta(p) {
  return (p.custo_dep01 || 0) + (p.custo_dep02 || 0);
}
function roiProposta(p) {
  if (!p.vlr_mensal) return null;
  return custoProposta(p) / p.vlr_mensal;
}
function fmtMeses(v) {
  return v == null ? '—' : `${v.toFixed(1).replace('.', ',')} meses`;
}
```

- [ ] **Step 2: Adicionar as colunas Custo e ROI na tabela**

Troque:

```js
            <th></th><th>Nº</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
            <th style="text-align:right">Valor original</th><th style="text-align:right">Valor mín. p/ fechamento</th><th>Termômetro</th>
```

por:

```js
            <th></th><th>Nº</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
            <th style="text-align:right">Valor original</th>
            <th style="text-align:right">Custo</th><th style="text-align:right">ROI</th>
            <th style="text-align:right">Valor mín. p/ fechamento</th><th>Termômetro</th>
```

Troque:

```js
              <td class="num">${fmtMoeda(p.vlr_total)}</td>
              <td class="num"><input class="vlr-min" type="number" step="0.01" min="0"
```

por:

```js
              <td class="num">${fmtMoeda(p.vlr_total)}</td>
              <td class="num">${fmtMoeda(custoProposta(p))}</td>
              <td class="num">${fmtMeses(roiProposta(p))}</td>
              <td class="num"><input class="vlr-min" type="number" step="0.01" min="0"
```

- [ ] **Step 3: Verificação manual no navegador**

Rodar `npm test` primeiro (não deve haver mudança de backend). Depois, na aba
**Relatório Diretoria**, confira que a tabela agora tem as colunas Custo e ROI entre
"Valor original" e "Valor mín. p/ fechamento", com os valores batendo com os campos
de custo/mensalidade de cada proposta (e "—" nas que não têm mensalidade
cadastrada), e que marcar/desmarcar propostas e editar o valor mínimo continuam
funcionando como antes.

- [ ] **Step 4: Commit**

```bash
git add public/js/relatorio.js
git commit -m "feat: colunas de custo e roi na tela de selecao do relatorio diretoria"
```
