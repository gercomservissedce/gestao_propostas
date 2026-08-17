const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { registrarImportacao, listarImportacoes } = require('../src/historicoImportacoes');

test('registrar grava origem, arquivo, backup e contagens da importação', () => {
  const db = openDb(':memory:');

  registrarImportacao(db, {
    origem: 'CSV do ERP',
    arquivo: 'RELAÇÃO DAS PROPOSTAS JONATAS.csv',
    backup: 'backup-2026-08-17-154130-csv.db',
    inseridas: 3, atualizadas: 29, semMudanca: 3, invalidas: 0,
  }, new Date(2026, 7, 17, 15, 41, 30));

  const [reg] = listarImportacoes(db);
  assert.equal(reg.origem, 'CSV do ERP');
  assert.equal(reg.arquivo, 'RELAÇÃO DAS PROPOSTAS JONATAS.csv');
  assert.equal(reg.backup, 'backup-2026-08-17-154130-csv.db');
  assert.equal(reg.data_hora, '2026-08-17 15:41');
  assert.equal(reg.inseridas, 3);
  assert.equal(reg.atualizadas, 29);
  assert.equal(reg.sem_mudanca, 3);
  assert.equal(reg.invalidas, 0);
});

test('contagem que a importação não informa entra como zero', () => {
  const db = openDb(':memory:');

  // A planilha do consultor não tem "inseridas" nem "sem mudança".
  registrarImportacao(db, { origem: 'Planilha do consultor', atualizadas: 4, invalidas: 1 });

  const [reg] = listarImportacoes(db);
  assert.equal(reg.inseridas, 0);
  assert.equal(reg.sem_mudanca, 0);
  assert.equal(reg.atualizadas, 4);
  assert.equal(reg.invalidas, 1);
});

test('listar devolve da mais recente para a mais antiga', () => {
  const db = openDb(':memory:');
  registrarImportacao(db, { origem: 'CSV do ERP', arquivo: 'primeira.csv' });
  registrarImportacao(db, { origem: 'CSV do ERP', arquivo: 'segunda.csv' });
  registrarImportacao(db, { origem: 'CSV do ERP', arquivo: 'terceira.csv' });

  const arquivos = listarImportacoes(db).map(r => r.arquivo);
  assert.deepEqual(arquivos, ['terceira.csv', 'segunda.csv', 'primeira.csv']);
});

test('listar respeita o limite pedido', () => {
  const db = openDb(':memory:');
  for (let i = 1; i <= 5; i++) registrarImportacao(db, { origem: 'CSV do ERP', arquivo: `${i}.csv` });

  const lista = listarImportacoes(db, 2);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].arquivo, '5.csv');
});

test('importação sem backup fica registrada com backup vazio', () => {
  const db = openDb(':memory:');
  registrarImportacao(db, { origem: 'CSV do ERP', arquivo: 'sem-backup.csv' });

  const [reg] = listarImportacoes(db);
  assert.equal(reg.backup, null);
});
