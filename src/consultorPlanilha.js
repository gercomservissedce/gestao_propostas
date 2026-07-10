const XLSX = require('xlsx');
const { atualizarProposta } = require('./propostaUpdate');
const { serialExcelParaIso } = require('./parse');

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

const STATUS_VALIDOS = ['ATIVA', 'FECHADA', 'PERDIDA'];
const TERMOMETROS_VALIDOS = ['QUENTE', 'MORNO', 'FRIO'];

// Datas digitadas como texto na planilha do consultor seguem dd/mm/aaaa
// (diferente do toIsoDate de src/parse.js, que assume m/d/aaaa para
// compatibilidade com a planilha legada). Serial do Excel e objeto Date são
// tratados por serialExcelParaIso, compartilhado com toIsoDate.
function paraDataIso(v) {
  if (v == null || v === '') return null;
  const serial = serialExcelParaIso(v);
  if (serial !== undefined) return serial;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  ano = Number(ano);
  if (ano < 100) ano += 2000;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function importarAtualizacoesConsultor(db, buffer, hoje) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets['PROPOSTAS'];
  const linhas = sheet ? XLSX.utils.sheet_to_json(sheet) : [];

  const buscaProposta = db.prepare('SELECT id FROM propostas WHERE id = ?');
  const insContato = db.prepare(
    'INSERT INTO contatos (proposta_id, data, anotacao, proximo_contato) VALUES (?, ?, ?, ?)'
  );
  const atualizaProximoContato = db.prepare(
    'UPDATE propostas SET proxima_data_contato = ? WHERE id = ?'
  );

  const resultado = { atualizadas: 0, contatosAdicionados: 0, naoEncontradas: 0 };

  const importarTudo = db.transaction(() => {
    for (const linha of linhas) {
      const id = Number(linha['ID']);
      if (!id || !buscaProposta.get(id)) { resultado.naoEncontradas++; continue; }

      const dados = {};
      const status = String(linha['Status'] || '').trim().toUpperCase();
      if (STATUS_VALIDOS.includes(status)) dados.status = status;

      const termometro = String(linha['Termômetro'] || '').trim().toUpperCase();
      if (termometro === '') dados.termometro = null;
      else if (TERMOMETROS_VALIDOS.includes(termometro)) dados.termometro = termometro;

      const etapa = String(linha['Etapa'] || '').trim().toUpperCase();
      if (etapa) dados.etapa = etapa;

      const { changes } = atualizarProposta(db, id, dados, hoje);
      if (changes) resultado.atualizadas++;

      const dataContato = paraDataIso(linha['Data novo contato']);
      if (dataContato) {
        const proximoContato = paraDataIso(linha['Próximo contato']);
        insContato.run(id, dataContato, String(linha['Anotação do contato'] || '').trim() || null, proximoContato);
        if (proximoContato) atualizaProximoContato.run(proximoContato, id);
        resultado.contatosAdicionados++;
      }
    }
  });
  importarTudo();

  return resultado;
}

module.exports = { gerarPlanilhaConsultor, importarAtualizacoesConsultor, COLUNAS_PROPOSTAS };
