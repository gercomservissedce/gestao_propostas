# Sistema de Gestão de Propostas — Especificação de Design

**Data:** 2026-07-09
**Solicitante:** Rodrigo Carvalho (gerente comercial)
**Status:** Aprovado pelo usuário em 2026-07-09

## Objetivo

Substituir a planilha `RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx` por um sistema local que dê ao gerente comercial previsibilidade de fechamento (termômetro + funil), controle de follow-up e análise de desempenho por consultor, com relatório em PDF para a diretoria.

## Decisões aprovadas

| Decisão | Escolha |
|---|---|
| Formato | App local no navegador: Node.js + Express + SQLite, iniciado por atalho que abre o navegador |
| Usuários | Somente o gerente (sem login) |
| Termômetro | Manual (QUENTE/MORNO/FRIO) + alertas automáticos de desatualização |
| Relatório diretoria | PDF (gerado via Edge instalado no Windows) |

## Contexto dos dados (planilha analisada)

- 481 propostas (2024–2026), tipo único "PORTARIA INTELIGENTE", total R$ 2.556.603,07
- Filiais: 1001 CEARÁ/matriz (320), 3001 PIAUÍ (78), 1003 MARANHÃO (47), 1002 AMAZONAS (36)
- 33 consultores (FRANQUEADO / CONSULTOR CLT)
- Status: 458 "Analise Cliente", 23 "Fechada" (~4,8% conversão)
- Termômetro preenchido em só 35 propostas; "última data de contato" quase vazia — o sistema deve resolver essa lacuna de follow-up
- Coluna "EM NEGOCIAÇÃO" contém a etapa: EM NEGOCIAÇÃO, AGUARDANDO VISITA, AGENDADO VISITA, ELABORANDO PROPOSTA, FECHADO, PERDIDO

## Arquitetura

- **Backend:** Node.js + Express servindo API REST + arquivos estáticos em `http://localhost:3050`
- **Banco:** SQLite via `better-sqlite3`, arquivo único `dados/propostas.db` (backup = copiar o arquivo; a pasta já está no Google Drive)
- **Frontend:** HTML/CSS/JS vanilla (sem build step), SPA leve com navegação por abas
- **Inicialização:** `Iniciar Gestão de Propostas.bat`/atalho — sobe o servidor e abre o navegador
- **PDF:** `puppeteer-core` apontando para o Microsoft Edge instalado (channel `msedge`), renderiza a página do relatório e salva PDF em `relatorios/`
- **Importação:** script de importação lê o `.xlsx` (lib `xlsx`) e popula o banco na primeira execução (ou sob demanda via botão "Importar planilha")

## Modelo de dados

- **filiais**: id, codigo (1001…), tipo (MATRIZ/FILIAL), estado
- **consultores**: id, nome, tipo (FRANQUEADO/CONSULTOR CLT), ativo
- **propostas**: id, filial_id, numero, data_emissao, cliente, tipo_negocio, status (ATIVA/FECHADA/PERDIDA), etapa (ELABORANDO PROPOSTA/AGENDADO VISITA/AGUARDANDO VISITA/EM NEGOCIAÇÃO/FECHADO/PERDIDO), data_fechamento, valores (comodato, serv_adicional, mensal, taxa_adesao, venda, instalacao, serv_especial, total), consultor_id, descricao, observacao, termometro (QUENTE/MORNO/FRIO/NULL=não classificada), proxima_data_contato, marcada_relatorio (bool), valor_minimo_fechamento
- **contatos**: id, proposta_id, data, anotacao, proximo_contato — histórico de follow-ups; "última data de contato" é derivada
- **config**: chave/valor — probabilidade por termômetro (quente 70 / morno 40 / frio 10), dias para alerta de proposta esquecida (30), dias para alerta de termômetro desatualizado (30), porta do servidor

## Telas

### 1. Dashboard (inicial)
- Cartões: valor total em negociação, previsão ponderada (Σ valor_total × probabilidade do termômetro), fechados no mês (qtde/valor), taxa de conversão
- Funil por etapa de negociação
- Distribuição do termômetro (quente/morno/frio/não classificada)
- Painel "Propostas esquecidas": sem contato há mais de N dias, ordenadas por valor decrescente
- Filtros globais: filial, consultor, período

### 2. Propostas
- Tabela com busca por cliente/número e filtros (filial, consultor, status, etapa, termômetro)
- Formulário de lançamento/edição com todos os campos
- Detalhe da proposta: dados + histórico de contatos (adicionar contato com anotação e próximo contato)
- Alerta visual quando termômetro desatualizado (sem contato há mais de N dias)
- Ações: fechar (pede data/valor), marcar como perdida (pede motivo em observação)

### 3. Consultores
- Ranking: propostas emitidas, valor total, fechadas (qtde/valor), taxa de conversão, ticket médio, tempo médio até fechamento, propostas paradas
- Comparativo FRANQUEADO × CLT e por filial
- Clique no consultor → lista das propostas dele

### 4. Relatório Diretoria
- Seleção de propostas candidatas a viabilização (checkbox `marcada_relatorio` + campo `valor_minimo_fechamento`)
- Prévia do relatório: resumo executivo (totais, funil, termômetro), tabela valor original × valor mínimo para fechamento × diferença
- Botão "Gerar PDF" → salva em `relatorios/Relatorio-Diretoria-AAAA-MM-DD.pdf` e abre o arquivo

## Regras de negócio

- Previsão ponderada usa probabilidades configuráveis por termômetro; propostas não classificadas não pontuam (aparecem como pendência de triagem)
- Proposta "esquecida" = ativa e sem contato registrado há mais de N dias (usa data de emissão se nunca houve contato)
- Importação: converte datas (formato M/D/YY da planilha) e valores "R$ x,xxx.xx"; termômetro vazio → não classificada; status "Analise Cliente" → ATIVA; "Fechada" → FECHADA; coluna "EM NEGOCIAÇÃO" → etapa; reimportação não duplica (chave: filial + número da proposta)
- Números no padrão brasileiro (R$ 1.234,56; datas DD/MM/AAAA) em toda a interface

## Fora do escopo (fase 1)

Acesso por consultores/login, envio automático de e-mail, integração com ERP, hospedagem em rede.

## Testes

- Testes de unidade para: parsing da planilha (datas/moeda), regras de previsão ponderada, detecção de propostas esquecidas, deduplicação na reimportação
- Verificação manual guiada: subir servidor, conferir totais do dashboard contra os totais da planilha (481 propostas, R$ 2.556.603,07)
