const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { getConfig, dashboardStats, consultorStats } = require('../src/stats');

function hoje(diasAtras = 0) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
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
