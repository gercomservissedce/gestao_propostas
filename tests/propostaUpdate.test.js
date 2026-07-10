const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { atualizarProposta } = require('../src/propostaUpdate');

function dbComProposta() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const info = db.prepare(
    "INSERT INTO propostas (filial_id, numero, data_emissao, cliente) VALUES (1, '100', '2026-07-01', 'COND TESTE')"
  ).run();
  return { db, id: info.lastInsertRowid };
}

test('atualizarProposta grava campos informados e aplica sincronizarFechamento', () => {
  const { db, id } = dbComProposta();
  const r = atualizarProposta(db, id, { status: 'FECHADA' }, '2026-07-10');
  assert.equal(r.changes, 1);
  assert.equal(r.nada, false);
  const p = db.prepare('SELECT status, etapa, data_fechamento FROM propostas WHERE id = ?').get(id);
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.etapa, 'FECHADO');
  assert.equal(p.data_fechamento, '2026-07-10');
});

test('atualizarProposta retorna nada=true sem campos e changes=0 para id inexistente', () => {
  const { db, id } = dbComProposta();
  const semCampos = atualizarProposta(db, id, {}, '2026-07-10');
  assert.equal(semCampos.nada, true);
  assert.equal(semCampos.changes, 0);

  const idInexistente = atualizarProposta(db, 999999, { status: 'ATIVA' }, '2026-07-10');
  assert.equal(idInexistente.nada, false);
  assert.equal(idInexistente.changes, 0);
});

test('atualizarProposta grava origem', () => {
  const { db, id } = dbComProposta();
  const r = atualizarProposta(db, id, { origem: 'LEAD' }, '2026-07-10');
  assert.equal(r.changes, 1);
  const p = db.prepare('SELECT origem FROM propostas WHERE id = ?').get(id);
  assert.equal(p.origem, 'LEAD');
});
