const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('openDb cria schema e config padrão', () => {
  const db = openDb(':memory:');
  const tabelas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  for (const t of ['filiais', 'consultores', 'propostas', 'contatos', 'config']) {
    assert.ok(tabelas.includes(t), `tabela ${t} deve existir`);
  }
  const cfg = Object.fromEntries(
    db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])
  );
  assert.equal(cfg.prob_quente, '70');
  assert.equal(cfg.prob_morno, '40');
  assert.equal(cfg.prob_frio, '10');
  assert.equal(cfg.dias_alerta, '30');
});

test('propostas tem colunas de custo e roi', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  for (const c of ['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve existir`);
  }
});

test('propostas tem coluna origem', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  assert.ok(colunas.includes('origem'), 'coluna origem deve existir');
});

test('propostas tem colunas de desconto do CSV do ERP', () => {
  const db = openDb(':memory:');
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  for (const c of ['vlr_desconto', 'vlr_total_com_desconto']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve existir`);
  }
});

test('openDb migra banco antigo sem colunas de custo', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-mig-'));
  const arquivo = path.join(dir, 'antigo.db');
  const antigo = new Database(arquivo);
  antigo.exec(`CREATE TABLE propostas (
    id INTEGER PRIMARY KEY,
    filial_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    data_emissao TEXT NOT NULL,
    cliente TEXT NOT NULL
  )`);
  antigo.prepare(
    "INSERT INTO propostas (filial_id, numero, data_emissao, cliente) VALUES (1, '100', '2024-01-01', 'COND ANTIGO')"
  ).run();
  antigo.close();

  const db = openDb(arquivo);
  const colunas = db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name);
  for (const c of ['custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02', 'origem',
                   'vlr_desconto', 'vlr_total_com_desconto']) {
    assert.ok(colunas.includes(c), `coluna ${c} deve ser adicionada na migração`);
  }
  const antiga = db.prepare("SELECT * FROM propostas WHERE numero = '100'").get();
  assert.equal(antiga.cliente, 'COND ANTIGO');
  assert.equal(antiga.custo_dep01, null);
  assert.equal(antiga.origem, null);
  assert.equal(antiga.vlr_desconto, 0); // DEFAULT 0 preenche as linhas antigas
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('propostas tem unicidade filial+numero', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const ins = db.prepare(
    "INSERT INTO propostas (filial_id, numero, data_emissao, cliente) VALUES (1, '3439', '2024-11-11', 'COND TESTE')"
  );
  ins.run();
  assert.throws(() => ins.run(), /UNIQUE/);
});
