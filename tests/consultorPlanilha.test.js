const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { openDb } = require('../src/db');
const { gerarPlanilhaConsultor } = require('../src/consultorPlanilha');
const { MOTIVOS_PERDA } = require('../src/parse');

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
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, termometro, motivo_perda, vlr_total, consultor_id)
    VALUES (1, '4', '2026-05-20', 'COND PERDIDA', 'PERDIDA', 'FRIO', 'PREÇO', 500, ?)`).run(consultorA);
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, termometro, motivo_perda, vlr_total, consultor_id)
    VALUES (1, '5', '2026-05-21', 'COND PERDIDA B', 'PERDIDA', 'FRIO', 'PREÇO', 600, ?)`).run(consultorB);
  return { db, consultorA };
}

test('gerarPlanilhaConsultor inclui propostas ATIVA e PERDIDA do consultor pedido', () => {
  const { db, consultorA } = dbComPropostas();
  const buffer = gerarPlanilhaConsultor(db, consultorA);
  const wb = XLSX.read(buffer, { type: 'buffer' });

  assert.ok(wb.SheetNames.includes('PROPOSTAS'));
  assert.ok(wb.SheetNames.includes('INSTRUÇÕES'));

  const linhas = XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS']);
  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas.map(l => l['Nº proposta']).sort(), ['1', '4']);

  const ativa = linhas.find(l => l['Nº proposta'] === '1');
  assert.equal(ativa['Cliente'], 'COND ATIVA');
  assert.equal(ativa['Filial'], 'CEARÁ');
  assert.equal(ativa['Status'], 'ATIVA');
  assert.equal(ativa['Termômetro'], 'QUENTE');
  assert.equal(ativa['Data de criação'], '01/07/2026');
  assert.ok(!ativa['Motivo da perda']);

  const perdida = linhas.find(l => l['Nº proposta'] === '4');
  assert.equal(perdida['Data de criação'], '20/05/2026');
  assert.equal(perdida['Motivo da perda'], 'PREÇO');
  assert.equal(perdida['Termômetro'], 'FRIO');
});

test('aba INSTRUÇÕES lista os motivos de perda válidos', () => {
  const { db, consultorA } = dbComPropostas();
  const wb = XLSX.read(gerarPlanilhaConsultor(db, consultorA), { type: 'buffer' });
  const textos = XLSX.utils.sheet_to_json(wb.Sheets['INSTRUÇÕES'], { header: 1 }).map(l => String(l[0] || ''));
  assert.ok(textos.some(t => t.includes(MOTIVOS_PERDA.join(', '))));
});

const { importarAtualizacoesConsultor, COLUNAS_PROPOSTAS } = require('../src/consultorPlanilha');

function planilhaAtualizacao(linhas) {
  const wb = XLSX.utils.book_new();
  const aoa = [COLUNAS_PROPOSTAS, ...linhas];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('importarAtualizacoesConsultor atualiza status/etapa/termômetro e registra contato', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, 'FECHADA', 'FECHADO', 'MORNO',
      '10/07/2026', 'Cliente confirmou fechamento', '20/07/2026'],
    [999999, '999', 'INEXISTENTE', '', 0, 'ATIVA', '', '', '', '', ''],
  ]);

  const r = importarAtualizacoesConsultor(db, buffer, '2026-07-10');
  assert.equal(r.atualizadas, 1);
  assert.equal(r.contatosAdicionados, 1);
  assert.equal(r.naoEncontradas, 1);

  const p = db.prepare(
    'SELECT status, etapa, termometro, data_fechamento, proxima_data_contato FROM propostas WHERE id = ?'
  ).get(idAtiva);
  assert.equal(p.status, 'FECHADA');
  assert.equal(p.etapa, 'FECHADO');
  assert.equal(p.termometro, 'MORNO');
  assert.equal(p.data_fechamento, '2026-07-10');
  assert.equal(p.proxima_data_contato, '2026-07-20');

  const contato = db.prepare(
    'SELECT data, anotacao, proximo_contato FROM contatos WHERE proposta_id = ?'
  ).get(idAtiva);
  assert.equal(contato.data, '2026-07-10');
  assert.equal(contato.anotacao, 'Cliente confirmou fechamento');
  assert.equal(contato.proximo_contato, '2026-07-20');
});

test('importarAtualizacoesConsultor ignora Status fora da lista aceita', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;
  const antes = db.prepare('SELECT status FROM propostas WHERE id = ?').get(idAtiva);

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, 'TALVEZ', '', '', '', '', ''],
  ]);
  importarAtualizacoesConsultor(db, buffer, '2026-07-10');

  const depois = db.prepare('SELECT status FROM propostas WHERE id = ?').get(idAtiva);
  assert.equal(depois.status, antes.status);
});

test('importarAtualizacoesConsultor limpa termômetro quando a célula vem vazia', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;

  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, '', '', '', '', '', ''],
  ]);
  importarAtualizacoesConsultor(db, buffer, '2026-07-10');

  const depois = db.prepare('SELECT termometro FROM propostas WHERE id = ?').get(idAtiva);
  assert.equal(depois.termometro, null);
});

test('importarAtualizacoesConsultor não conta como atualizada quando nada muda, mas conta quando muda de fato', () => {
  const { db, consultorA } = dbComPropostas();
  const idAtiva = db.prepare("SELECT id FROM propostas WHERE numero = '1'").get().id;
  const idFechada = db.prepare("SELECT id FROM propostas WHERE numero = '2'").get().id;

  // idAtiva: reimporta exatamente o que já está salvo (status ATIVA, etapa e
  // termômetro idênticos aos atuais) — simula reexportar e reimportar sem
  // que o consultor tenha alterado nada nessa linha.
  // idFechada: muda o status de FECHADA para PERDIDA — mudança genuína.
  const buffer = planilhaAtualizacao([
    [idAtiva, '1', 'COND ATIVA', 'CEARÁ', 1000, 'ATIVA', 'EM NEGOCIAÇÃO', 'QUENTE', '', '', ''],
    [idFechada, '2', 'COND FECHADA', 'CEARÁ', 2000, 'PERDIDA', '', '', '', '', ''],
  ]);

  const r = importarAtualizacoesConsultor(db, buffer, '2026-07-10');
  assert.equal(r.atualizadas, 1);

  const inalterada = db.prepare(
    'SELECT status, etapa, termometro FROM propostas WHERE id = ?'
  ).get(idAtiva);
  assert.equal(inalterada.status, 'ATIVA');
  assert.equal(inalterada.etapa, 'EM NEGOCIAÇÃO');
  assert.equal(inalterada.termometro, 'QUENTE');

  const alterada = db.prepare('SELECT status, etapa FROM propostas WHERE id = ?').get(idFechada);
  assert.equal(alterada.status, 'PERDIDA');
  assert.equal(alterada.etapa, 'PERDIDO');
});

// Linhas de 13 colunas: ID, Nº, Cliente, Filial, Valor, Status, Etapa, Termômetro,
// Data novo contato, Anotação, Próximo contato, Data de criação, Motivo da perda
function linha13(id, status, termometro, motivo) {
  return [id, '', '', '', 0, status, '', termometro, '', '', '', '', motivo];
}
const idDe = (db, numero) => db.prepare('SELECT id FROM propostas WHERE numero = ?').get(numero).id;
const lerPerda = (db, id) =>
  db.prepare('SELECT status, termometro, motivo_perda FROM propostas WHERE id = ?').get(id);

test('importação: ATIVA -> PERDIDA força FRIO e grava motivo normalizado', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '1');
  const r = importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', 'QUENTE', ' preço ')]), '2026-07-10');
  assert.deepEqual(lerPerda(db, id), { status: 'PERDIDA', termometro: 'FRIO', motivo_perda: 'PREÇO' });
  assert.equal(r.perdidasSemMotivo, 0);
});

test('importação: ATIVA -> PERDIDA sem motivo importa e avisa', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '1');
  const r = importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', '', '')]), '2026-07-10');
  assert.deepEqual(lerPerda(db, id), { status: 'PERDIDA', termometro: 'FRIO', motivo_perda: null });
  assert.equal(r.perdidasSemMotivo, 1);
});

test('importação: ATIVA -> PERDIDA com motivo fora da lista não grava e avisa', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '1');
  const r = importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', '', 'BLA BLA')]), '2026-07-10');
  assert.equal(lerPerda(db, id).motivo_perda, null);
  assert.equal(r.perdidasSemMotivo, 1);
});

test('importação: perdida existente reimportada sem termômetro/motivo nada muda', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '4');
  const r = importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', '', '')]), '2026-07-10');
  assert.deepEqual(lerPerda(db, id), { status: 'PERDIDA', termometro: 'FRIO', motivo_perda: 'PREÇO' });
  assert.equal(r.atualizadas, 0);
  assert.equal(r.perdidasSemMotivo, 0);
});

test('importação: motivo livre existente é preservado com motivo vazio ou inválido', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '4');
  db.prepare("UPDATE propostas SET motivo_perda = 'CLIENTE COMPROU DO VIZINHO' WHERE id = ?").run(id);
  importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', 'FRIO', '')]), '2026-07-10');
  assert.equal(lerPerda(db, id).motivo_perda, 'CLIENTE COMPROU DO VIZINHO');
  importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'PERDIDA', 'FRIO', 'PREÇO...')]), '2026-07-10');
  assert.equal(lerPerda(db, id).motivo_perda, 'CLIENTE COMPROU DO VIZINHO');
});

test('importação: perdida existente que volta a ATIVA limpa o motivo', () => {
  const { db } = dbComPropostas();
  const id = idDe(db, '4');
  importarAtualizacoesConsultor(db,
    planilhaAtualizacao([linha13(id, 'ATIVA', 'MORNO', 'PREÇO')]), '2026-07-10');
  const p = lerPerda(db, id);
  assert.equal(p.status, 'ATIVA');
  assert.equal(p.motivo_perda, null);
});
