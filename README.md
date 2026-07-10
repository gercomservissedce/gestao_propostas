# Gestão de Propostas

Sistema local para acompanhamento de propostas comerciais: dashboard com termômetro,
controle de follow-up, análise por consultor e relatório em PDF para a diretoria.

## Como iniciar

Dê dois cliques em **`Iniciar Gestão de Propostas.bat`**. O navegador abre em
`http://localhost:3050`. Para encerrar, feche a janela preta do terminal.

## Onde ficam os dados

- Banco de dados: `dados/propostas.db` (backup = copiar esse arquivo; a pasta já está no Google Drive)
- PDFs gerados: `relatorios/`
- Planilha de origem: `Modelo/RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx`

## Uso no dia a dia

- **Dashboard** — visão geral: valor em negociação, previsão ponderada de fechamento,
  termômetro do pipeline e as propostas esquecidas (sem contato há mais de 30 dias).
- **Propostas** — lançar, editar, registrar contatos (follow-up), fechar ou marcar como perdida.
  Clique em qualquer linha para abrir a proposta. O formulário inclui os custos fixos
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
  de proposta esquecida e reimportação da planilha (adiciona só propostas novas, sem duplicar).

Ao marcar uma proposta como **Fechada**, a data de fechamento e a etapa são preenchidas
automaticamente (a data pode ser ajustada antes de salvar). Reabrir a proposta limpa as duas.

## Requisitos

- Node.js instalado
- Google Chrome ou Microsoft Edge (para gerar o PDF)

## Comandos (para manutenção)

```
npm install     # instalar dependências (primeira vez em outra máquina)
npm start       # iniciar o servidor sem o .bat
npm test        # rodar os testes automatizados
```
