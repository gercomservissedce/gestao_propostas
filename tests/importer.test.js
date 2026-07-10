const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');
const { openDb } = require('../src/db');
const { importarPlanilha } = require('../src/importer');

function criarPlanilhaTeste() {
  const wb = XLSX.utils.book_new();
  const propostas = [
    ['CODFIL', 'EMPRESA', 'Nº PROP.', 'DATA', 'NOME DO CLIENTE', 'TIPO NEGOC.', 'STATUS',
     'DT. FECHADA', 'VLR. COMOD.', 'VLR. SERV. AD.', 'VLR. MENSAL', 'VLR.TX.ADESÃO',
     'VLR. VENDA', 'VLR. INSTAL.', 'VLR.SRV.ESP.', 'VLR. TOTAL', 'CONSULTOR',
     'DESCRIÇÃO PROPOSTA', 'OBSERVAÇÃO', 'ULTIMA DT. CONTATO', 'TERMOMETRO',
     'EM NEGOCIAÇÃO', 'PROXIMA DT. CONTATO'],
    ['1001', 'CEARÁ', '3439', new Date(2024, 10, 11), 'COND FERRARA', 'PORTARIA INTELIGENTE',
     'Analise Cliente', null, 5685.31, 95, 5780.31, null, 0, null, null, 5780.31,
     'CONSULTOR A', null, null, null, 'FRIO', 'EM NEGOCIAÇÃO', null],
    ['1002', 'AMAZONAS', '4001', new Date(2025, 1, 5), 'COND MANAUS', 'PORTARIA INTELIGENTE',
     'Fechada', new Date(2025, 2, 1), 1000, 0, 1000, null, 0, null, null, 1000,
     'CONSULTOR B', 'desc', 'obs', null, 'QUENTE', 'FECHADO', null],
    ['1001', 'CEARÁ', '5000', new Date(2025, 5, 10), 'COND PERDIDO', 'PORTARIA INTELIGENTE',
     'Analise Cliente', null, 2000, 0, 2000, null, 0, null, null, 2000,
     'CONSULTOR A', null, null, null, null, 'PERDIDO', null],
  ];
  const empresas = [
    ['CÓDIGO', 'TIPO', 'ESTADO'],
    ['1001', 'MATRIZ', 'CEARÁ'],
    ['1002', 'FILIAL', 'AMAZONAS'],
  ];
  const consultores = [
    ['NOME', 'TIPO'],
    ['CONSULTOR A', 'FRANQUEADO'],
    ['CONSULTOR B', 'CONSULTOR CLT'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(propostas), 'PROPOSTAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empresas), 'EMPRESAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(consultores), 'CONSULTORES');
  const arquivo = path.join(os.tmpdir(), `teste-import-${process.pid}.xlsx`);
  XLSX.writeFile(wb, arquivo, { cellDates: true });
  return arquivo;
}

test('importarPlanilha popula banco e deduplica na reimportação', () => {
  const arquivo = criarPlanilhaTeste();
  try {
    const db = openDb(':memory:');
    const r1 = importarPlanilha(db, arquivo);
    assert.equal(r1.inseridas, 3);
    assert.equal(r1.ignoradas, 0);
    assert.equal(r1.filiais, 2);
    assert.equal(r1.consultores, 2);

    const p = db.prepare(
      "SELECT p.*, f.codigo AS filial_codigo, c.nome AS consultor FROM propostas p JOIN filiais f ON f.id=p.filial_id LEFT JOIN consultores c ON c.id=p.consultor_id WHERE p.numero='3439'"
    ).get();
    assert.equal(p.data_emissao, '2024-11-11');
    assert.equal(p.vlr_total, 5780.31);
    assert.equal(p.status, 'ATIVA');
    assert.equal(p.etapa, 'EM NEGOCIAÇÃO');
    assert.equal(p.termometro, 'FRIO');
    assert.equal(p.consultor, 'CONSULTOR A');

    // etapa FECHADO força status FECHADA; PERDIDO força PERDIDA
    const fechada = db.prepare("SELECT status, data_fechamento FROM propostas WHERE numero='4001'").get();
    assert.equal(fechada.status, 'FECHADA');
    assert.equal(fechada.data_fechamento, '2025-03-01');
    const perdida = db.prepare("SELECT status, termometro FROM propostas WHERE numero='5000'").get();
    assert.equal(perdida.status, 'PERDIDA');
    assert.equal(perdida.termometro, null);

    // reimportação não duplica
    const r2 = importarPlanilha(db, arquivo);
    assert.equal(r2.inseridas, 0);
    assert.equal(r2.ignoradas, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 3);
  } finally {
    fs.unlinkSync(arquivo);
  }
});
