const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { planejarImportacaoCsv, aplicarImportacaoCsv, csvParaTexto } = require('../src/csvPropostas');

const CABECALHO = 'CODFIL,SIGFIL,Nº PROP.,DATA,NOME DO CLIENTE,TIPO NEGOC.,STATUS,'
  + 'DT. FECHADA,VLR. COMOD.,VLR. SERV. AD.,VLR. MENSAL,VLR.TX.ADESÃO,VLR. VENDA,'
  + 'VLR. INSTAL.,VLR.SRV.ESP.,VLR. TOTAL,VLR. DESC.,VLR. TOTAL C/DESC.,'
  + 'REPRESENTANTE,DescricaoProposta,Observacao';

// Monta uma linha do CSV do ERP com os campos que o teste quiser mudar.
function linha(campos = {}) {
  const c = {
    CODFIL: '1001', SIGFIL: 'Servis Eletrônica Ceará', numero: '27178',
    DATA: '2026-07-08 00:00:00', cliente: 'CONDOMINIO GREEN VILLAGE',
    tipo: 'PORTARIA INTELIGENTE', status: 'Analise Cliente', fechada: '',
    comodato: '"R$3383,15"', servAd: '"R$35,00"', mensal: '"R$3418,15"', adesao: '',
    venda: '"R$0,00"', instal: '', servEsp: '', total: '"R$3418,15"', desc: '',
    totalDesc: '"R$3418,15"', representante: 'LUIS JOSE SANTIAGO CAMPOS',
    descricao: '', observacao: '', ...campos,
  };
  return [c.CODFIL, `"${c.SIGFIL}"`, c.numero, c.DATA, `"${c.cliente}"`, c.tipo,
    c.status, c.fechada, c.comodato, c.servAd, c.mensal, c.adesao, c.venda,
    c.instal, c.servEsp, c.total, c.desc, c.totalDesc, `"${c.representante}"`,
    `"${c.descricao}"`, `"${c.observacao}"`].join(',');
}

function csv(...linhas) {
  return `﻿${CABECALHO}\r\n${linhas.join('\r\n')}\r\n`;
}

function bancoBase() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('LUIS JOSE SANTIAGO CAMPOS','FRANQUEADO')").run();
  return db;
}

test('planejar marca proposta inexistente como nova, com etapa vinda do STATUS', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.novas.length, 1);
  assert.equal(plano.atualizadas.length, 0);
  const nova = plano.novas[0];
  assert.equal(nova.numero, '27178');
  assert.equal(nova.cliente, 'CONDOMINIO GREEN VILLAGE');
  assert.equal(nova.vlr_total, 3418.15);
  assert.equal(nova.dados.status, 'ATIVA');
  assert.equal(nova.dados.etapa, 'ANALISE CLIENTE');
  assert.equal(nova.dados.data_emissao, '2026-07-08');
  assert.equal(nova.dados.vlr_comodato, 3383.15);
  assert.equal(nova.dados.vlr_total_com_desconto, 3418.15);
  assert.equal(nova.dados.vlr_desconto, 0);
  assert.equal(nova.dados.data_fechamento, null);
});

test('planejar trata DT. FECHADA e status de perda nas novas', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ numero: '1', fechada: '2026-07-20 00:00:00' }),
    linha({ numero: '2', status: 'Perdida' }),
    linha({ numero: '3', status: 'Cancelado' }),
  ));
  const por = n => plano.novas.find(x => x.numero === n).dados;
  assert.equal(por('1').status, 'FECHADA');
  assert.equal(por('1').etapa, 'FECHADO');
  assert.equal(por('1').data_fechamento, '2026-07-20');
  assert.equal(por('2').status, 'PERDIDA');
  assert.equal(por('2').etapa, 'PERDIDO');
  assert.equal(por('3').status, 'PERDIDA');
});

test('planejar lista só os campos divergentes de proposta existente', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status, etapa,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PERDIDA','PERDIDO',
    3383.15, 35, 3418.15, 3000, 3000, 1)`).run();

  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.novas.length, 0);
  assert.equal(plano.atualizadas.length, 1);
  const campos = plano.atualizadas[0].mudancas.map(m => m.campo).sort();
  assert.deepEqual(campos, ['vlr_total', 'vlr_total_com_desconto']);
  const total = plano.atualizadas[0].mudancas.find(m => m.campo === 'vlr_total');
  assert.equal(total.de, 3000);
  assert.equal(total.para, 3418.15);
  // status, etapa e demais campos de acompanhamento ficam fora do plano
  assert.equal(plano.atualizadas[0].dados.status, undefined);
  assert.equal(plano.atualizadas[0].dados.etapa, undefined);
});

test('planejar conta como sem mudança quando o CSV está igual ao banco', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, tipo_negocio,
    status, vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PORTARIA INTELIGENTE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1)`).run();

  const plano = planejarImportacaoCsv(db, csv(linha()));
  assert.equal(plano.semMudanca, 1);
  assert.equal(plano.atualizadas.length, 0);
  assert.equal(plano.novas.length, 0);
});

test('planejar não apaga descrição, observação nem consultor com campo vazio no CSV', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto,
    consultor_id, descricao, observacao)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1, 'DESCRICAO DO APP', 'ANOTACAO DO APP')`).run();

  const plano = planejarImportacaoCsv(db, csv(linha({ descricao: '', observacao: '', representante: '' })));
  assert.equal(plano.semMudanca, 1);
  assert.equal(plano.atualizadas.length, 0);
});

test('planejar sobrescreve descrição quando o CSV traz texto', () => {
  const db = bancoBase();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto,
    consultor_id, descricao)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, 1, 'ANTIGA')`).run();

  const plano = planejarImportacaoCsv(db, csv(linha({ descricao: 'UPGRADE DA PORTARIA' })));
  const mudanca = plano.atualizadas[0].mudancas.find(m => m.campo === 'descricao');
  assert.equal(mudanca.de, 'ANTIGA');
  assert.equal(mudanca.para, 'UPGRADE DA PORTARIA');
});

test('planejar aponta filial e consultor que precisarão ser criados', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ CODFIL: '4001', SIGFIL: 'Servis Eletrônica Bahia', numero: '9', representante: 'NOVO REPRESENTANTE' })
  ));
  assert.deepEqual(plano.filiaisNovas, [{ codigo: '4001', nome: 'Servis Eletrônica Bahia' }]);
  assert.deepEqual(plano.consultoresNovos, ['NOVO REPRESENTANTE']);
  assert.equal(plano.novas.length, 1);
});

test('planejar reporta linha sem cliente, com data inválida e repetida no arquivo', () => {
  const db = bancoBase();
  const plano = planejarImportacaoCsv(db, csv(
    linha({ numero: '1', cliente: '' }),
    linha({ numero: '2', DATA: '' }),
    linha({ numero: '3' }),
    linha({ numero: '3' }),
  ));
  assert.equal(plano.invalidas.length, 3);
  assert.equal(plano.novas.length, 1);
  assert.match(plano.invalidas[0].motivo, /filial, número.*cliente/i);
  assert.match(plano.invalidas[1].motivo, /[Dd]ata/);
  assert.match(plano.invalidas[2].motivo, /repetida/i);
  assert.equal(plano.invalidas[2].linha, 5);
});

test('planejar recusa arquivo sem as colunas do ERP e arquivo vazio', () => {
  const db = bancoBase();
  assert.throws(() => planejarImportacaoCsv(db, 'A,B\n1,2\n'), /CODFIL/);
  assert.throws(() => planejarImportacaoCsv(db, `${CABECALHO}\n`), /vazio/i);
});

test('aplicar insere as novas, criando filial e consultor que faltavam', () => {
  const db = bancoBase();
  const resumo = aplicarImportacaoCsv(db, csv(
    linha(),
    linha({ CODFIL: '4001', SIGFIL: 'Servis Eletrônica Bahia', numero: '9', representante: 'NOVO REPRESENTANTE' }),
  ));
  assert.equal(resumo.inseridas, 2);
  assert.equal(resumo.filiaisCriadas, 1);
  assert.equal(resumo.consultoresCriados, 1);

  const p = db.prepare(`SELECT p.*, f.codigo filial_codigo, c.nome consultor
    FROM propostas p JOIN filiais f ON f.id = p.filial_id
    LEFT JOIN consultores c ON c.id = p.consultor_id WHERE p.numero = '9'`).get();
  assert.equal(p.filial_codigo, '4001');
  assert.equal(p.consultor, 'NOVO REPRESENTANTE');
  assert.equal(p.status, 'ATIVA');
  assert.equal(p.etapa, 'ANALISE CLIENTE');
  assert.equal(p.vlr_total, 3418.15);

  const filial = db.prepare("SELECT * FROM filiais WHERE codigo = '4001'").get();
  assert.equal(filial.estado, 'Servis Eletrônica Bahia');
  assert.equal(filial.tipo, 'FILIAL');
});

test('aplicar corrige o valor e preserva todo o acompanhamento do app', () => {
  const db = bancoBase();
  const id = db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    etapa, termometro, proxima_data_contato, data_fechamento, custo_dep01, roi_dep01,
    marcada_relatorio, observacao, vlr_comodato, vlr_serv_adicional, vlr_mensal,
    vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','PERDIDA','PERDIDO','QUENTE',
    '2026-08-10','2026-07-30', 500, 12, 1, 'ANOTACAO DO APP',
    3383.15, 35, 3418.15, 3000, 3000, 1)`).run().lastInsertRowid;
  db.prepare("INSERT INTO contatos (proposta_id, data, anotacao) VALUES (?, '2026-07-20', 'ligou')").run(id);

  const resumo = aplicarImportacaoCsv(db, csv(linha()));
  assert.equal(resumo.inseridas, 0);
  assert.equal(resumo.atualizadas, 1);

  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
  assert.equal(p.vlr_total, 3418.15);            // corrigido pelo ERP
  assert.equal(p.status, 'PERDIDA');             // preservado
  assert.equal(p.etapa, 'PERDIDO');
  assert.equal(p.termometro, 'QUENTE');
  assert.equal(p.proxima_data_contato, '2026-08-10');
  assert.equal(p.data_fechamento, '2026-07-30');
  assert.equal(p.custo_dep01, 500);
  assert.equal(p.roi_dep01, 12);
  assert.equal(p.marcada_relatorio, 1);
  assert.equal(p.observacao, 'ANOTACAO DO APP');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contatos WHERE proposta_id = ?').get(id).n, 1);
});

test('aplicar duas vezes não muda nada na segunda (idempotente)', () => {
  const db = bancoBase();
  const primeira = aplicarImportacaoCsv(db, csv(linha(), linha({ numero: '2' })));
  assert.equal(primeira.inseridas, 2);
  const segunda = aplicarImportacaoCsv(db, csv(linha(), linha({ numero: '2' })));
  assert.equal(segunda.inseridas, 0);
  assert.equal(segunda.atualizadas, 0);
  assert.equal(segunda.semMudanca, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 2);
});

test('aplicar conta as inválidas e não grava nada delas', () => {
  const db = bancoBase();
  const resumo = aplicarImportacaoCsv(db, csv(
    linha({ numero: '1', cliente: '' }),
    linha({ numero: '2' }),
  ));
  assert.equal(resumo.invalidas, 1);
  assert.equal(resumo.inseridas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 1);
});

test('planejar não grava nada (prévia é só leitura)', () => {
  const db = bancoBase();
  planejarImportacaoCsv(db, csv(linha()));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM propostas').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM consultores').get().n, 1);
});

test('aplicar troca o consultor quando o representante do ERP mudou', () => {
  const db = bancoBase();
  const outro = db.prepare("INSERT INTO consultores (nome, tipo) VALUES ('OUTRO CONSULTOR','CLT')")
    .run().lastInsertRowid;
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, status,
    vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_total, vlr_total_com_desconto, consultor_id)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE','ATIVA',
    3383.15, 35, 3418.15, 3418.15, 3418.15, ?)`).run(outro);

  aplicarImportacaoCsv(db, csv(linha()));
  const p = db.prepare(`SELECT c.nome consultor FROM propostas p
    JOIN consultores c ON c.id = p.consultor_id WHERE p.numero = '27178'`).get();
  assert.equal(p.consultor, 'LUIS JOSE SANTIAGO CAMPOS');
});

test('csvParaTexto decodifica UTF-8 e cai para latin1 em arquivo ANSI', () => {
  assert.match(csvParaTexto(Buffer.from('CEARÁ', 'utf8')), /CEARÁ/);
  assert.match(csvParaTexto(Buffer.from('CEARÁ', 'latin1')), /CEARÁ/);
});
