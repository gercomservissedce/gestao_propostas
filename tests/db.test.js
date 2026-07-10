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

test('propostas tem unicidade filial+numero', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const ins = db.prepare(
    "INSERT INTO propostas (filial_id, numero, data_emissao, cliente) VALUES (1, '3439', '2024-11-11', 'COND TESTE')"
  );
  ins.run();
  assert.throws(() => ins.run(), /UNIQUE/);
});
