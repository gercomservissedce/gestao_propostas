const { test, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { openDb } = require('../src/db');
const { criarRotas } = require('../src/routes');
const XLSX = require('xlsx');
const { COLUNAS_PROPOSTAS } = require('../src/consultorPlanilha');

function subirApp() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  const app = express();
  app.use(express.json());
  app.use('/api', criarRotas(db));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return { db, server, base };
}

test('GET /clientes lista distinta e ordenada; filtro ?cliente= é exato', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, cliente) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao: '2026-07-10', cliente }),
  });
  await criar('1', 'COND BRAVO');
  await criar('2', 'COND ALFA');
  await criar('3', 'COND BRAVO');

  const clientes = await (await fetch(`${base}/api/clientes`)).json();
  assert.deepEqual(clientes, ['COND ALFA', 'COND BRAVO']);

  const soBravo = await (await fetch(`${base}/api/propostas?cliente=${encodeURIComponent('COND BRAVO')}`)).json();
  assert.equal(soBravo.length, 2);
  assert.ok(soBravo.every(p => p.cliente === 'COND BRAVO'));
});

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

test('GET /consultores/:id/exportar gera planilha só com propostas ATIVA do consultor', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const consultorId = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR TESTE', 'FRANQUEADO')"
  ).run().lastInsertRowid;
  await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '10', data_emissao: '2026-07-01', cliente: 'COND EXPORT', consultor_id: consultorId,
    }),
  });

  const resp = await fetch(`${base}/api/consultores/${consultorId}/exportar`);
  assert.equal(resp.status, 200);
  assert.match(resp.headers.get('content-disposition') || '', /attachment/);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS']);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0]['Cliente'], 'COND EXPORT');

  const semConsultor = await fetch(`${base}/api/consultores/999999/exportar`);
  assert.equal(semConsultor.status, 404);
});

test('POST /consultores/importar-atualizacoes aplica mudanças da planilha', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const consultorId = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR IMPORT', 'FRANQUEADO')"
  ).run().lastInsertRowid;
  const criar = await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '20', data_emissao: '2026-07-01', cliente: 'COND IMPORT', consultor_id: consultorId,
    }),
  });
  const { id } = await criar.json();

  const wb = XLSX.utils.book_new();
  const aoa = [
    COLUNAS_PROPOSTAS,
    [id, '20', 'COND IMPORT', '', 0, 'FECHADA', 'FECHADO', 'QUENTE', '', '', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  const arquivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');

  const resp = await fetch(`${base}/api/consultores/importar-atualizacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo }),
  });
  assert.equal(resp.status, 200);
  const resumo = await resp.json();
  assert.equal(resumo.atualizadas, 1);
  assert.equal(resumo.naoEncontradas, 0);

  const p = await (await fetch(`${base}/api/propostas/${id}`)).json();
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.termometro, 'QUENTE');
});

test('POST /propostas persiste origem; GET /propostas filtra por origem', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, cliente, origem) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao: '2026-07-10', cliente, origem }),
  });
  await criar('900', 'COND LEAD', 'LEAD');
  await criar('901', 'COND INDICACAO', 'INDICAÇÃO');

  const soLead = await (await fetch(`${base}/api/propostas?origem=LEAD`)).json();
  assert.equal(soLead.length, 1);
  assert.equal(soLead[0].cliente, 'COND LEAD');
  assert.equal(soLead[0].origem, 'LEAD');
});

test('GET /propostas/anos devolve anos distintos em ordem decrescente', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente: 'COND ANOS' }),
  });
  await criar('1', '2024-11-11');
  await criar('2', '2026-07-01');
  await criar('3', '2026-02-05');
  await criar('4', '2025-03-09');

  const resposta = await fetch(`${base}/api/propostas/anos`);
  assert.equal(resposta.status, 200);
  // 2026 está em duas propostas e aparece uma única vez na resposta
  assert.deepEqual(await resposta.json(), ['2026', '2025', '2024']);
});

test('/propostas/anos não é capturado pela rota /propostas/:id', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  // Banco vazio. Se 'anos' cair em /propostas/:id, a resposta é
  // 404 { erro: 'Proposta não encontrada' } em vez de uma lista vazia.
  const resposta = await fetch(`${base}/api/propostas/anos`);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), []);
});

test('GET /propostas filtra por mes e por ano de emissão, de forma independente', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente: 'COND MES' }),
  });
  await criar('1', '2026-06-10');
  await criar('2', '2026-06-28');
  await criar('3', '2026-07-01');
  await criar('4', '2025-06-15');

  const numeros = async qs =>
    (await (await fetch(`${base}/api/propostas?${qs}`)).json()).map(p => p.numero).sort();

  assert.deepEqual(await numeros('mes=06&ano=2026'), ['1', '2'], 'mês e ano juntos');
  assert.deepEqual(await numeros('mes=06'), ['1', '2', '4'], 'junho de qualquer ano');
  assert.deepEqual(await numeros('ano=2026'), ['1', '2', '3'], '2026 inteiro');
  assert.deepEqual(await numeros(''), ['1', '2', '3', '4'], 'sem filtro');
});

test('mes/ano se somam aos outros filtros em vez de substituí-los', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const criar = (numero, data_emissao, cliente) => fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filial_id: 1, numero, data_emissao, cliente }),
  });
  await criar('1', '2026-06-10', 'COND ALFA');
  await criar('2', '2026-06-11', 'COND BETA');
  await criar('3', '2026-07-10', 'COND ALFA');

  const lista = await (await fetch(
    `${base}/api/propostas?mes=06&ano=2026&cliente=${encodeURIComponent('COND ALFA')}`
  )).json();
  assert.deepEqual(lista.map(p => p.numero), ['1']);
});
