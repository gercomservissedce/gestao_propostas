const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('./src/db');
const { criarRotas, CAMINHO_PLANILHA } = require('./src/routes');
const { importarPlanilha } = require('./src/importer');

const PORTA = process.env.PORTA ? Number(process.env.PORTA) : 3050;
const PASTA_DADOS = path.join(__dirname, 'dados');

if (!fs.existsSync(PASTA_DADOS)) fs.mkdirSync(PASTA_DADOS);
const db = openDb(path.join(PASTA_DADOS, 'propostas.db'));

// Primeira execução: importa a planilha automaticamente
const total = db.prepare('SELECT COUNT(*) n FROM propostas').get().n;
if (total === 0 && fs.existsSync(CAMINHO_PLANILHA)) {
  const r = importarPlanilha(db, CAMINHO_PLANILHA);
  console.log(`Importação inicial: ${r.inseridas} propostas, ${r.consultores} consultores, ${r.filiais} filiais.`);
}

const app = express();
app.use(express.json());
app.use('/api', criarRotas(db));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/relatorios', express.static(path.join(__dirname, 'relatorios')));

// Página do relatório para impressão/PDF
app.get('/relatorio/print', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'relatorio-print.html'));
});

app.listen(PORTA, () => {
  console.log(`Gestão de Propostas rodando em http://localhost:${PORTA}`);
});

module.exports = { app, db };
