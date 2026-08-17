const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { openDb } = require('../src/db');
const { criarRotas } = require('../src/routes');
const XLSX = require('xlsx');
const { COLUNAS_PROPOSTAS } = require('../src/consultorPlanilha');

function subirApp(opcoes = {}) {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  // Pasta própria por teste: backup de teste nunca escreve na pasta do projeto.
  const pastaBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-rotas-'));
  const app = express();
  app.use(express.json());
  app.use('/api', criarRotas(db, { pastaBackups, ...opcoes }));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return { db, server, base, pastaBackups };
}

function backupsEm(pasta) {
  return fs.readdirSync(pasta).filter(n => n.startsWith('backup-'));
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

const CABECALHO_CSV = 'CODFIL,SIGFIL,Nº PROP.,DATA,NOME DO CLIENTE,TIPO NEGOC.,STATUS,'
  + 'DT. FECHADA,VLR. COMOD.,VLR. SERV. AD.,VLR. MENSAL,VLR.TX.ADESÃO,VLR. VENDA,'
  + 'VLR. INSTAL.,VLR.SRV.ESP.,VLR. TOTAL,VLR. DESC.,VLR. TOTAL C/DESC.,'
  + 'REPRESENTANTE,DescricaoProposta,Observacao';

const LINHA_CSV = '1001,"Servis Eletrônica Ceará",27178,2026-07-08 00:00:00,'
  + '"CONDOMINIO GREEN VILLAGE",PORTARIA INTELIGENTE,Analise Cliente,,"R$3383,15",'
  + '"R$35,00","R$3418,15",,"R$0,00",,,"R$3418,15",,"R$3418,15",'
  + '"LUIS JOSE SANTIAGO CAMPOS",,';

function csvBase64(...linhas) {
  return Buffer.from(`\uFEFF${CABECALHO_CSV}\r\n${linhas.join('\r\n')}\r\n`, 'utf8').toString('base64');
}

test('POST /importar-csv/previa mostra o plano sem gravar; /importar-csv grava', async () => {
  const { db, server, base } = subirApp();
  after(() => server.close());

  const previa = await (await fetch(`${base}/api/importar-csv/previa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV) }),
  })).json();
  assert.equal(previa.novas.length, 1);
  assert.equal(previa.novas[0].numero, '27178');
  assert.deepEqual(previa.consultoresNovos, ['LUIS JOSE SANTIAGO CAMPOS']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 0);

  const resumo = await (await fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV) }),
  })).json();
  assert.equal(resumo.inseridas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 1);
});

test('POST /importar-csv recusa arquivo que não é do ERP e corpo sem arquivo', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const enviar = corpo => fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  const errada = await enviar({ arquivo: Buffer.from('A,B\n1,2\n').toString('base64') });
  assert.equal(errada.status, 400);
  assert.match((await errada.json()).erro, /CODFIL/);

  const vazio = await enviar({});
  assert.equal(vazio.status, 400);
  assert.match((await vazio.json()).erro, /arquivo/i);
});

test('POST /importar-csv faz backup antes de gravar e registra no histórico', async () => {
  const { db, server, base, pastaBackups } = subirApp();
  after(() => server.close());

  const resp = await fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV), nomeArquivo: 'PROPOSTAS JULHO.csv' }),
  });
  assert.equal(resp.status, 200);
  const resumo = await resp.json();
  assert.equal(resumo.inseridas, 1);

  const backups = backupsEm(pastaBackups);
  assert.equal(backups.length, 1, 'a importação deve deixar um backup');
  assert.equal(resumo.backup, backups[0], 'a resposta informa qual backup foi gerado');

  const historico = await (await fetch(`${base}/api/importacoes`)).json();
  assert.equal(historico.length, 1);
  assert.equal(historico[0].origem, 'CSV do ERP');
  assert.equal(historico[0].arquivo, 'PROPOSTAS JULHO.csv');
  assert.equal(historico[0].inseridas, 1);
  assert.equal(historico[0].backup, backups[0]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 1);
});

test('o backup guarda o banco como estava ANTES da importação', async () => {
  const { server, base, pastaBackups } = subirApp();
  after(() => server.close());

  await fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV), nomeArquivo: 'x.csv' }),
  });

  const Database = require('better-sqlite3');
  const copia = new Database(path.join(pastaBackups, backupsEm(pastaBackups)[0]), { readonly: true });
  assert.equal(copia.prepare('SELECT COUNT(*) n FROM propostas').get().n, 0);
  copia.close();
});

test('arquivo que não é do ERP não gera backup nem entra no histórico', async () => {
  const { server, base, pastaBackups } = subirApp();
  after(() => server.close());

  const resp = await fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: Buffer.from('A,B\n1,2\n').toString('base64'), nomeArquivo: 'errado.csv' }),
  });
  assert.equal(resp.status, 400);

  assert.deepEqual(backupsEm(pastaBackups), []);
  assert.deepEqual(await (await fetch(`${base}/api/importacoes`)).json(), []);
});

test('a prévia não faz backup nem registra nada', async () => {
  const { server, base, pastaBackups } = subirApp();
  after(() => server.close());

  await fetch(`${base}/api/importar-csv/previa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV) }),
  });

  assert.deepEqual(backupsEm(pastaBackups), []);
  assert.deepEqual(await (await fetch(`${base}/api/importacoes`)).json(), []);
});

test('importar a planilha do consultor também faz backup e entra no histórico', async () => {
  const { db, server, base, pastaBackups } = subirApp();
  after(() => server.close());

  const consultorId = db.prepare(
    "INSERT INTO consultores (nome, tipo) VALUES ('CONSULTOR BACKUP', 'FRANQUEADO')"
  ).run().lastInsertRowid;
  const criar = await fetch(`${base}/api/propostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filial_id: 1, numero: '77', data_emissao: '2026-07-01', cliente: 'COND BKP', consultor_id: consultorId,
    }),
  });
  const { id } = await criar.json();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    COLUNAS_PROPOSTAS,
    [id, '77', 'COND BKP', '', 0, 'FECHADA', 'FECHADO', 'QUENTE', '', '', ''],
  ]), 'PROPOSTAS');
  const arquivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');

  await fetch(`${base}/api/consultores/importar-atualizacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo, nomeArquivo: 'CONSULTOR BACKUP-propostas.xlsx' }),
  });

  assert.equal(backupsEm(pastaBackups).length, 1);
  const [reg] = await (await fetch(`${base}/api/importacoes`)).json();
  assert.equal(reg.origem, 'Planilha do consultor');
  assert.equal(reg.arquivo, 'CONSULTOR BACKUP-propostas.xlsx');
  assert.equal(reg.atualizadas, 1);
});

test('GET /importacoes devolve da mais recente para a mais antiga', async () => {
  const { server, base } = subirApp();
  after(() => server.close());

  const importar = nomeArquivo => fetch(`${base}/api/importar-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: csvBase64(LINHA_CSV), nomeArquivo }),
  });
  await importar('primeira.csv');
  await importar('segunda.csv');

  const historico = await (await fetch(`${base}/api/importacoes`)).json();
  assert.deepEqual(historico.map(r => r.arquivo), ['segunda.csv', 'primeira.csv']);
});

test('POST /abrir-pasta-backups abre a pasta e devolve o caminho', async () => {
  const abertas = [];
  const { server, base, pastaBackups } = subirApp({ abrirPasta: p => abertas.push(p) });
  after(() => server.close());

  const resp = await fetch(`${base}/api/abrir-pasta-backups`, { method: 'POST' });
  assert.equal(resp.status, 200);
  assert.equal((await resp.json()).pasta, pastaBackups);
  assert.deepEqual(abertas, [pastaBackups]);
});
