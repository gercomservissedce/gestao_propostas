const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { openDb } = require('../src/db');
const { gerarPlanilhaConsultor } = require('../src/consultorPlanilha');

function dbComPropostas() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const consultorA = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR A','FRANQUEADO')"
  ).run().lastInsertRowid;
  const consultorB = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR B','FRANQUEADO')"
  ).run().lastInsertRowid;
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa, termometro, vlr_total, consultor_id)
    VALUES (1, '1', '2026-07-01', 'COND ATIVA', 'ATIVA', 'EM NEGOCIAÇÃO', 'QUENTE', 1000, ?)`).run(consultorA);
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa, vlr_total, consultor_id, data_fechamento)
    VALUES (1, '2', '2026-06-01', 'COND FECHADA', 'FECHADA', 'FECHADO', 2000, ?, '2026-06-15')`).run(consultorA);
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, vlr_total, consultor_id)
    VALUES (1, '3', '2026-07-01', 'COND OUTRO CONSULTOR', 'ATIVA', 3000, ?)`).run(consultorB);
  return { db, consultorA };
}

test('gerarPlanilhaConsultor inclui só propostas ATIVA do consultor pedido', () => {
  const { db, consultorA } = dbComPropostas();
  const buffer = gerarPlanilhaConsultor(db, consultorA);
  const wb = XLSX.read(buffer, { type: 'buffer' });

  assert.ok(wb.SheetNames.includes('PROPOSTAS'));
  assert.ok(wb.SheetNames.includes('INSTRUÇÕES'));

  const linhas = XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS']);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0]['Nº proposta'], '1');
  assert.equal(linhas[0]['Cliente'], 'COND ATIVA');
  assert.equal(linhas[0]['Filial'], 'CEARÁ');
  assert.equal(linhas[0]['Status'], 'ATIVA');
  assert.equal(linhas[0]['Termômetro'], 'QUENTE');
});
