# Planilha de acompanhamento por consultor — Design

Data: 2026-07-10

## Objetivo

Na tela Consultores, selecionar um consultor e:
1. Gerar uma planilha `.xlsx` com as propostas ativas dele, para enviar por e-mail/WhatsApp
   e ele preencher status, etapa, termômetro e um contato novo.
2. Reimportar essa planilha preenchida, atualizando as propostas correspondentes e
   registrando os contatos informados.

Fora de escopo: alterar o import da planilha principal (`Modelo/RELAÇÃO...xlsx`), criar/excluir
propostas ou consultores por essa via, ou validar dropdown na planilha (a biblioteca `xlsx`
livre não suporta data validation — a orientação de valores aceitos fica numa aba à parte).

## Mudanças por camada

### 1. `src/consultorPlanilha.js` (novo)

- `gerarPlanilhaConsultor(db, consultorId)` → busca
  `SELECT * FROM propostas WHERE consultor_id = ? AND status = 'ATIVA'`, monta um workbook
  `xlsx` com duas abas:
  - **PROPOSTAS**: colunas `ID | Nº proposta | Cliente | Filial | Valor total | Status |
    Etapa | Termômetro | Data novo contato | Anotação do contato | Próximo contato`.
    As três últimas ficam vazias (o consultor só preenche se for registrar contato).
    `ID` é a chave interna usada na reimportação — não é removida nem travada, só uma
    coluna comum no fim seria mais visível; mantém no início por simplicidade.
  - **INSTRUÇÕES**: texto com os valores aceitos (`Status`: ATIVA/FECHADA/PERDIDA;
    `Termômetro`: QUENTE/MORNO/FRIO ou vazio; datas em `dd/mm/aaaa`).
  - Retorna um `Buffer` (`XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`).

- `importarAtualizacoesConsultor(db, buffer, hoje)` → lê a aba PROPOSTAS do buffer recebido.
  Para cada linha:
  - Ignora se `ID` não corresponde a uma proposta existente (`naoEncontradas++`).
  - Valida `Status` (uppercase/trim) contra `['ATIVA', 'FECHADA', 'PERDIDA']`; fora disso,
    mantém o valor atual (não altera). Mesma regra para `Termômetro` contra
    `['QUENTE', 'MORNO', 'FRIO']` — vazio limpa o campo.
  - `Etapa` é aceita como texto livre (uppercase/trim), igual ao comportamento do import
    principal (`mapEtapa` em `src/parse.js`) — sem lista fechada.
  - Monta um objeto só com os campos presentes/válidos e passa por `sincronizarFechamento`
    (`src/parse.js`) antes de gravar, para manter etapa/data de fechamento coerentes quando
    o status muda — a mesma função já usada pelo `PUT /api/propostas/:id`.
  - Se `Data novo contato` estiver preenchida, insere em `contatos` (data, anotação,
    próximo_contato) e atualiza `propostas.proxima_data_contato` quando `Próximo contato`
    vier preenchido — mesma lógica do `POST /api/propostas/:id/contatos` existente.
  - Conta `atualizadas` (proposta com algum campo alterado) e `contatosAdicionados`.
  - Roda dentro de uma `db.transaction()`, como o import principal.
  - Retorna `{ atualizadas, contatosAdicionados, naoEncontradas }`.

### 2. `src/routes.js`

- Extrai a lógica de atualização de proposta do handler `PUT /api/propostas/:id` para uma
  função `atualizarProposta(db, id, dados, hoje)` reutilizável — usada pelo `PUT` e pela
  reimportação, evitando duplicar a regra de `sincronizarFechamento` + `UPDATE`.
- `GET /api/consultores/:id/exportar` → chama `gerarPlanilhaConsultor`, define
  `Content-Disposition: attachment; filename="<consultor>-propostas-<AAAA-MM-DD>.xlsx"` e
  envia o buffer. 404 se o consultor não existir.
- `POST /api/consultores/importar-atualizacoes` → recebe `{ arquivo: <base64> }` no corpo
  JSON, decodifica (`Buffer.from(arquivo, 'base64')`), chama `importarAtualizacoesConsultor`
  e devolve o resumo. Erros de leitura (arquivo corrompido/aba ausente) voltam como 400.

### 3. `public/js/consultores.js`

- Nova coluna de rádio (`<input type="radio" name="consultor-sel">`) no início de cada
  linha da tabela, só para seleção — não dispara a navegação para Propostas que já existe
  no clique do resto da linha (`stopPropagation` no clique do rádio).
- Barra de ação acima da tabela com dois botões, habilitados só com um consultor
  selecionado:
  - **Gerar planilha do consultor** → `window.location.href =
    '/api/consultores/' + id + '/exportar'` (download direto, sem JS de blob).
  - **Importar atualizações** → abre um `<input type="file" accept=".xlsx">` oculto;
    ao escolher o arquivo, lê como base64 (`FileReader.readAsDataURL`, removendo o prefixo
    `data:...;base64,`) e chama `apiSend('POST', '/api/consultores/importar-atualizacoes',
    { arquivo })`. Mostra o resumo retornado via `aviso()` e recarrega a tela (`App.recarregarTela()`)
    para refletir os novos valores/contatos.

## Fora de escopo

Dropdown de validação na planilha, exportar propostas fechadas/perdidas, importar novas
propostas ou consultores por essa via, proteção/trava de células na planilha.

## Testes

- `gerarPlanilhaConsultor`: gera aba PROPOSTAS só com propostas ATIVA do consultor pedido;
  outras propostas/consultores não aparecem.
- `importarAtualizacoesConsultor`:
  - Atualiza status/etapa/termômetro de uma proposta existente pelo `ID`.
  - Ignora `Status`/`Termômetro` com valor fora da lista aceita (mantém o atual).
  - Linha com `Data novo contato` preenchida insere em `contatos` e atualiza
    `proxima_data_contato`; linha sem essas colunas não insere contato.
  - `ID` inexistente é contado em `naoEncontradas` e não derruba o processamento das
    demais linhas.
  - Mudar `Status` para `FECHADA` sem `data_fechamento` aplica a mesma regra de
    `sincronizarFechamento` (preenche com a data de hoje, etapa vira `FECHADO`).
- Rota `GET /api/consultores/:id/exportar` retorna 404 para consultor inexistente.
