const fs = require('node:fs');
const path = require('node:path');

// Quantos backups ficam na pasta. Cada um tem o tamanho do banco (~160 KB
// hoje), então 20 custa uns 3 MB e cobre semanas de importações.
const MAX_BACKUPS = 20;

const PADRAO_NOME = /^backup-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]+\.db$/;

function carimbo(agora) {
  const d = n => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${d(agora.getMonth() + 1)}-${d(agora.getDate())}`
    + `-${d(agora.getHours())}${d(agora.getMinutes())}${d(agora.getSeconds())}`;
}

// Apaga os backups mais velhos. O nome começa por data e hora, então a ordem
// alfabética já é a cronológica — não precisa consultar o sistema de arquivos.
function limpar(pasta) {
  const backups = fs.readdirSync(pasta).filter(n => PADRAO_NOME.test(n)).sort();
  for (const velho of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    fs.rmSync(path.join(pasta, velho), { force: true });
  }
}

// Cópia de segurança do banco antes de uma importação. Usa VACUUM INTO em vez
// de copiar o arquivo: é uma cópia consistente num comando só, sem o risco de
// deixar o -wal para trás e gravar um backup pela metade.
function fazerBackup(db, pasta, origem, agora = new Date()) {
  const nome = `backup-${carimbo(agora)}-${origem}.db`;
  try {
    fs.mkdirSync(pasta, { recursive: true });
    db.prepare('VACUUM INTO ?').run(path.join(pasta, nome));
    limpar(pasta);
  } catch (e) {
    throw new Error(`Não foi possível gravar o backup do banco em ${pasta}: ${e.message}`);
  }
  return nome;
}

module.exports = { fazerBackup, MAX_BACKUPS };
