// Histórico das importações já feitas: serve para saber o que entrou no banco,
// quando, a partir de qual arquivo e com qual backup — sem isso, uma
// importação errada vira um mistério dias depois.

function dataHora(agora) {
  const d = n => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${d(agora.getMonth() + 1)}-${d(agora.getDate())}`
    + ` ${d(agora.getHours())}:${d(agora.getMinutes())}`;
}

// Cada importação informa só os números que fazem sentido para ela (a planilha
// do consultor não insere propostas, por exemplo); o que falta conta como 0.
function registrarImportacao(db, registro, agora = new Date()) {
  return db.prepare(`
    INSERT INTO importacoes (data_hora, origem, arquivo, inseridas, atualizadas,
                             sem_mudanca, invalidas, backup)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    dataHora(agora), registro.origem, registro.arquivo || null,
    registro.inseridas || 0, registro.atualizadas || 0,
    registro.semMudanca || 0, registro.invalidas || 0,
    registro.backup || null,
  );
}

// Ordena por id, não por data_hora: duas importações no mesmo minuto têm a
// mesma data_hora, e aí só o id diz qual veio depois.
function listarImportacoes(db, limite = 50) {
  return db.prepare('SELECT * FROM importacoes ORDER BY id DESC LIMIT ?').all(limite);
}

module.exports = { registrarImportacao, listarImportacoes };
