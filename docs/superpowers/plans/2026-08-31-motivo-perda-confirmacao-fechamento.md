# Motivo de Perda / Confirmação de Fechamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao marcar uma proposta como PERDIDA, registrar o motivo (e opcionalmente o concorrente); ao marcar como FECHADA, confirmar/ajustar o valor final antes de gravar.

**Architecture:** Duas colunas novas em `propostas` (`motivo_perda`, `concorrente_nome`), graváveis via o mesmo pipeline de update já existente (`atualizarProposta`/`CAMPOS_PROPOSTA`), limpas automaticamente por `sincronizarFechamento` quando a proposta reabre. No front-end, os dois pontos que hoje fazem `PUT` direto (botões rápidos "Marcar como fechada/perdida" e "Salvar alterações" quando o status muda para um desses dois) passam a abrir um mini-formulário de confirmação dentro do modal existente (`#modal-caixa`), no mesmo padrão do modal de importação de CSV: `Cancelar` volta para a tela da proposta sem gravar nada; `Confirmar` envia o `PUT` com os campos extras.

**Tech Stack:** Node.js + better-sqlite3 (`src/db.js`, `src/parse.js`, `src/propostaUpdate.js`), `node:test` para os testes de backend, JS puro sem build step no front-end (`public/js/propostas.js`).

**Spec:** Sem doc de spec formal — o design foi aprovado em conversa e está registrado na memória `propostas-perda-fechamento-design` (resumo abaixo, já verificado contra o código atual em 2026-08-31).

## Global Constraints

- Validação (motivo obrigatório; nome do concorrente obrigatório se a caixa "perdida para outra empresa" estiver marcada) fica **só no front-end**, como já é o padrão de todo o formulário de proposta — não adicionar validação no backend.
- A confirmação de fechamento grava o valor em `vlr_total` (o campo usado no dashboard/relatórios), nunca em `vlr_total_com_desconto` (que é exclusivo da importação do CSV).
- Os dois mini-formulários só aparecem quando a proposta **já existe** (não no fluxo de "Nova proposta") e só quando o status **muda para** PERDIDA/FECHADA — se a proposta já estava nesse status e só outros campos mudaram, salva direto sem mini-formulário.
- Front-end não tem suíte de testes de UI neste projeto — a Task 5 é testada manualmente, não com testes automatizados.

---

### Task 1: Colunas `motivo_perda` e `concorrente_nome`

**Files:**
- Modify: `src/db.js:88-96` (`MIGRACOES_PROPOSTAS`)
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: colunas `motivo_perda TEXT` e `concorrente_nome TEXT` na tabela `propostas`, adicionadas tanto em banco novo (`CREATE TABLE`... via migração, já que a tabela original não as tem) quanto em banco antigo (via `ALTER TABLE` na função `migrar`).

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar ao final de `tests/db.test.js`:

```javascript
test('propostas tem colunas de motivo de perda e concorrente', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  for (const c of ['motivo_perda', 'concorrente_nome']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve existir`);
  }
});
```

E, no teste `'openDb migra banco antigo sem colunas de custo'` (por volta da linha 66), adicionar `'motivo_perda', 'concorrente_nome'` à lista de colunas verificadas:

```javascript
  for (const c of ['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
                   'vlr_desconto', 'vlr_total_com_desconto', 'motivo_perda', 'concorrente_nome']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve ser adicionada na migração`);
  }
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `node --test tests/db.test.js`
Expected: FAIL — `coluna motivo_perda deve existir` (e o mesmo para o teste de migração de banco antigo).

- [ ] **Step 3: Implementar a migração**

Em `src/db.js`, dentro de `MIGRACOES_PROPOSTAS` (linha 88-96):

```javascript
const MIGRACOES_PROPOSTAS = {
  custo_dep01: 'REAL',
  roi_dep01: 'REAL',
  custo_dep02: 'REAL',
  roi_dep02: 'REAL',
  origem: 'TEXT',
  vlr_desconto: 'REAL DEFAULT 0',
  vlr_total_com_desconto: 'REAL DEFAULT 0',
  motivo_perda: 'TEXT',
  concorrente_nome: 'TEXT',
};
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `node --test tests/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: adiciona colunas motivo_perda e concorrente_nome em propostas"
```

---

### Task 2: Limpar motivo/concorrente ao reabrir a proposta

**Files:**
- Modify: `src/parse.js:92-104` (`sincronizarFechamento`)
- Test: `tests/parse.test.js`

**Interfaces:**
- Consumes: nenhuma interface nova — só estende o comportamento de `sincronizarFechamento(dados, hoje)` já testado em `tests/parse.test.js`.
- Produces: `sincronizarFechamento` agora também zera `dados.motivo_perda` e `dados.concorrente_nome` quando `dados.status === 'ATIVA'`.

- [ ] **Step 1: Escrever o teste (falhando)**

No teste `'sincronizarFechamento preenche data e etapa ao fechar (regressão do dashboard)'` em `tests/parse.test.js`, no bloco "Reabrir limpa a data e a etapa de encerramento" (linha 73-77), estender o objeto de entrada e as asserções:

```javascript
  // Reabrir limpa a data, a etapa de encerramento e o motivo/concorrente de perda
  const reaberta = {
    status: 'ATIVA', data_fechamento: '2026-06-01', etapa: 'FECHADO',
    motivo_perda: 'PREÇO', concorrente_nome: 'CONCORRENTE X',
  };
  sincronizarFechamento(reaberta, '2026-07-10');
  assert.equal(reaberta.data_fechamento, null);
  assert.equal(reaberta.etapa, null);
  assert.equal(reaberta.motivo_perda, null);
  assert.equal(reaberta.concorrente_nome, null);
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `node --test tests/parse.test.js`
Expected: FAIL — `reaberta.motivo_perda` seria `'PREÇO'` (undefined vs null), não `null`.

- [ ] **Step 3: Implementar a limpeza**

Em `src/parse.js`, dentro do ramo `else if (dados.status === 'ATIVA')` de `sincronizarFechamento` (linha 99-102):

```javascript
  } else if (dados.status === 'ATIVA') {
    dados.data_fechamento = null;
    if (dados.etapa === 'FECHADO' || dados.etapa === 'PERDIDO') dados.etapa = null;
    dados.motivo_perda = null;
    dados.concorrente_nome = null;
  }
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `node --test tests/parse.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parse.js tests/parse.test.js
git commit -m "feat: limpa motivo_perda e concorrente_nome ao reabrir proposta"
```

---

### Task 3: Gravar motivo_perda/concorrente_nome via PUT

**Files:**
- Modify: `src/propostaUpdate.js:3-11` (`CAMPOS_PROPOSTA`)
- Test: `tests/propostaUpdate.test.js`

**Interfaces:**
- Consumes: `sincronizarFechamento` da Task 2 (já importado em `propostaUpdate.js:1`).
- Produces: `atualizarProposta(db, id, dados, hoje)` agora aceita e grava `motivo_perda`/`concorrente_nome` quando presentes em `dados`.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar ao final de `tests/propostaUpdate.test.js`:

```javascript
test('atualizarProposta grava motivo_perda e concorrente_nome', () => {
  const { db, id } = dbComProposta();
  const r = atualizarProposta(db, id, {
    status: 'PERDIDA', motivo_perda: 'PREÇO', concorrente_nome: 'CONCORRENTE X',
  }, '2026-07-10');
  assert.equal(r.changes, 1);
  const p = db.prepare('SELECT status, etapa, motivo_perda, concorrente_nome FROM propostas WHERE id = ?').get(id);
  assert.equal(p.status, 'PERDIDA');
  assert.equal(p.etapa, 'PERDIDO');
  assert.equal(p.motivo_perda, 'PREÇO');
  assert.equal(p.concorrente_nome, 'CONCORRENTE X');
});

test('atualizarProposta limpa motivo_perda e concorrente_nome ao reabrir', () => {
  const { db, id } = dbComProposta();
  atualizarProposta(db, id, {
    status: 'PERDIDA', motivo_perda: 'PREÇO', concorrente_nome: 'CONCORRENTE X',
  }, '2026-07-10');
  atualizarProposta(db, id, { status: 'ATIVA' }, '2026-07-11');
  const p = db.prepare('SELECT motivo_perda, concorrente_nome FROM propostas WHERE id = ?').get(id);
  assert.equal(p.motivo_perda, null);
  assert.equal(p.concorrente_nome, null);
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `node --test tests/propostaUpdate.test.js`
Expected: FAIL — `motivo_perda`/`concorrente_nome` não estão em `CAMPOS_PROPOSTA`, então `atualizarProposta` os ignora silenciosamente (ficam `null` no banco por não terem sido gravados, então o primeiro teste falha).

- [ ] **Step 3: Implementar**

Em `src/propostaUpdate.js`, adicionar as duas colunas a `CAMPOS_PROPOSTA` (linha 3-11):

```javascript
const CAMPOS_PROPOSTA = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'vlr_comodato', 'vlr_serv_adicional', 'vlr_mensal', 'vlr_taxa_adesao',
  'vlr_venda', 'vlr_instalacao', 'vlr_serv_especial', 'vlr_total', 'consultor_id',
  'descricao', 'observacao', 'termometro', 'proxima_data_contato',
  'marcada_relatorio', 'valor_minimo_fechamento',
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
  'vlr_desconto', 'vlr_total_com_desconto',
  'motivo_perda', 'concorrente_nome',
];
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `node --test tests/propostaUpdate.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/propostaUpdate.js tests/propostaUpdate.test.js
git commit -m "feat: grava motivo_perda e concorrente_nome no update de proposta"
```

---

### Task 4: Reforçar teste — importação do CSV não mexe em motivo_perda/concorrente_nome

**Files:**
- Modify: `tests/csvPropostas.test.js` (teste `'aplicar corrige o valor e preserva todo o acompanhamento do app'`, por volta da linha 189-215)

**Interfaces:**
- Consumes: nenhuma — é só uma extensão de um teste já existente, confirmando que `aplicarImportacaoCsv` (que já não inclui `status`/`etapa` no `dados` de propostas existentes — ver `src/csvPropostas.js:198-201`) também não grava por engano os dois campos novos, já que eles nunca aparecem no `dados` construído por `planejarImportacaoCsv`.

- [ ] **Step 1: Ler o teste atual para achar o ponto exato de inserção**

Abrir `tests/csvPropostas.test.js` ao redor da linha 191-197 (o `INSERT INTO propostas` de setup do teste) e da linha 204-215 (as asserções de "preservado").

- [ ] **Step 2: Estender o teste**

No `INSERT INTO propostas` de setup (linha 191-197), acrescentar as duas colunas com valores não vazios:

```javascript
  const id = db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    etapa, termometro, proxima_data_contato, data_fechamento, custo_dep01, roi_dep01,
    marcada_relatorio, observacao, vlr_comodato, vlr_serv_adicional, vlr_mensal,
    vlr_total, vlr_total_com_desconto, consultor_id, motivo_perda, concorrente_nome)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PERDIDA','PERDIDO','QUENTE',
    '2026-08-10','2026-07-30', 500, 12, 1, 'ANOTACAO DO APP',
    3383.15, 35, 3418.15, 3000, 3000, 1, 'PREÇO', 'CONCORRENTE X')`).run().lastInsertRowid;
```

E, junto das asserções de "preservado" (logo após `assert.equal(p.etapa, 'PERDIDO');`, linha 207):

```javascript
  assert.equal(p.motivo_perda, 'PREÇO');           // preservado
  assert.equal(p.concorrente_nome, 'CONCORRENTE X'); // preservado
```

- [ ] **Step 3: Rodar o teste para confirmar que passa (sem mudança de código de produção)**

Run: `node --test tests/csvPropostas.test.js`
Expected: PASS — nenhuma mudança em `src/csvPropostas.js` é necessária; este teste só documenta e trava o comportamento que já existe.

- [ ] **Step 4: Commit**

```bash
git add tests/csvPropostas.test.js
git commit -m "test: reforça que importação do CSV preserva motivo_perda e concorrente_nome"
```

---

### Task 5: Mini-formulários de confirmação no front-end

**Files:**
- Modify: `public/js/propostas.js`

**Interfaces:**
- Consumes: `App.abrirModal()`/`App.fecharModal()` (`public/js/app.js`), `apiSend`/`aviso` (`public/js/api.js`), `esc`/`hojeIso` (`public/js/format.js`) — todas já usadas em `propostas.js`. Endpoint `PUT /api/propostas/:id` já aceita `motivo_perda`/`concorrente_nome`/`vlr_total` após a Task 3.
- Produces: `Propostas.abrirConfirmarPerda(p, extra)` e `Propostas.abrirConfirmarFechamento(p, extra)` — `extra` é um objeto com os demais campos do `PUT`: `{}` quando disparado pelos botões rápidos (a data de fechamento cai no padrão "hoje"), ou o resultado completo de `coletar()` quando disparado pelo "Salvar alterações".

- [ ] **Step 1: Adicionar a lista de motivos de perda no topo do arquivo**

Em `public/js/propostas.js`, logo após a linha 12 (`const CAMPOS_CUSTO = [...]`):

```javascript
const MOTIVOS_PERDA = [
  'PREÇO', 'PRAZO', 'CONCORRÊNCIA', 'CLIENTE DESISTIU',
  'SEM RETORNO DO CLIENTE', 'ORÇAMENTO INTERNO', 'OUTRO',
];
```

- [ ] **Step 2: Adicionar os dois métodos de confirmação ao objeto `Propostas`**

Inserir estes dois métodos logo antes do fechamento do objeto `Propostas` (antes da linha `};` final, hoje linha 390 — ficam depois de `abrirForm`):

```javascript
  abrirConfirmarPerda(p, extra) {
    const caixa = document.getElementById('modal-caixa');
    caixa.innerHTML = `
      <div class="modal-titulo">
        <h2>Confirmar perda — ${esc(p.numero)} · ${esc(p.cliente)}</h2>
        <button class="btn" id="cf-fechar-modal">✕</button>
      </div>
      <div class="form-grade">
        <div class="campo col-2"><label>Motivo da perda *</label><select id="cf-motivo">
          <option value="">Selecione</option>
          ${MOTIVOS_PERDA.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
        </select></div>
        <div class="campo col-2" id="cf-motivo-outro-wrap" hidden>
          <label>Descreva o motivo *</label><input id="cf-motivo-outro">
        </div>
        <div class="campo col-2">
          <label><input type="checkbox" id="cf-concorrente-check"> Perdida para outra empresa</label>
        </div>
        <div class="campo col-2" id="cf-concorrente-wrap" hidden>
          <label>Nome do concorrente *</label><input id="cf-concorrente-nome">
        </div>
      </div>
      <div class="acoes-modal">
        <button class="btn btn-primario" id="cf-confirmar">Confirmar perda</button>
        <button class="btn" id="cf-cancelar">Cancelar</button>
      </div>
    `;
    App.abrirModal();

    const motivoSel = document.getElementById('cf-motivo');
    const outroWrap = document.getElementById('cf-motivo-outro-wrap');
    motivoSel.onchange = () => { outroWrap.hidden = motivoSel.value !== 'OUTRO'; };

    const concCheck = document.getElementById('cf-concorrente-check');
    const concWrap = document.getElementById('cf-concorrente-wrap');
    concCheck.onchange = () => { concWrap.hidden = !concCheck.checked; };

    const voltar = () => this.abrirForm(p);
    document.getElementById('cf-fechar-modal').onclick = voltar;
    document.getElementById('cf-cancelar').onclick = voltar;

    document.getElementById('cf-confirmar').onclick = async () => {
      const motivo = motivoSel.value;
      if (!motivo) return aviso('Selecione o motivo da perda.', true);
      const motivoOutro = document.getElementById('cf-motivo-outro').value.trim();
      if (motivo === 'OUTRO' && !motivoOutro) return aviso('Descreva o motivo da perda.', true);
      const concorrenteNome = document.getElementById('cf-concorrente-nome').value.trim();
      if (concCheck.checked && !concorrenteNome) return aviso('Informe o nome do concorrente.', true);

      try {
        await apiSend('PUT', `/api/propostas/${p.id}`, {
          ...extra, status: 'PERDIDA', etapa: 'PERDIDO',
          motivo_perda: motivo === 'OUTRO' ? motivoOutro : motivo,
          concorrente_nome: concCheck.checked ? concorrenteNome : '',
        });
        aviso('Proposta marcada como perdida.');
        App.fecharModal(); App.recarregarTela();
      } catch (e) { aviso(e.message, true); }
    };
  },

  abrirConfirmarFechamento(p, extra) {
    const caixa = document.getElementById('modal-caixa');
    const valorAtual = extra.vlr_total ?? p.vlr_total ?? 0;
    caixa.innerHTML = `
      <div class="modal-titulo">
        <h2>Confirmar fechamento — ${esc(p.numero)} · ${esc(p.cliente)}</h2>
        <button class="btn" id="cf-fechar-modal">✕</button>
      </div>
      <div class="form-grade">
        <div class="campo"><label>Valor fechado (R$) *</label>
          <input type="number" step="0.01" min="0" id="cf-valor" value="${valorAtual}"></div>
      </div>
      <div class="acoes-modal">
        <button class="btn btn-primario" id="cf-confirmar">Confirmar fechamento</button>
        <button class="btn" id="cf-cancelar">Cancelar</button>
      </div>
    `;
    App.abrirModal();

    const voltar = () => this.abrirForm(p);
    document.getElementById('cf-fechar-modal').onclick = voltar;
    document.getElementById('cf-cancelar').onclick = voltar;

    document.getElementById('cf-confirmar').onclick = async () => {
      const valorInput = document.getElementById('cf-valor');
      const valor = Number(valorInput.value);
      if (valorInput.value === '' || Number.isNaN(valor) || valor < 0) {
        return aviso('Informe um valor fechado válido.', true);
      }
      try {
        await apiSend('PUT', `/api/propostas/${p.id}`, {
          ...extra, status: 'FECHADA', etapa: 'FECHADO',
          data_fechamento: extra.data_fechamento || hojeIso(),
          vlr_total: valor,
        });
        aviso('Proposta marcada como fechada. Parabéns!');
        App.fecharModal(); App.recarregarTela();
      } catch (e) { aviso(e.message, true); }
    };
  },
```

- [ ] **Step 3: Trocar os botões rápidos para abrir a confirmação em vez de gravar direto**

Em `public/js/propostas.js`, substituir o bloco `if (!nova)` que liga `f-fechar-negocio` e `f-perder` (linhas 349-365 atuais):

```javascript
    if (!nova) {
      const btnFecharNeg = document.getElementById('f-fechar-negocio');
      if (btnFecharNeg) btnFecharNeg.onclick = () => this.abrirConfirmarFechamento(p, {});
      const btnPerder = document.getElementById('f-perder');
      if (btnPerder) btnPerder.onclick = () => this.abrirConfirmarPerda(p, {});
```

(o restante do bloco `if (!nova) { ... }` — `f-excluir` e `ct-add` — permanece igual, sem mudanças.)

- [ ] **Step 4: Interceptar "Salvar alterações" quando o status muda para PERDIDA/FECHADA**

No handler de `f-salvar` (linhas 335-347 atuais), inserir a checagem logo após a validação de campos obrigatórios e antes do `PUT`/`POST`:

```javascript
    document.getElementById('f-salvar').onclick = async () => {
      try {
        const dados = coletar();
        if (!dados.numero || !dados.cliente || !dados.data_emissao) {
          return aviso('Preencha nº da proposta, data e cliente.', true);
        }
        if (!nova && dados.status !== p.status) {
          if (dados.status === 'PERDIDA') return this.abrirConfirmarPerda(p, dados);
          if (dados.status === 'FECHADA') return this.abrirConfirmarFechamento(p, dados);
        }
        if (nova) await apiSend('POST', '/api/propostas', dados);
        else await apiSend('PUT', `/api/propostas/${p.id}`, dados);
        aviso(nova ? 'Proposta criada.' : 'Proposta salva.');
        App.fecharModal();
        App.recarregarTela();
      } catch (e) { aviso(e.message, true); }
    };
```

- [ ] **Step 5: Testar manualmente**

1. Iniciar o app (`npm start` ou como já é feito neste projeto) e abrir uma proposta ATIVA existente.
2. Clicar em "Marcar como perdida": deve abrir o mini-formulário, não gravar direto.
   - Clicar "Confirmar perda" sem selecionar motivo → aviso de erro, nada é gravado.
   - Selecionar "OUTRO" sem preencher o texto → aviso de erro.
   - Marcar "Perdida para outra empresa" sem preencher o nome → aviso de erro.
   - Preencher tudo corretamente e confirmar → proposta fica PERDIDA, motivo e concorrente gravados (conferir reabrindo a proposta).
   - Clicar "Cancelar" no mini-formulário → volta para a tela da proposta, status continua ATIVA.
3. Clicar em "Marcar como fechada": deve abrir o mini-formulário com o valor atual pré-preenchido, editável.
   - Alterar o valor e confirmar → proposta fica FECHADA com `vlr_total` atualizado.
4. Em uma proposta ATIVA, mudar o campo "Status" para PERDIDA (ou FECHADA) e clicar "Salvar alterações" → deve abrir o mesmo mini-formulário (não salvar direto).
5. Em uma proposta já PERDIDA, editar só a observação e salvar → deve salvar direto, sem abrir mini-formulário (o status não mudou).
6. Reabrir uma proposta PERDIDA (mudar status para ATIVA e salvar) → motivo e concorrente devem sumir do registro (conferir no banco ou reabrindo o formulário).

- [ ] **Step 6: Commit**

```bash
git add public/js/propostas.js
git commit -m "feat: mini-formularios de confirmacao ao marcar proposta como perdida ou fechada"
```
