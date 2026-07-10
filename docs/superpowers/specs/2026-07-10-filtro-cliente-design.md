# Filtro por Cliente na página de Propostas — Design

Data: 2026-07-10

## Objetivo

Filtrar a lista de propostas por um cliente específico, escolhido de uma lista com
autocompletar. Complementa o campo "Buscar" (texto livre por cliente/nº), que continua
como está.

## Mudanças por camada

1. **`src/routes.js`**
   - `GET /api/clientes` → `SELECT DISTINCT cliente FROM propostas ORDER BY cliente`,
     retornando `["nome", ...]`.
   - `GET /api/propostas` aceita `?cliente=` com igualdade exata
     (`p.cliente = ?`). O valor vem da lista, então não precisa de busca aproximada.
2. **`public/js/propostas.js`**
   - Campo **Cliente** na linha de filtros, entre Buscar e Filial: `<input>` ligado a
     um `<datalist>` populado por `/api/clientes`.
   - Valor igual a um cliente da lista (evento `change`) → aplica o filtro; campo
     vazio → remove. Convive com os demais filtros.

## Fora de escopo

Mudanças no campo Buscar, filtros em outras telas, paginação.

## Testes

- `/api/clientes` retorna lista distinta e ordenada.
- `/api/propostas?cliente=X` retorna apenas propostas do cliente X.
