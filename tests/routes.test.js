const { test, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { openDb } = require('../src/db');
const { criarRotas } = require('../src/routes');

function subirApp() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const app = express();
  app.use(express.json());
  app.use('/api', criarRotas(db));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return { server, base };
}

test('POST e PUT de proposta persistem custos e ROI', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '5000', data_emissao: '2026-07-10', cliente: 'COND CUSTO',
      custo_dep01: 12500.5, roi_dep01: 6, custo_dep02: 3000, roi_dep02: 8,
    }),
  });
  assert.equal(criar.status, 201);
  const { id } = await criar.json();

  let p = await (await fetch(`${base}/api/propostas/${id}`)).json();
  assert.equal(p.custo_dep01, 12500.5);
  assert.equal(p.roi_dep01, 6);
  assert.equal(p.custo_dep02, 3000);
  assert.equal(p.roi_dep02, 8);

  const editar = await fetch(`${base}/api/propostas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custo_dep01: 9999, roi_dep01: 7 }),
  });
  assert.equal(editar.status, 200);

  p = await (await fetch(`${base}/api/propostas/${id}`)).json();
  assert.equal(p.custo_dep01, 9999);
  assert.equal(p.roi_dep01, 7);
  assert.equal(p.custo_dep02, 3000);
});
