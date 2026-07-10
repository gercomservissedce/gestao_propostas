const XLSX = require('xlsx');

const COLUNAS_PROPOSTAS = [
  'ID', 'Nº proposta', 'Cliente', 'Filial', 'Valor total', 'Status', 'Etapa',
  'Termômetro', 'Data novo contato', 'Anotação do contato', 'Próximo contato',
];

const INSTRUCOES = [
  ['Como preencher esta planilha'],
  [''],
  ['Não altere a coluna ID — ela identifica a proposta na hora de importar de volta.'],
  ['Status: ATIVA, FECHADA ou PERDIDA.'],
  ['Termômetro: QUENTE, MORNO, FRIO ou deixe em branco.'],
  ['Etapa: texto livre (ex.: EM NEGOCIAÇÃO, AGUARDANDO VISITA).'],
  ['Datas no formato dd/mm/aaaa.'],
  ['Preencha "Data novo contato" só se for registrar um contato novo com o cliente.'],
];

function gerarPlanilhaConsultor(db, consultorId) {
  const linhas = db.prepare(`
    SELECT p.id, p.numero, p.cliente, f.estado filial, p.vlr_total, p.status, p.etapa, p.termometro
    FROM propostas p
    LEFT JOIN filiais f ON f.id = p.filial_id
    WHERE p.consultor_id = ? AND p.status = 'ATIVA'
    ORDER BY p.data_emissao DESC
  `).all(consultorId);

  const aoa = [COLUNAS_PROPOSTAS, ...linhas.map(p => [
    p.id, p.numero, p.cliente, p.filial || '', p.vlr_total, p.status, p.etapa || '',
    p.termometro || '', '', '', '',
  ])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROPOSTAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCOES), 'INSTRUÇÕES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { gerarPlanilhaConsultor, COLUNAS_PROPOSTAS };
