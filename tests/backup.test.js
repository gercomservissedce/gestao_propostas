const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDb } = require('../src/db');
const { fazerBackup, MAX_BACKUPS } = require('../src/backup');

function pastaTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gp-backup-'));
}

function bancoComProposta() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO filiais (codigo, tipo, estado) VALUES ('1001','MATRIZ','CEARÁ')").run();
  db.prepare(`INSERT INTO propostas (filial_id, numero, data_emissao, cliente, vlr_total)
    VALUES (1,'27178','2026-07-08','CONDOMINIO GREEN VILLAGE', 3418.15)`).run();
  return db;
}

test('fazerBackup grava uma cópia do banco com data, hora e origem no nome', () => {
  const pasta = pastaTemp();
  const db = bancoComProposta();

  const nome = fazerBackup(db, pasta, 'csv', new Date(2026, 7, 17, 15, 41, 30));

  assert.equal(nome, 'backup-2026-08-17-154130-csv.db');
  assert.ok(fs.existsSync(path.join(pasta, nome)), 'o arquivo de backup deve existir');
});

test('o backup abre e tem os mesmos dados do banco de origem', () => {
  const pasta = pastaTemp();
  const db = bancoComProposta();

  const nome = fazerBackup(db, pasta, 'csv', new Date(2026, 7, 17, 15, 41, 30));

  const copia = new Database(path.join(pasta, nome), { readonly: true });
  const p = copia.prepare("SELECT cliente, vlr_total FROM propostas WHERE numero = '27178'").get();
  assert.equal(p.cliente, 'CONDOMINIO GREEN VILLAGE');
  assert.equal(p.vlr_total, 3418.15);
  copia.close();
});

test('fazerBackup cria a pasta de backups quando ela ainda não existe', () => {
  const pasta = path.join(pastaTemp(), 'backups');
  const db = bancoComProposta();

  const nome = fazerBackup(db, pasta, 'csv', new Date(2026, 7, 17, 15, 41, 30));

  assert.ok(fs.existsSync(path.join(pasta, nome)));
});

test('fazerBackup mantém só os MAX_BACKUPS mais recentes', () => {
  const pasta = pastaTemp();
  const db = bancoComProposta();
  // Backups antigos de mentira: o nome já é cronológico, então basta o nome.
  for (let dia = 1; dia <= MAX_BACKUPS + 5; dia++) {
    const d = String(dia).padStart(2, '0');
    fs.writeFileSync(path.join(pasta, `backup-2026-07-${d}-120000-csv.db`), 'x');
  }

  const nome = fazerBackup(db, pasta, 'csv', new Date(2026, 7, 17, 15, 41, 30));

  const restantes = fs.readdirSync(pasta).sort();
  assert.equal(restantes.length, MAX_BACKUPS);
  assert.ok(restantes.includes(nome), 'o backup recém-criado fica');
  assert.ok(!restantes.includes('backup-2026-07-01-120000-csv.db'), 'o mais antigo sai');
  assert.ok(restantes.includes('backup-2026-07-25-120000-csv.db'), 'os recentes ficam');
});

test('a limpeza não mexe em arquivos que não são backup', () => {
  const pasta = pastaTemp();
  const db = bancoComProposta();
  fs.writeFileSync(path.join(pasta, 'propostas.db'), 'x');
  fs.writeFileSync(path.join(pasta, 'anotacoes.txt'), 'x');
  for (let dia = 1; dia <= MAX_BACKUPS + 3; dia++) {
    const d = String(dia).padStart(2, '0');
    fs.writeFileSync(path.join(pasta, `backup-2026-07-${d}-120000-csv.db`), 'x');
  }

  fazerBackup(db, pasta, 'csv', new Date(2026, 7, 17, 15, 41, 30));

  assert.ok(fs.existsSync(path.join(pasta, 'propostas.db')));
  assert.ok(fs.existsSync(path.join(pasta, 'anotacoes.txt')));
});

test('fazerBackup avisa em português quando não consegue gravar', () => {
  const db = bancoComProposta();
  const arquivo = path.join(pastaTemp(), 'nao-e-pasta');
  fs.writeFileSync(arquivo, 'x'); // pasta de destino é, na verdade, um arquivo

  assert.throws(
    () => fazerBackup(db, arquivo, 'csv', new Date(2026, 7, 17, 15, 41, 30)),
    /backup/i
  );
});

test('dois backups no mesmo segundo não colidem', () => {
  const pasta = pastaTemp();
  const db = bancoComProposta();
  const instante = new Date(2026, 7, 17, 15, 41, 30);

  const primeiro = fazerBackup(db, pasta, 'csv', instante);
  const segundo = fazerBackup(db, pasta, 'csv', instante);

  assert.notEqual(primeiro, segundo);
  assert.ok(fs.existsSync(path.join(pasta, primeiro)), 'o primeiro backup continua lá');
  assert.ok(fs.existsSync(path.join(pasta, segundo)));
});
