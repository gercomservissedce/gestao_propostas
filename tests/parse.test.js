const { test } = require('node:test');
const assert = require('node:assert');
const { toIsoDate, toNumber, mapStatus, mapEtapa, normalizar, sincronizarFechamento } = require('../src/parse');

test('toIsoDate converte Date para ISO', () => {
  assert.equal(toIsoDate(new Date(2025, 1, 5)), '2025-02-05');
  assert.equal(toIsoDate(new Date(2024, 10, 11)), '2024-11-11');
});

test('toIsoDate converte string M/D/YY', () => {
  assert.equal(toIsoDate('2/5/25'), '2025-02-05');
  assert.equal(toIsoDate('11/11/24'), '2024-11-11');
  assert.equal(toIsoDate('12/31/26'), '2026-12-31');
});

test('toIsoDate retorna null para vazio/inválido', () => {
  assert.equal(toIsoDate(null), null);
  assert.equal(toIsoDate(undefined), null);
  assert.equal(toIsoDate(''), null);
  assert.equal(toIsoDate('   '), null);
});

test('toNumber aceita número direto', () => {
  assert.equal(toNumber(5685.31), 5685.31);
  assert.equal(toNumber(0), 0);
});

test('toNumber converte texto R$ formato americano', () => {
  assert.equal(toNumber(' R$ 5,685.31 '), 5685.31);
  assert.equal(toNumber('R$ 95.00'), 95);
  assert.equal(toNumber(' R$ -   '), 0);
});

test('toNumber retorna 0 para vazio', () => {
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(''), 0);
});

test('mapStatus mapeia status da planilha', () => {
  assert.equal(mapStatus('Analise Cliente'), 'ATIVA');
  assert.equal(mapStatus('Fechada'), 'FECHADA');
  assert.equal(mapStatus('qualquer coisa'), 'ATIVA');
  assert.equal(mapStatus(null), 'ATIVA');
});

test('mapEtapa normaliza etapa', () => {
  assert.equal(mapEtapa(' em negociação '), 'EM NEGOCIAÇÃO');
  assert.equal(mapEtapa('AGUARDANDO VISITA'), 'AGUARDANDO VISITA');
  assert.equal(mapEtapa(''), null);
  assert.equal(mapEtapa(null), null);
});

test('sincronizarFechamento preenche data e etapa ao fechar (regressão do dashboard)', () => {
  // Fechar pelo formulário sem informar a data: o sistema assume hoje,
  // senão a proposta some do cartão "Fechadas no mês".
  const fechada = { status: 'FECHADA' };
  sincronizarFechamento(fechada, '2026-07-10');
  assert.equal(fechada.data_fechamento, '2026-07-10');
  assert.equal(fechada.etapa, 'FECHADO');

  // Data informada pelo usuário é respeitada
  const comData = { status: 'FECHADA', data_fechamento: '2026-06-01', etapa: 'EM NEGOCIAÇÃO' };
  sincronizarFechamento(comData, '2026-07-10');
  assert.equal(comData.data_fechamento, '2026-06-01');
  assert.equal(comData.etapa, 'FECHADO');

  // Perdida ganha etapa PERDIDO
  const perdida = { status: 'PERDIDA' };
  sincronizarFechamento(perdida, '2026-07-10');
  assert.equal(perdida.etapa, 'PERDIDO');

  // Reabrir limpa a data e a etapa de encerramento
  const reaberta = { status: 'ATIVA', data_fechamento: '2026-06-01', etapa: 'FECHADO' };
  sincronizarFechamento(reaberta, '2026-07-10');
  assert.equal(reaberta.data_fechamento, null);
  assert.equal(reaberta.etapa, null);

  // Sem status no corpo, nada muda
  const soValor = { vlr_total: 100 };
  sincronizarFechamento(soValor, '2026-07-10');
  assert.equal('data_fechamento' in soValor, false);
});

test('normalizar ignora acento e caixa (regressão da busca)', () => {
  // "condomínio" minúsculo acentuado deve casar com "CONDOMÍNIO" maiúsculo,
  // o que o LIKE do SQLite não faz nativamente.
  assert.equal(normalizar('CONDOMÍNIO'), normalizar('condomínio'));
  assert.equal(normalizar('condomínio'), 'condominio');
  assert.equal(normalizar('SÃO PAULO'), 'sao paulo');
  assert.equal(normalizar(null), '');
  assert.equal(normalizar(undefined), '');
});
