# Custos DEP 01/02 e ROI por proposta — Design

Data: 2026-07-10

## Objetivo

Registrar manualmente, em cada proposta, os custos fixos de DEP 01 e DEP 02 e o ROI
aplicado a cada um. Apenas armazenamento e exibição no formulário — nenhum cálculo
derivado por enquanto.

## Campos

| Coluna        | Tipo | Padrão (proposta nova) |
|---------------|------|------------------------|
| `custo_dep01` | REAL | vazio (NULL)           |
| `roi_dep01`   | REAL | 6                      |
| `custo_dep02` | REAL | vazio (NULL)           |
| `roi_dep02`   | REAL | 8                      |

## Mudanças por camada

1. **`src/db.js`** — colunas novas no `SCHEMA_SQL` e migração leve em `openDb()`:
   `PRAGMA table_info(propostas)` + `ALTER TABLE ADD COLUMN` para cada coluna
   ausente. Propostas antigas ficam com valores NULL.
2. **`src/routes.js`** — incluir os 4 nomes em `CAMPOS_PROPOSTA` (POST/PUT genéricos
   passam a aceitá-los; GET já retorna `p.*`).
3. **`public/js/propostas.js`** — seção "Custos" no modal, com DEP 01 (R$) + ROI e
   DEP 02 (R$) + ROI; padrões 6 e 8 só em proposta nova; campos entram no `coletar()`.

## Fora de escopo

Cálculos (custo total, retorno), colunas na tabela de listagem, dashboard e relatório.

## Testes

- Migração adiciona as colunas num banco criado com o schema antigo.
- Criar/editar proposta persiste os 4 campos.
