# Sidebar de navegação + tela Consultores em cards

**Data:** 2026-07-11
**Status:** aprovado para planejamento

## Objetivo

Duas mudanças de interface, inspiradas no mockup "Servis Propostas"
(`GestaoPropostas_SC.html`):

1. Substituir as abas do topo por uma **sidebar de navegação** fixa à
   esquerda, em todas as telas.
2. Redesenhar a tela **Consultores**: a tabela dá lugar a uma **grade de
   cards**, um por consultor, com avatar, badge de tipo, métricas com
   mini-barras e botões de ação.

Sem mudança de backend: a API `/api/consultores/stats` já fornece todos os
dados necessários.

## 1. Sidebar (todas as telas)

### Layout

- O `<header class="topo">` mantém logo/título à esquerda e os botões de
  tema (🌙) e configurações (⚙) à direita. O `<nav class="abas">` sai do
  header.
- Abaixo do header, o corpo vira duas colunas:
  - `<aside class="sidebar">` fixa, ~220px de largura, borda direita,
    ocupando a altura da viewport abaixo do header (sticky).
  - `<main>` ao lado, com as seções de tela existentes.
- A sidebar tem um rótulo de seção "NAVEGAÇÃO" (maiúsculas, pequeno,
  cor atenuada) seguido de 5 itens, somente texto (sem emojis/ícones):
  - Dashboard
  - Propostas
  - Consultores
  - Análise
  - Relatório Diretoria
- Item ativo: fundo destacado e texto em cor de destaque (como no mockup).
- **Não** há seção "Filiais" na sidebar (decisão do usuário).

### Comportamento

- Os itens mantêm os mesmos atributos `data-tela` dos botões atuais;
  `app.js` (`App.trocarTela`) continua funcionando sem mudança de lógica —
  muda apenas o container/classes dos botões.
- Estilos usam as variáveis de tema existentes (`--fundo`, `--tinta`,
  etc.), funcionando nos temas claro e escuro.

## 2. Tela Consultores em cards

### Estrutura da tela (de cima para baixo)

1. **Linha de ações**: botão único "Importar atualizações" (a planilha
   importada já identifica o consultor pelas linhas; a seleção prévia por
   rádio deixa de existir).
2. **KPIs de resumo** (mantidos como hoje): 2 cartões — Franqueados e
   Consultores CLT — com valor fechado, emitidas, fechadas e conversão do
   grupo.
3. **Linha de filtros**:
   - Seletor de tipo: Todos / Franqueados / CLT.
   - "Ordenar por": Valor fechado (padrão), Emitidas, Conversão,
     Valor emitido.
   - À direita, contador: "N consultores".
4. **Grade de cards**: colunas responsivas (~3 em desktop,
   `repeat(auto-fill, minmax(300px, 1fr))`).

### Card do consultor

- **Cabeçalho**: avatar circular com as iniciais do nome (cor de fundo
  derivada do nome, via hash simples sobre uma paleta fixa) + nome do
  consultor + badge do tipo ("Franqueado" ou "CLT").
- **Métricas** em grade 2×2, cada célula com rótulo pequeno, valor
  destacado e mini-barra de progresso proporcional ao máximo daquela
  métrica entre os consultores exibidos:
  - Emitidas (barra azul)
  - Valor emitido (barra azul)
  - Fechadas (barra verde)
  - Valor fechado (barra verde)
- **Rodapé**: 2 botões lado a lado:
  - "📋 Ver propostas" — navega para a tela Propostas com filtro
    `consultor_id` (comportamento atual do clique na linha).
  - "📊 Gerar planilha" — baixa `/api/consultores/{id}/exportar`
    (comportamento atual do botão de exportar, agora por card).

### Regras

- Só aparecem consultores com `emitidas > 0` (regra atual mantida).
- O filtro de tipo afeta a grade de cards e o contador, mas não os KPIs
  de resumo (que sempre mostram os dois grupos).
- A ordenação por coluna da tabela antiga (setas nos cabeçalhos) deixa de
  existir — substituída pelo seletor "Ordenar por".
- Valores monetários usam `fmtMoeda` existente (sem abreviação "k" do
  mockup).

### O que é removido

- Tabela de consultores com colunas ordenáveis.
- Seleção por rádio e estado `selecionado`.
- Botão "Gerar planilha do consultor" do topo (vai para o card).
- Colunas que não aparecem no card: conversão individual, ticket médio,
  dias p/ fechar, paradas — a conversão por grupo permanece nos KPIs.
  (Se sentirem falta, podem voltar numa iteração futura.)

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `public/index.html` | header sem abas; novo `<aside class="sidebar">` + wrapper de duas colunas |
| `public/styles.css` | classes novas: sidebar, nav-item, rep-grid, rep-card, rep-avatar, rep-stat, badges de tipo |
| `public/js/consultores.js` | render reescrito (filtros + grade de cards); import sem seleção prévia |
| `public/js/app.js` | ajuste apenas se os seletores de aba dependerem da estrutura antiga |

## Fora de escopo

- Mudanças de backend/API.
- Seção "Filiais" na sidebar.
- Botão "Enviar" (WhatsApp/e-mail) do mockup.
- Filtro por filial ou ano na tela Consultores.
- Sidebar retrátil/responsiva para telas estreitas (app de uso local em
  desktop).

## Testes e verificação

- Os testes automatizados existentes (`tests/`) cobrem apenas o backend
  (rotas, banco, importação, planilha); nenhum toca os arquivos alterados,
  então não há testes a atualizar. Rodar `npm test` mesmo assim para
  garantir que nada quebrou.
- Verificação manual: subir o servidor, navegar pelas 5 telas via sidebar
  nos dois temas, filtrar/ordenar cards, usar "Ver propostas",
  "Gerar planilha" e "Importar atualizações".
