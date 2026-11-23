# Perdida → termômetro FRIO + motivo/data de criação na planilha do consultor

Status: aprovado pelo usuário em 2026-11-23 (mudança pequena, design curto).

## Intenção
Proposta perdida deve sempre ficar com termômetro FRIO. A planilha do consultor (exportar/importar)
deve mostrar a data de criação da proposta e o motivo da perda, e incluir as perdidas.

## Já existe (não refazer)
`propostas.motivo_perda` + lista `MOTIVOS_PERDA` em `public/js/propostas.js` (PREÇO, PRAZO, CONCORRÊNCIA,
CLIENTE DESISTIU, SEM RETORNO DO CLIENTE, ORÇAMENTO INTERNO, OUTRO); etapa vira PERDIDO em
`sincronizarFechamento` (`src/parse.js`).

## Não-objetivos
Mudar CSV do ERP, dashboard, relatórios; checkboxes de múltiplos motivos (um motivo por proposta,
lista de seleção); corrigir retroativamente perdidas antigas (só se o usuário pedir ajuste único).

## Abordagens
- **A (escolhida):** forçar FRIO em `sincronizarFechamento`, que já roda ao salvar pela tela e ao
  importar a planilha. Um só lugar.
- B: FRIO separado na tela e na importação — descartada (dois lugares, entradas futuras esquecidas).

## Design
1. `sincronizarFechamento`: status PERDIDA ⇒ `termometro = 'FRIO'` sempre. Na tela de edição, campo
   termômetro travado em FRIO enquanto status = PERDIDA.
2. Exportação (`src/consultorPlanilha.js`): incluir ativas + todas as perdidas do consultor; colunas
   novas "Data de criação" (= `data_emissao`, dd/mm/aaaa, somente leitura) e "Motivo da perda" (só nas
   perdidas); aba INSTRUÇÕES lista os motivos válidos.
3. Importação: linha com status PERDIDA lê "Motivo da perda", aceitando só valores da lista; sem motivo
   válido a atualização é importada com motivo vazio e o resultado informa quantas ficaram assim.
   "Data de criação" é ignorada na importação.

## Decisões minhas (a conferir)
- "Data de criação" = `data_emissao` (ERP), não `criada_em`.
- PERDIDA sem motivo válido na importação: importa e avisa, não rejeita.
