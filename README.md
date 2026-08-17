# Gestão de Propostas

Sistema local para acompanhamento de propostas comerciais: dashboard com termômetro,
controle de follow-up, análise por consultor e relatório em PDF para a diretoria.

## Como iniciar

Dê dois cliques em **`Iniciar Gestão de Propostas.bat`**. O navegador abre sozinho em
`http://localhost:3060` assim que o servidor estiver pronto (pode levar alguns segundos).
Para encerrar, feche a janela preta do terminal.

> A porta é a **3060**. A 3050 (usada antes) é a porta padrão do Firebird, que roda como
> serviço nesta máquina — o navegador caía no Firebird em vez do sistema e a página não abria.
> Se precisar de outra porta: `set PORTA=3070` antes do `npm start`.

## Onde ficam os dados

- Banco de dados: `dados/propostas.db` (backup = copiar esse arquivo; a pasta já está no Google Drive)
- Backups automáticos das importações: `dados/backups/` (os 20 mais recentes)
- PDFs gerados: `relatorios/`
- Planilha de origem: `Modelo/RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx`

## Uso no dia a dia

- **Dashboard** — visão geral: valor em negociação, previsão ponderada de fechamento,
  termômetro do pipeline e as propostas esquecidas (sem contato há mais de 30 dias).
- **Propostas** — lançar, editar, registrar contatos (follow-up), fechar ou marcar como perdida.
  Clique em qualquer linha para abrir a proposta.
  O grid vem separado por mês de emissão, com a quantidade e o valor de cada mês
  na faixa — clique na faixa para recolher o mês. Os filtros **Mês** e **Ano**
  isolam um período (podem ser usados juntos ou separados).
  O formulário inclui os custos fixos
  (DEP 01 e DEP 02, com o ROI aplicado a cada um), preenchidos manualmente.
- **Consultores** — ranking de desempenho; clique no consultor para ver as propostas dele.
  Selecione um consultor (rádio na tabela) para **gerar uma planilha** com as propostas
  ativas dele (para enviar por e-mail/WhatsApp) e depois **importar atualizações** quando
  ele devolver a planilha preenchida com status, etapa, termômetro e um contato novo.
- **Análise** — o cenário em linguagem simples: onde atuar em ordem de prioridade,
  propostas por consultor com a situação de cada uma, conversão por filial e idade do pipeline.
- **Relatório Diretoria** — marque as propostas, informe o valor mínimo de fechamento
  e clique em "Gerar PDF". O arquivo fica em `relatorios/`.
- **🌙/☀ Tema** — alterna entre claro e escuro; a preferência fica salva no navegador.
- **⚙ Configurações** — probabilidades do termômetro (quente/morno/frio), prazo do alerta
  de proposta esquecida, reimportação da planilha (adiciona só propostas novas, sem duplicar),
  **importação do CSV do ERP** e o **histórico das importações já feitas**, com o backup
  gerado em cada uma.

Ao marcar uma proposta como **Fechada**, a data de fechamento e a etapa são preenchidas
automaticamente (a data pode ser ajustada antes de salvar). Reabrir a proposta limpa as duas.

### Importar o CSV do ERP

Em **⚙ Configurações → Importar CSV do ERP**, escolha o arquivo exportado do ERP
(`RELAÇÃO DAS PROPOSTAS ATUALIZADA <data>.csv`). O sistema mostra uma prévia com o que
vai acontecer — quantas propostas são novas, quais valores serão corrigidos, quais filiais
e representantes serão criados e quais linhas têm problema — e só grava depois do
**Confirmar importação**.

A importação **insere** as propostas que faltam e **corrige** os valores das que já
existem. Ela nunca mexe no acompanhamento feito aqui: status, etapa, termômetro, próximo
contato, histórico de contatos, custos DEP/ROI e a marcação do relatório ficam como estão.
Descrição e observação só são sobrescritas quando o CSV traz texto — campo vazio no ERP
não apaga o que você escreveu.

Pode importar o mesmo arquivo duas vezes sem medo: na segunda vez nada muda.

### Backup automático e histórico

Antes de gravar qualquer importação — o CSV do ERP ou a planilha devolvida pelo
consultor — o sistema salva sozinho uma cópia do banco em `dados/backups/`, com data
e hora no nome (`backup-2026-08-17-154130-csv.db`). Se o backup não puder ser gravado,
a importação não acontece. Ficam guardados os **20 mais recentes**; os mais antigos são
apagados automaticamente.

Em **⚙ Configurações → Últimas importações** fica o registro do que já foi importado:
data e hora, arquivo usado, quantas propostas entraram, quantas foram atualizadas e qual
backup corresponde àquela importação. O botão **Abrir pasta dos backups** abre a pasta
no Explorer.

Para desfazer uma importação: feche o sistema, vá em `dados/`, renomeie o
`propostas.db` atual (por segurança) e copie no lugar dele o backup daquela importação,
com o nome `propostas.db`. Apague também os arquivos `propostas.db-wal` e
`propostas.db-shm`, se existirem. Depois é só abrir o sistema de novo.

## Requisitos

- Node.js instalado
- Google Chrome ou Microsoft Edge (para gerar o PDF)

## Comandos (para manutenção)

```
npm install     # instalar dependências (primeira vez em outra máquina)
npm start       # iniciar o servidor sem o .bat
npm test        # rodar os testes automatizados
```
