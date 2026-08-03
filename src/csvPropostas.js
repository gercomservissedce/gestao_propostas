const { parseCsv } = require('./csv');
const { toIsoDate, toNumberBr } = require('./parse');

const COLUNAS_OBRIGATORIAS = ['CODFIL', 'Nº PROP.', 'DATA', 'NOME DO CLIENTE', 'VLR. TOTAL'];

// coluna do banco -> cabeçalho no CSV do ERP
const VALORES = {
  vlr_comodato: 'VLR. COMOD.',
  vlr_serv_adicional: 'VLR. SERV. AD.',
  vlr_mensal: 'VLR. MENSAL',
  vlr_taxa_adesao: 'VLR.TX.ADESÃO',
  vlr_venda: 'VLR. VENDA',
  vlr_instalacao: 'VLR. INSTAL.',
  vlr_serv_especial: 'VLR.SRV.ESP.',
  vlr_total: 'VLR. TOTAL',
  vlr_desconto: 'VLR. DESC.',
  vlr_total_com_desconto: 'VLR. TOTAL C/DESC.',
};

const CAMPOS_INSERT = [
  'filial_id', 'numero', 'data_emissao', 'cliente', 'tipo_negocio', 'status', 'etapa',
  'data_fechamento', 'consultor_id', 'descricao', 'observacao', ...Object.keys(VALORES),
];

// Export do ERP às vezes vem em UTF-8 (com BOM) e às vezes em ANSI
// (Windows-1252). O caractere de substituição delata o segundo caso.
function csvParaTexto(buffer) {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('�') ? buffer.toString('latin1') : utf8;
}

// Status/etapa só das propostas NOVAS: nas existentes o acompanhamento do app
// manda, e o ERP costuma continuar dizendo "Analise Cliente".
function situacaoDoCsv(statusCsv, dataFechada) {
  const v = String(statusCsv || '').trim().toUpperCase();
  if (dataFechada) return { status: 'FECHADA', etapa: 'FECHADO', data_fechamento: dataFechada };
  if (v.includes('PERDID') || v.includes('CANCEL')) {
    return { status: 'PERDIDA', etapa: 'PERDIDO', data_fechamento: null };
  }
  return { status: 'ATIVA', etapa: v || null, data_fechamento: null };
}

// Dinheiro em REAL: comparar com 2 casas evita "mudança" só por ruído de float.
function valorDiferente(a, b) {
  return Math.round((Number(a) || 0) * 100) !== Math.round((Number(b) || 0) * 100);
}

function planejarImportacaoCsv(db, texto) {
  const { colunas, registros } = parseCsv(texto);
  const faltando = COLUNAS_OBRIGATORIAS.filter(c => !colunas.includes(c));
  if (faltando.length) {
    throw new Error(
      `Este arquivo não parece ser a relação de propostas do ERP — falta a coluna ${faltando.join(', ')}.`
    );
  }
  if (!registros.length) throw new Error('O arquivo está vazio: só tem o cabeçalho.');

  const buscaFilial = db.prepare('SELECT id FROM filiais WHERE codigo = ?');
  const buscaConsultor = db.prepare('SELECT id FROM consultores WHERE nome = ?');
  const buscaProposta = db.prepare(`
    SELECT p.id, p.cliente, p.data_emissao, p.tipo_negocio, p.consultor_id,
           p.descricao, p.observacao, c.nome consultor, ${Object.keys(VALORES).map(v => `p.${v}`).join(', ')}
    FROM propostas p LEFT JOIN consultores c ON c.id = p.consultor_id
    WHERE p.filial_id = ? AND p.numero = ?
  `);

  const plano = {
    novas: [], atualizadas: [], semMudanca: 0, invalidas: [],
    filiaisNovas: [], consultoresNovos: [],
  };
  const vistos = new Set();

  for (const reg of registros) {
    const linha = reg._linha;
    const codFilial = reg['CODFIL'];
    const numero = reg['Nº PROP.'];
    const cliente = reg['NOME DO CLIENTE'];
    if (!codFilial || !numero || !cliente) {
      plano.invalidas.push({ linha, motivo: 'Falta filial, número da proposta ou cliente' });
      continue;
    }
    const dataEmissao = toIsoDate(reg['DATA']);
    if (!dataEmissao) {
      plano.invalidas.push({ linha, motivo: `Data de emissão inválida: "${reg['DATA']}"` });
      continue;
    }
    const chave = `${codFilial}|${numero}`;
    if (vistos.has(chave)) {
      plano.invalidas.push({
        linha, motivo: `Proposta ${numero} repetida no arquivo (vale a primeira ocorrência)`,
      });
      continue;
    }
    vistos.add(chave);

    const filial = buscaFilial.get(codFilial);
    if (!filial && !plano.filiaisNovas.some(f => f.codigo === codFilial)) {
      plano.filiaisNovas.push({ codigo: codFilial, nome: reg['SIGFIL'] || '' });
    }

    const representante = reg['REPRESENTANTE'] || '';
    const consultor = representante ? buscaConsultor.get(representante) : undefined;
    if (representante && !consultor && !plano.consultoresNovos.includes(representante)) {
      plano.consultoresNovos.push(representante);
    }

    const valores = {};
    for (const [coluna, cabecalho] of Object.entries(VALORES)) {
      valores[coluna] = toNumberBr(reg[cabecalho]);
    }
    const tipoNegocio = reg['TIPO NEGOC.'] || '';
    const descricao = reg['DescricaoProposta'] || '';
    const observacao = reg['Observacao'] || '';

    const atual = filial ? buscaProposta.get(filial.id, numero) : undefined;

    if (!atual) {
      plano.novas.push({
        linha, numero, filial_codigo: codFilial, cliente, vlr_total: valores.vlr_total,
        dados: {
          filial_id: filial ? filial.id : null,
          numero, data_emissao: dataEmissao, cliente,
          tipo_negocio: tipoNegocio || 'PORTARIA INTELIGENTE',
          consultor_id: consultor ? consultor.id : null,
          descricao: descricao || null,
          observacao: observacao || null,
          ...situacaoDoCsv(reg['STATUS'], toIsoDate(reg['DT. FECHADA'])),
          ...valores,
        },
      });
      continue;
    }

    const mudancas = [];
    const dados = {};
    const anotar = (campo, de, para) => { mudancas.push({ campo, de, para }); dados[campo] = para; };

    for (const coluna of Object.keys(VALORES)) {
      if (valorDiferente(atual[coluna], valores[coluna])) {
        anotar(coluna, Number(atual[coluna]) || 0, valores[coluna]);
      }
    }
    if (cliente !== atual.cliente) anotar('cliente', atual.cliente, cliente);
    if (dataEmissao !== atual.data_emissao) anotar('data_emissao', atual.data_emissao, dataEmissao);
    // Campo vazio no CSV = ERP não tem a informação; não apaga o que está no app.
    if (tipoNegocio && tipoNegocio !== atual.tipo_negocio) {
      anotar('tipo_negocio', atual.tipo_negocio, tipoNegocio);
    }
    if (descricao && descricao !== atual.descricao) anotar('descricao', atual.descricao, descricao);
    if (observacao && observacao !== atual.observacao) anotar('observacao', atual.observacao, observacao);
    // consultor: mostra o nome na prévia, grava o id. Se o consultor ainda não
    // existe no banco, quem cria é aplicarImportacaoCsv antes de replanejar.
    if (representante && consultor && consultor.id !== atual.consultor_id) {
      mudancas.push({ campo: 'consultor', de: atual.consultor || '—', para: representante });
      dados.consultor_id = consultor.id;
    }

    if (!mudancas.length) { plano.semMudanca++; continue; }
    plano.atualizadas.push({ linha, id: atual.id, numero, cliente, mudancas, dados });
  }

  return plano;
}

module.exports = {
  csvParaTexto, planejarImportacaoCsv, CAMPOS_INSERT, COLUNAS_OBRIGATORIAS,
};
