const Database = require('better-sqlite3');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS filiais (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'FILIAL',
  estado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultores (
  id INTEGER PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'FRANQUEADO',
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS propostas (
  id INTEGER PRIMARY KEY,
  filial_id INTEGER NOT NULL REFERENCES filiais(id),
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  cliente TEXT NOT NULL,
  tipo_negocio TEXT DEFAULT 'PORTARIA INTELIGENTE',
  status TEXT NOT NULL DEFAULT 'ATIVA',
  etapa TEXT,
  data_fechamento TEXT,
  vlr_comodato REAL DEFAULT 0,
  vlr_serv_adicional REAL DEFAULT 0,
  vlr_mensal REAL DEFAULT 0,
  vlr_taxa_adesao REAL DEFAULT 0,
  vlr_venda REAL DEFAULT 0,
  vlr_instalacao REAL DEFAULT 0,
  vlr_serv_especial REAL DEFAULT 0,
  vlr_total REAL DEFAULT 0,
  consultor_id INTEGER REFERENCES consultores(id),
  descricao TEXT,
  observacao TEXT,
  termometro TEXT,
  proxima_data_contato TEXT,
  marcada_relatorio INTEGER NOT NULL DEFAULT 0,
  valor_minimo_fechamento REAL,
  custo_dep01 REAL,
  roi_dep01 REAL,
  custo_dep02 REAL,
  roi_dep02 REAL,
  criada_em TEXT NOT NULL DEFAULT (date('now')),
  UNIQUE (filial_id, numero)
);
CREATE TABLE IF NOT EXISTS contatos (
  id INTEGER PRIMARY KEY,
  proposta_id INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  anotacao TEXT,
  proximo_contato TEXT
);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

const CONFIG_PADRAO = {
  prob_quente: '70',
  prob_morno: '40',
  prob_frio: '10',
  dias_alerta: '30',
};

// Colunas acrescentadas após a criação do banco original: CREATE TABLE IF NOT
// EXISTS não altera tabela existente, então bancos antigos precisam de ALTER.
const MIGRACOES_PROPOSTAS = {
  custo_dep01: 'REAL',
  roi_dep01: 'REAL',
  custo_dep02: 'REAL',
  roi_dep02: 'REAL',
  origem: 'TEXT',
};

function migrar(db) {
  const existentes = new Set(
    db.prepare('PRAGMA table_info(propostas)').all().map(c => c.name)
  );
  for (const [coluna, tipo] of Object.entries(MIGRACOES_PROPOSTAS)) {
    if (!existentes.has(coluna)) db.exec(`ALTER TABLE propostas ADD COLUMN ${coluna} ${tipo}`);
  }
}

function openDb(caminho) {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  migrar(db);
  const ins = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [chave, valor] of Object.entries(CONFIG_PADRAO)) ins.run(chave, valor);
  return db;
}

module.exports = { openDb, SCHEMA_SQL };
