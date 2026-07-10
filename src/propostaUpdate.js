const { sincronizarFechamento } = require('./parse');

const CAMPOS_PROPOSTA = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'vlr_comodato', 'vlr_serv_adicional', 'vlr_mensal', 'vlr_taxa_adesao',
  'vlr_venda', 'vlr_instalacao', 'vlr_serv_especial', 'vlr_total', 'consultor_id',
  'descricao', 'observacao', 'termometro', 'proxima_data_contato',
  'marcada_relatorio', 'valor_minimo_fechamento',
  'custo_dep01', 'roi_dep01', 'custo_dep02', 'roi_dep02',
];

function atualizarProposta(db, id, dados, hoje) {
  const b = sincronizarFechamento(dados, hoje);
  const cols = CAMPOS_PROPOSTA.filter(c => b[c] !== undefined);
  if (!cols.length) return { changes: 0, nada: true };
  const stmt = db.prepare(
    `UPDATE propostas SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
  );
  const info = stmt.run(...cols.map(c => b[c] === '' ? null : b[c]), id);
  return { changes: info.changes, nada: false };
}

module.exports = { atualizarProposta, CAMPOS_PROPOSTA };
