# Importação de CSV do ERP para atualizar as propostas

Data: 2026-08-03

## Problema

O banco tem 477 propostas, mas apenas 5 de julho/2026 — o mês corrente está
desatualizado. O ERP exporta a relação completa em CSV
(`RELAÇÃO DAS PROPOSTAS ATUALIZADA 03082026.csv`, 46 linhas de julho/2026), e hoje
não há como carregar esse arquivo: o único importador (`src/importer.js`) lê a
planilha XLSX legada de `Modelo/`, só insere propostas novas e usa um parser de
valores em formato americano, que interpretaria `R$3383,15` como 338315.

Além de faltarem propostas, algumas das que existem estão com valores divergentes
do ERP (a 25675 tem R$ 16.014,93 no banco e R$ 15.980,89 no CSV).

## Objetivo

Uma opção de importação que, a partir do CSV do ERP, insere as propostas que
faltam e corrige os valores das que já existem — **sem destruir o trabalho de
acompanhamento feito no app** (status, etapa, termômetro, contatos, custos).

## Formato do arquivo

UTF-8 com BOM, separador vírgula, campos de texto entre aspas duplas. Cabeçalho:

```
CODFIL,SIGFIL,Nº PROP.,DATA,NOME DO CLIENTE,TIPO NEGOC.,STATUS,DT. FECHADA,
VLR. COMOD.,VLR. SERV. AD.,VLR. MENSAL,VLR.TX.ADESÃO,VLR. VENDA,VLR. INSTAL.,
VLR.SRV.ESP.,VLR. TOTAL,VLR. DESC.,VLR. TOTAL C/DESC.,REPRESENTANTE,
DescricaoProposta,Observacao
```

- Valores em formato brasileiro: `R$3383,15` (vírgula decimal). Vazio = 0.
- Datas: `2026-07-01 00:00:00`. `DT. FECHADA` vem vazia nas propostas em aberto.
- `STATUS` é o vocabulário do ERP (`Analise Cliente` nas 46 linhas), diferente do
  `ATIVA/FECHADA/PERDIDA` do app.
- `SIGFIL` é o nome da filial (`Servis Eletrônica Ceará`), redundante com `CODFIL`.

## Arquitetura

Módulo novo, separando **planejar** de **aplicar**:

- **`src/csv.js`** — `parseCsv(texto)`: devolve um array de objetos usando a
  primeira linha como cabeçalho. Trata campos entre aspas (com vírgula e quebra de
  linha dentro), `""` como aspa escapada, CRLF, BOM e linhas vazias no fim.
- **`src/csvPropostas.js`** — o coração da importação:
  - `planejarImportacaoCsv(db, texto)` → plano; **só lê** o banco.
  - `aplicarImportacaoCsv(db, texto)` → recalcula o plano e grava numa transação.
- **`src/parse.js`** — acrescenta `toNumberBr(v)` e faz `toIsoDate` reconhecer
  `aaaa-mm-dd` com hora opcional.
- **`src/db.js`** — migração das colunas `vlr_desconto` e `vlr_total_com_desconto`.
- **`src/propostaUpdate.js`** — as duas colunas novas entram em `CAMPOS_PROPOSTA`.
- **`src/routes.js`** — `POST /api/importar-csv/previa` e `POST /api/importar-csv`.
- **`public/js/app.js`** — botão e modal de prévia nas Configurações.

Prévia e confirmação usam o mesmo cálculo, então o que a prévia mostra é o que é
gravado. O servidor não guarda estado entre as duas chamadas: o front reenvia o
arquivo ao confirmar.

As propostas existentes são atualizadas por `atualizarProposta()`
(`src/propostaUpdate.js`), já usado pela importação da planilha do consultor. Como
a importação nunca envia `status`, o `sincronizarFechamento()` embutido nessa função
não altera nada — comportamento verificado por teste.

## Regra de-para

| CSV | Banco |
|---|---|
| `CODFIL` (+ `SIGFIL` quando a filial não existe) | `filial_id` |
| `Nº PROP.` | `numero` |
| `DATA` | `data_emissao` |
| `NOME DO CLIENTE` | `cliente` |
| `TIPO NEGOC.` | `tipo_negocio` |
| `REPRESENTANTE` | `consultor_id` |
| `VLR. COMOD.` | `vlr_comodato` |
| `VLR. SERV. AD.` | `vlr_serv_adicional` |
| `VLR. MENSAL` | `vlr_mensal` |
| `VLR.TX.ADESÃO` | `vlr_taxa_adesao` |
| `VLR. VENDA` | `vlr_venda` |
| `VLR. INSTAL.` | `vlr_instalacao` |
| `VLR.SRV.ESP.` | `vlr_serv_especial` |
| `VLR. TOTAL` | `vlr_total` |
| `VLR. DESC.` | `vlr_desconto` (coluna nova) |
| `VLR. TOTAL C/DESC.` | `vlr_total_com_desconto` (coluna nova) |
| `DescricaoProposta` | `descricao` |
| `Observacao` | `observacao` |
| `STATUS`, `DT. FECHADA` | apenas nas propostas novas (ver abaixo) |

`vlr_total` continua sendo o valor bruto. Dashboard, análise e relatórios seguem
usando `vlr_total`, sem mudança de comportamento — as colunas novas apenas
guardam a informação de desconto do ERP.

### Filial e consultor

A proposta é identificada por `filial_id` + `numero` (chave única já existente).

- Filial: busca por `codigo = CODFIL`. Não existindo, cria com
  `tipo = 'FILIAL'` e `estado = SIGFIL`. Filiais existentes não são alteradas
  (os quatro códigos do arquivo — 1001, 1002, 1003, 3001 — já estão no banco com o
  estado preenchido: CEARÁ, AMAZONAS, MARANHÃO, PIAUÍ).
- Consultor: busca por `nome = REPRESENTANTE` (comparação exata, como no importador
  atual). Não existindo, cria com `tipo = 'FRANQUEADO'`. `REPRESENTANTE` vazio
  deixa `consultor_id` nulo.

### Propostas novas

- `status = 'ATIVA'`, `etapa` = `STATUS` do CSV em maiúsculas (`ANALISE CLIENTE`).
- `DT. FECHADA` preenchida → `status = 'FECHADA'`, `etapa = 'FECHADO'`,
  `data_fechamento` = a data.
- `STATUS` contendo `PERDID` ou `CANCEL` → `status = 'PERDIDA'`, `etapa = 'PERDIDO'`.
- `termometro`, `proxima_data_contato`, custos DEP/ROI ficam nulos; nenhum contato
  é criado.

### Propostas existentes

Atualiza apenas os campos abaixo, e somente quando o valor do CSV difere do banco:

`cliente`, `data_emissao`, `tipo_negocio`, `consultor_id`, `vlr_comodato`,
`vlr_serv_adicional`, `vlr_mensal`, `vlr_taxa_adesao`, `vlr_venda`,
`vlr_instalacao`, `vlr_serv_especial`, `vlr_total`, `vlr_desconto`,
`vlr_total_com_desconto`, `descricao`, `observacao`.

`descricao` e `observacao` só são sobrescritas quando o CSV traz texto: campo vazio
no CSV **não apaga** o que foi escrito no app.

**Nunca são tocados:** `status`, `etapa`, `data_fechamento`, `termometro`,
`proxima_data_contato`, `custo_dep01`, `roi_dep01`, `custo_dep02`, `roi_dep02`,
`marcada_relatorio`, `valor_minimo_fechamento`, `origem` e os contatos. É o que
impede a 27149 (marcada PERDIDA no app, ainda `Analise Cliente` no ERP) de voltar
para ATIVA.

### Linhas problemáticas

Não são importadas; aparecem na prévia e no resumo com o número da linha no arquivo
e o motivo:

- `CODFIL`, `Nº PROP.` ou `NOME DO CLIENTE` vazio.
- `DATA` ausente ou inválida (`data_emissao` é NOT NULL no schema).
- Mesma filial + número repetidos dentro do próprio arquivo: a primeira ocorrência
  vale, as seguintes são reportadas como duplicadas.

### Encoding

O arquivo chega em base64 e é decodificado como UTF-8, com o BOM removido. Se o
texto resultante contiver o caractere de substituição (`�`) — export salvo em
ANSI/Windows-1252 —, é redecodificado como latin1.

## Contratos

`planejarImportacaoCsv(db, texto)` devolve:

```js
{
  novas: [{ linha, numero, filial_codigo, cliente, vlr_total, dados }],
  atualizadas: [{ linha, id, numero, cliente,
                  mudancas: [{ campo, de, para }], dados }],
  semMudanca: 0,          // já existem e estão iguais ao CSV
  invalidas: [{ linha, motivo }],
  filiaisNovas: [{ codigo: '4001', nome: 'Servis Eletrônica Bahia' }],
  consultoresNovos: ['NOME'],
}
```

`dados` é o objeto pronto para gravar (nas novas, todas as colunas do INSERT; nas
atualizadas, só as que mudaram). `mudancas` existe para exibição — nela o
representante aparece como `campo: 'consultor'` com o **nome**, não o id.

O representante só é atualizado quando o CSV traz nome: `REPRESENTANTE` vazio não
apaga o consultor da proposta, pela mesma razão de `descricao`/`observacao`.

`aplicarImportacaoCsv(db, texto)` devolve:

```js
{ inseridas: 0, atualizadas: 0, semMudanca: 0, invalidas: 0,
  filiaisCriadas: 0, consultoresCriados: 0 }
```

Ambas lançam erro com mensagem em português quando o arquivo está vazio ou o
cabeçalho não tem as colunas obrigatórias (`CODFIL`, `Nº PROP.`, `DATA`,
`NOME DO CLIENTE`, `VLR. TOTAL`) — a rota converte em HTTP 400 nomeando a coluna
que falta.

### Rotas

- `POST /api/importar-csv/previa` — corpo `{ arquivo: base64 }`, devolve o plano.
- `POST /api/importar-csv` — corpo `{ arquivo: base64 }`, grava e devolve o resumo.

Mesmo padrão de `POST /api/consultores/importar-atualizacoes`. O limite de corpo do
Express já é 10 MB (`server.js`), suficiente para a relação completa.

## Interface

O modal ⚙ Configurações ganha o botão **"Importar CSV do ERP"** ao lado de
"Reimportar planilha", com um `input type="file" accept=".csv"` oculto (padrão da
importação do consultor em `public/js/consultores.js`).

Escolhido o arquivo, o conteúdo do modal passa a ser a prévia:

- Topo com as contagens: *46 novas · 3 a atualizar · 2 sem mudança · 1 inválida*.
- Lista das novas: número, cliente, valor total.
- Lista das atualizações, um item por mudança:
  `25675 — vlr_total: 16.014,93 → 15.980,89`.
- Avisos: filiais e consultores que serão criados; linhas inválidas com linha e
  motivo.
- Botões **Confirmar** (grava, mostra o resumo no aviso e recarrega a tela) e
  **Cancelar** (fecha sem gravar).

Nada é gravado antes do Confirmar.

## Testes

`npm test` (`node --test`):

- **`tests/csv.test.js`** — cabeçalho e linhas; campo entre aspas com vírgula
  dentro; `""` escapado; CRLF; BOM; linha vazia no fim; arquivo só com cabeçalho.
- **`tests/parse.test.js`** (acrescentar) — `toNumberBr`: `R$3383,15` → 3383.15,
  `R$1.234,56` → 1234.56, `""` → 0, `R$0,00` → 0, `1000.50` → 1000.5;
  `toIsoDate('2026-07-01 00:00:00')` → `2026-07-01`, sem quebrar o formato
  `m/d/aaaa` da planilha legada.
- **`tests/csvPropostas.test.js`** (banco `:memory:`) — insere proposta nova com
  etapa `ANALISE CLIENTE`; corrige valor divergente; **preserva status PERDIDA,
  etapa, termômetro, próximo contato e custos DEP/ROI** de proposta existente;
  não apaga `observacao` quando o CSV vem vazio; cria filial e consultor
  inexistentes; reporta linha inválida e duplicada no arquivo; prévia não grava
  nada; idempotência — aplicar duas vezes deixa a segunda execução com
  `inseridas: 0` e `atualizadas: 0`.
- **`tests/routes.test.js`** (acrescentar) — prévia e importação pelas rotas;
  cabeçalho inválido → 400.

## Fora de escopo

- Exportar CSV do app.
- Importar contatos, termômetro ou custos pelo CSV (não existem no arquivo).
- Trazer status/etapa do ERP para propostas já existentes.
- Casar consultor por nome aproximado (a comparação é exata, como hoje).
