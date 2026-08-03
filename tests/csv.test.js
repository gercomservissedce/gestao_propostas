const { test } = require('node:test');
const assert = require('node:assert');
const { parseCsv } = require('../src/csv');

test('parseCsv usa a primeira linha como cabeçalho', () => {
  const { colunas, registros } = parseCsv('A,B\n1,2\n3,4\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].A, '1');
  assert.equal(registros[0].B, '2');
  assert.equal(registros[1].A, '3');
});

test('parseCsv respeita vírgula dentro de campo entre aspas', () => {
  const { registros } = parseCsv('A,B\n"R$1.234,56","CONDOMINIO A, BLOCO 2"\n');
  assert.equal(registros[0].A, 'R$1.234,56');
  assert.equal(registros[0].B, 'CONDOMINIO A, BLOCO 2');
});

test('parseCsv trata aspas escapadas e quebra de linha dentro do campo', () => {
  const { registros } = parseCsv('A,B\n"diz ""oi""","linha1\nlinha2"\n');
  assert.equal(registros[0].A, 'diz "oi"');
  assert.equal(registros[0].B, 'linha1\nlinha2');
});

test('parseCsv aceita CRLF e BOM', () => {
  const { colunas, registros } = parseCsv('﻿A,B\r\n1,2\r\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.equal(registros[0].A, '1');
  assert.equal(registros[0].B, '2');
});

test('parseCsv ignora linhas vazias', () => {
  const { registros } = parseCsv('A,B\n1,2\n\n\n');
  assert.equal(registros.length, 1);
});

test('parseCsv com só o cabeçalho devolve nenhum registro', () => {
  const { colunas, registros } = parseCsv('A,B\n');
  assert.deepEqual(colunas, ['A', 'B']);
  assert.deepEqual(registros, []);
});

test('parseCsv devolve o número da linha física em _linha', () => {
  const { registros } = parseCsv('A\n1\n2\n');
  assert.equal(registros[0]._linha, 2);
  assert.equal(registros[1]._linha, 3);
});

test('parseCsv preenche com vazio a coluna faltante no fim da linha', () => {
  const { registros } = parseCsv('A,B,C\n1,2\n');
  assert.equal(registros[0].C, '');
});
