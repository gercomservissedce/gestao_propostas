const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { getConfig, dashboardStats, consultorStats, evolucaoMensal } = require('../src/stats');

function hoje(diasAtras = 0) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

function mes(diasAtras = 0) {
  return hoje(diasAtras).slice(0, 7);
}

function seedDb() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('ANA','FRANQUEADO')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('BETO','CONSULTOR CLT')").run();
  const ins = db.prepare(`INSERT INTO propostas
    (filial_id, numero, data_emissao, cliente, status, etapa, data_fechamento, vlr_total, consultor_id, termometro)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // ATIVAS: quente 1000, morno 2000, frio 3000, sem classificação 4000
  ins.run('1', hoje(10), 'CLI QUENTE', 'ATIVA', 'EM NEGOCIAÇÃO', null, 1000, 1, 'QUENTE');
  ins.run('2', hoje(50), 'CLI MORNO', 'ATIVA', 'EM NEGOCIAÇÃO', null, 2000, 1, 'MORNO');
  ins.run('3', hoje(50), 'CLI FRIO', 'ATIVA', 'AGUARDANDO VISITA', null, 3000, 2, 'FRIO');
  ins.run('4', hoje(5), 'CLI NOVO', 'ATIVA', null, null, 4000, 2, null);
  // FECHADA neste mês (emitida há 20 dias, fechada hoje) e PERDIDA
  ins.run('5', hoje(20), 'CLI FECHADO', 'FECHADA', 'FECHADO', hoje(0), 5000, 1, null);
  ins.run('6', hoje(90), 'CLI PERDIDO', 'PERDIDA', 'PERDIDO', null, 6000, 2, null);
  // contato recente na proposta 2 (morno) → não está esquecida
  db.prepare("INSERT INTO contatos (proposta_id, data, anotacao) VALUES (2, ?, 'ligação')").run(hoje(3));
  return db;
}

test('getConfig retorna números', () => {
  const db = openDb(':memory:');
  const cfg = getConfig(db);
  assert.deepEqual(cfg, { prob_quente: 70, prob_morno: 40, prob_frio: 10, dias_alerta: 30 });
});

test('dashboardStats calcula totais, previsão e esquecidas', () => {
  const db = seedDb();
  const s = dashboardStats(db, {});
  assert.equal(s.totalAtivas.qtde, 4);
  assert.equal(s.totalAtivas.valor, 10000);
  // 1000*0.7 + 2000*0.4 + 3000*0.1 = 1800 (sem classificação não pontua)
  assert.equal(s.previsaoPonderada, 1800);
  assert.equal(s.fechadasMes.qtde, 1);
  assert.equal(s.fechadasMes.valor, 5000);
  // conversão: 1 fechada / 6 total
  assert.ok(Math.abs(s.taxaConversao - 100 / 6) < 0.01);
  assert.equal(s.naoClassificadas, 1);
  // esquecidas: proposta 3 (frio, 50 dias sem contato). Proposta 2 tem contato há 3 dias.
  const ids = s.esquecidas.map(e => e.numero);
  assert.ok(ids.includes('3'));
  assert.ok(!ids.includes('2'));
  assert.ok(!ids.includes('1'));
  const term = Object.fromEntries(s.termometro.map(t => [t.nivel, t.qtde]));
  assert.equal(term.QUENTE, 1);
  assert.equal(term['NÃO CLASSIFICADA'], 1);
});

test('consultorStats agrega por consultor', () => {
  const db = seedDb();
  const lista = consultorStats(db, {});
  const ana = lista.find(c => c.nome === 'ANA');
  assert.equal(ana.emitidas, 3);
  assert.equal(ana.valorTotal, 8000);
  assert.equal(ana.fechadas, 1);
  assert.equal(ana.valorFechado, 5000);
  assert.ok(Math.abs(ana.taxaConversao - 100 / 3) < 0.01);
  assert.equal(ana.tempoMedioFechamentoDias, 20);
  const beto = lista.find(c => c.nome === 'BETO');
  assert.equal(beto.emitidas, 3);
  assert.equal(beto.fechadas, 0);
});

test('dashboardStats aplica filtro de consultor', () => {
  const db = seedDb();
  const s = dashboardStats(db, { consultor_id: 1 });
  assert.equal(s.totalAtivas.qtde, 2); // propostas 1 e 2
  assert.equal(s.totalAtivas.valor, 3000);
});

test('dashboardStats aplica filtro de tipo_consultor', () => {
  const db = seedDb();
  // ANA é FRANQUEADO: propostas 1 e 2 estão ATIVAS (3000)
  const franqueados = dashboardStats(db, { tipo_consultor: 'FRANQUEADO' });
  assert.equal(franqueados.totalAtivas.qtde, 2);
  assert.equal(franqueados.totalAtivas.valor, 3000);
  // BETO é CONSULTOR CLT: propostas 3 e 4 estão ATIVAS (7000)
  const clt = dashboardStats(db, { tipo_consultor: 'CONSULTOR CLT' });
  assert.equal(clt.totalAtivas.qtde, 2);
  assert.equal(clt.totalAtivas.valor, 7000);
});

test('consultorStats aplica filtro de termômetro e datas', () => {
  const db = seedDb();

  // QUENTE: só a proposta 1 (ANA, ATIVA, 1000)
  const quentes = consultorStats(db, { termometro: 'QUENTE' });
  const anaQ = quentes.find(c => c.nome === 'ANA');
  assert.equal(anaQ.emitidas, 1);
  assert.equal(anaQ.valorTotal, 1000);
  assert.equal(anaQ.fechadas, 0);
  const betoQ = quentes.find(c => c.nome === 'BETO');
  assert.equal(betoQ.emitidas, 0); // BETO segue na lista (ativo=1), sem propostas no recorte

  // NULA: propostas 4 (BETO 4000), 5 (ANA FECHADA 5000) e 6 (BETO PERDIDA 6000)
  const nulas = consultorStats(db, { termometro: 'NULA' });
  const anaN = nulas.find(c => c.nome === 'ANA');
  assert.equal(anaN.emitidas, 1);
  assert.equal(anaN.valorFechado, 5000);
  const betoN = nulas.find(c => c.nome === 'BETO');
  assert.equal(betoN.emitidas, 2);

  // Período: últimos 15 dias → proposta 1 (ANA) e proposta 4 (BETO)
  const recentes = consultorStats(db, { de: hoje(15) });
  assert.equal(recentes.find(c => c.nome === 'ANA').emitidas, 1);
  assert.equal(recentes.find(c => c.nome === 'BETO').emitidas, 1);

  // Combinado: termômetro + período sem interseção → ninguém tem emitidas
  const vazio = consultorStats(db, { termometro: 'MORNO', de: hoje(15) });
  assert.ok(vazio.every(c => c.emitidas === 0));
});

test('dashboardStats calcula geradas, fechadasTotal e perdidas', () => {
  const db = seedDb();
  const s = dashboardStats(db, {});
  assert.equal(s.geradas.qtde, 6);
  assert.equal(s.geradas.valor, 21000);
  assert.equal(s.fechadasTotal.qtde, 1);
  assert.equal(s.fechadasTotal.valor, 5000);
  assert.equal(s.perdidas.qtde, 1);
  assert.equal(s.perdidas.valor, 6000);
});

test('dashboardStats aplica filtro de consultor a geradas/fechadasTotal/perdidas', () => {
  const db = seedDb();
  const s = dashboardStats(db, { consultor_id: 1 }); // ANA: propostas 1, 2, 5
  assert.equal(s.geradas.qtde, 3);
  assert.equal(s.geradas.valor, 8000);
  assert.equal(s.fechadasTotal.qtde, 1);
  assert.equal(s.fechadasTotal.valor, 5000);
  assert.equal(s.perdidas.qtde, 0);
  assert.equal(s.perdidas.valor, 0);
});

function seedEvolucao() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('ANA','FRANQUEADO')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('BETO','CONSULTOR CLT')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('CARLA','FRANQUEADO')").run();
  const ins = db.prepare(`INSERT INTO propostas
    (filial_id, numero, data_emissao, cliente, status, vlr_total, consultor_id)
    VALUES (1, ?, ?, ?, 'ATIVA', ?, ?)`);
  ins.run('1', hoje(0), 'CLI 1', 1000, 1);  // ANA (FRANQUEADO), mês atual
  ins.run('2', hoje(0), 'CLI 2', 1000, 3);  // CARLA (FRANQUEADO), mês atual
  ins.run('3', hoje(0), 'CLI 3', 1000, 2);  // BETO (CONSULTOR CLT), mês atual
  ins.run('4', hoje(40), 'CLI 4', 1000, 1); // ANA, mês anterior
  return db;
}

test('evolucaoMensal com consultor selecionado retorna série única do consultor', () => {
  const db = seedEvolucao();
  const r = evolucaoMensal(db, { consultor_id: 1 });
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].nome, 'ANA');
  const idxAtual = r.meses.indexOf(mes(0));
  const idxAnterior = r.meses.indexOf(mes(40));
  assert.equal(r.series[0].dados[idxAtual], 1);
  assert.equal(r.series[0].dados[idxAnterior], 1);
});

test('evolucaoMensal sem consultor selecionado agrega por tipo de consultor', () => {
  const db = seedEvolucao();
  const r = evolucaoMensal(db, {});
  const franqueado = r.series.find(s => s.nome === 'FRANQUEADO');
  const clt = r.series.find(s => s.nome === 'CONSULTOR CLT');
  const idxAtual = r.meses.indexOf(mes(0));
  const idxAnterior = r.meses.indexOf(mes(40));
  assert.equal(franqueado.dados[idxAtual], 2); // ANA + CARLA no mês atual
  assert.equal(clt.dados[idxAtual], 1); // BETO
  assert.equal(franqueado.dados[idxAnterior], 1); // ANA no mês anterior
  assert.equal(clt.dados[idxAnterior], 0);
});

test('evolucaoMensal usa o intervalo de/até quando informado, em vez dos últimos 12 meses', () => {
  const db = seedEvolucao();
  const r = evolucaoMensal(db, { de: hoje(10), ate: hoje(0) });
  assert.ok(r.meses.includes(mes(0)));
  assert.ok(!r.meses.includes(mes(40)));
});
