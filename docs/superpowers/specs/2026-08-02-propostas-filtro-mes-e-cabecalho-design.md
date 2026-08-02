# Propostas: filtro mês/ano, agrupamento por mês e cabeçalho com logo — Especificação de Design

**Data:** 2026-08-02
**Solicitante:** Rodrigo Carvalho (gerente comercial)
**Status:** Aprovado pelo usuário em 2026-08-02

## Objetivo

A tela de Propostas lista todas as propostas do filtro numa única sequência contínua ordenada por data — 67 linhas para um consultor, 452 sem filtro. Não há como isolar um mês nem enxergar onde um mês termina e outro começa. Esta mudança adiciona (1) filtro por mês e ano, (2) separação visual por mês no grid com subtotais e recolher, e (3) troca o cabeçalho do sistema pela logo da Servis.

## Decisões aprovadas

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Formato do filtro | Dois selects independentes: **Mês** e **Ano** | Seletor único `<input type="month">`; intervalo De/Até por mês |
| Data usada | **`data_emissao`** (a coluna DATA do grid), sempre | Alternar para `data_fechamento` quando Status=FECHADA; terceiro select escolhendo o critério |
| Separador no grid | **Faixa destacada** com barra na cor da marca, **clicável para recolher** | Faixa sem recolher; linha divisória discreta |
| Nome do mês | **`JULHO 2026`** — sem barra separando mês e ano | `Julho/2026` com barra |
| Cabeçalho | **Só a logo da Servis**, sem título nem subtítulo | Logo + título; logo + título + subtítulo |

## Escopo

**Dentro:**

- Selects Mês e Ano na barra de filtros da tela Propostas
- Endpoint `GET /api/propostas/anos`
- Parâmetros `mes` e `ano` em `GET /api/propostas`
- Agrupamento por mês no grid de Propostas, com subtotais e recolher
- Cabeçalho de `public/index.html` com a logo

**Fora:**

- Agrupamento nas telas Dashboard, Consultores, Análise e Relatório Diretoria
- Filtro por mês/ano nas outras telas (Dashboard e Consultores já têm De/Até por data)
- `<title>` da aba do navegador (segue "Gestão de Propostas")
- Favicon (segue 🌡️)
- Cabeçalho do PDF do relatório (`public/relatorio-print.html`)

## 1. Filtro Mês + Ano

### Interface

Dois campos novos na `linha-filtros` da tela Propostas, entrando **depois de Origem**, no mesmo padrão visual dos filtros existentes:

- **Mês** — `Todos` (valor `''`), `Janeiro`…`Dezembro` (valores `01`…`12`)
- **Ano** — `Todos` (valor `''`), depois os anos vindos da API em ordem decrescente

Os dois são independentes: só Mês=Junho traz junho de todos os anos; só Ano=2026 traz o ano inteiro; os dois juntos trazem um mês específico. Ambos disparam `listar()` no `change`, como os demais filtros.

Os valores entram em `Propostas.filtros` como `mes` e `ano`. Como `listar()` monta a query descartando valores falsy (`filter(([, v]) => v)`), `Todos` = `''` já sai da querystring sozinho.

### Endpoint dos anos

```
GET /api/propostas/anos  →  ["2026", "2025", "2024"]
```

```sql
SELECT DISTINCT strftime('%Y', data_emissao) ano
FROM propostas
WHERE data_emissao IS NOT NULL AND data_emissao <> ''
ORDER BY ano DESC
```

**Restrição de ordem:** esta rota tem de ser declarada **antes** de `r.get('/propostas/:id', …)` em `src/routes.js`. O Express casa na ordem de declaração — se vier depois, `/propostas/anos` entra em `:id` com `req.params.id === 'anos'` e a resposta vira `404 não encontrada`.

A lista é carregada junto com filiais/consultores/config/clientes no `Promise.all` de `Propostas.carregar()` — sem requisição extra na abertura da tela.

### Filtragem

No SQL, dentro do `GET /propostas` existente, junto dos outros `cond.push`:

```js
if (q.mes) { cond.push("strftime('%m', p.data_emissao) = ?"); params.push(q.mes); }
if (q.ano) { cond.push("strftime('%Y', p.data_emissao) = ?"); params.push(q.ano); }
```

`data_emissao` está gravada em ISO (`2024-11-11`), verificado no banco atual, então `strftime` funciona direto sem conversão.

**Por que no SQL e não em JS:** a linha `67 proposta(s) · R$ 397.876,18` no topo do grid é calculada sobre o array devolvido pelo servidor. Filtrar depois, no cliente, faria o contador e o total divergirem do que está na tela. O único filtro que roda em JS é `busca`, e por um motivo específico já documentado no código (o `LIKE` do SQLite não ignora caixa em acentos).

O `mes` chega como string de dois dígitos (`'07'`) para casar com a saída de `strftime('%m', …)`, que é zero-padded.

## 2. Agrupamento por mês no grid

Feito no cliente, em `listar()` (`public/js/propostas.js`). A query já volta `ORDER BY p.data_emissao DESC, p.id DESC`, então é uma varredura linear sobre a lista — sem ordenação nova e sem segunda requisição.

### Chave e rótulo

- Chave do grupo: os 7 primeiros caracteres de `data_emissao` (`'2026-07'`)
- Rótulo: nome do mês em português, espaço, ano. A string montada em JS é `Julho 2026`; o CSS aplica `text-transform: uppercase`, então na tela lê-se `JULHO 2026`
- Proposta com `data_emissao` nula ou vazia: chave `'sem-data'`, rótulo `Sem data`, sempre no fim da lista. Não existe nenhuma hoje (verificado: 0 registros), mas a coluna aceita nulo.

### A faixa

Uma `<tr class="grupo-mes">` com uma única `<td colspan>` cobrindo todas as colunas, contendo:

```
▾  Julho 2026                              1 proposta · R$ 7.515,46
```

- Seta `▾` (aberto) / `▸` (recolhido) à esquerda
- Rótulo do mês em maiúsculas via CSS (`text-transform: uppercase`), peso 700
- À direita: contagem (`1 proposta` / `5 propostas`) e a soma de `vlr_total` **daquele mês**, formatada com `fmtMoeda`

Estilo: fundo `var(--marca-claro)`, borda esquerda de 3px em `var(--marca)`, `padding: 7px 12px`. Usa os tokens existentes, então funciona nos dois temas sem regra nova.

### Recolher

Clicar na faixa esconde as linhas daquele mês e inverte a seta.

- Estado: `Propostas.mesesRecolhidos`, um `Set` de chaves (`'2026-07'`)
- Sobrevive a trocas de filtro e re-renderizações, porque vive no objeto `Propostas` e `listar()` o consulta ao montar o HTML
- Recarregar a página começa com tudo aberto (não persiste em `localStorage`)
- Um mês recolhido **continua contando** no total do topo do grid: ele está dentro do filtro, apenas não está visível

O agrupamento é sempre ligado — não há botão para desligar. Filtrando um mês só, sobra uma faixa única no topo, que na prática funciona como subtotal do filtro.

### Clique nas linhas

Hoje `listar()` liga `onclick` em `alvo.querySelectorAll('tr[data-id]')`, e a faixa não tem `data-id` — o comportamento correto já sairia por acidente. O seletor passa a ser explícito (`tr.clicavel[data-id]`) para que a proteção seja intencional e não dependa de a faixa continuar sem o atributo.

## 3. Cabeçalho com a logo

`public/index.html:20-31` perde o `<span class="topo-logo">🌡️</span>`, o `<h1>` e o `<span class="topo-sub">`:

```html
<header class="topo">
  <span class="topo-marca">
    <img id="topo-logo" src="img/logo-servis.png" alt="Servis Eletrônica">
  </span>
  <span class="topo-espaco"></span>
  <button class="btn-icone" id="btn-tema" title="Alternar tema claro/escuro">🌙</button>
  <button class="btn-icone" id="btn-config" title="Configurações">⚙</button>
</header>
```

- **Altura:** `height: 30px; width: auto` — mesma altura que o bloco título+subtítulo ocupa hoje, então a barra não muda de altura e o grid não ganha nem perde espaço vertical.
- **Arquivo:** `public/img/logo-servis.png`, fornecido pelo usuário. Não existe ainda; a pasta `public/img/` é criada nesta mudança.
- **Fallback:** um handler de `error` no `<img>` substitui a imagem pelo texto "Gestão de Propostas". Isso permite implementar tudo agora sem deixar o cabeçalho quebrado até o arquivo chegar — quando o PNG for salvo no caminho, ele aparece no próximo recarregamento.
- **Temas:** decidido ao receber o arquivo. Se a logo tiver contraste suficiente sobre a barra nos dois temas, fica uma versão só; se não, entram `logo-servis.png` e `logo-servis-clara.png` alternadas por CSS em `:root[data-theme="dark"]`. Não afeta o resto do design.

As regras `.topo-logo`, `.topo h1` e `.topo-sub` em `public/styles.css:89-91` saem, e entra `.topo-marca img { height: 30px; width: auto; display: block; }`.

## Testes

**Servidor** (`tests/routes.test.js`, padrão `node:test` já usado):

- `GET /api/propostas?mes=06&ano=2026` devolve só propostas emitidas em junho/2026
- `mes` sozinho traz o mesmo mês em anos diferentes; `ano` sozinho traz o ano inteiro
- `mes`/`ano` combinam com os filtros existentes (consultor, status) em vez de substituí-los
- `GET /api/propostas/anos` devolve os anos distintos em ordem decrescente, sem duplicatas
- `GET /api/propostas/anos` **não** é capturado por `/propostas/:id` — este é o teste que trava a regressão de ordem das rotas

**Frontend:** o projeto não tem testes de UI. O agrupamento, o recolher e o cabeçalho são verificados manualmente no navegador, incluindo tema claro e escuro.

## Verificação manual

Subir o servidor (`npm start` ou o `.bat`), abrir `http://localhost:3060`, ir em **Propostas**:

1. Os selects Mês e Ano aparecem depois de Origem; Ano lista 2026, 2025, 2024
2. Sem filtro de mês/ano, o grid mostra as faixas de cada mês em ordem decrescente, com contagem e valor por mês
3. A soma das contagens das faixas bate com o número na linha de contagem do topo
4. Clicar numa faixa recolhe o mês e vira a seta; clicar de novo reabre
5. Trocar um filtro (ex.: Consultor) com um mês recolhido — o mês continua recolhido
6. Selecionar Mês=Junho e Ano=2026 deixa uma faixa só, e o total dela bate com o total do topo
7. Clicar numa linha de proposta abre o formulário; clicar na faixa não abre
8. Alternar o tema — a faixa continua legível nos dois
9. O cabeçalho mostra o texto de fallback enquanto `public/img/logo-servis.png` não existir, e a logo depois que o arquivo for salvo

## Pendência

O arquivo da logo (`public/img/logo-servis.png`) será fornecido pelo usuário. A implementação não depende dele: o fallback cobre a ausência, e a decisão de uma ou duas versões (clara/escura) é tomada quando o arquivo chegar.
