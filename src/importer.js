const XLSX = require('xlsx');
const { toIsoDate, toNumber, mapStatus, mapEtapa } = require('./parse');

function importarPlanilha(db, caminhoXlsx) {
  const wb = XLSX.readFile(caminhoXlsx); // datas ficam como serial do Excel (raw)

  const resultado = { inseridas: 0, ignoradas: 0, filiais: 0, consultores: 0 };

  const insFilial = db.prepare(
    'INSERT OR IGNORE INTO filiais (codigo, tipo, estado) VALUES (?, ?, ?)'
  );
  if (wb.Sheets['EMPRESAS']) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets['EMPRESAS'], { raw: true })) {
      const codigo = String(row['CÓDIGO'] || row['CODIGO'] || '').trim();
      if (!codigo) continue;
      const info = insFilial.run(codigo, String(row['TIPO'] || 'FILIAL').trim(), String(row['ESTADO'] || '').trim());
      resultado.filiais += info.changes;
    }
  }

  const insConsultor = db.prepare(
    'INSERT OR IGNORE INTO consultores (nome, tipo) VALUES (?, ?)'
  );
  if (wb.Sheets['CONSULTORES']) {
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets['CONSULTORES'], { raw: true })) {
      const nome = String(row['NOME'] || '').trim();
      if (!nome) continue;
      const info = insConsultor.run(nome, String(row['TIPO'] || 'FRANQUEADO').trim());
      resultado.consultores += info.changes;
    }
  }

  const buscaFilial = db.prepare('SELECT id FROM filiais WHERE codigo = ?');
  const buscaConsultor = db.prepare('SELECT id FROM consultores WHERE nome = ?');
  const existeProposta = db.prepare('SELECT id FROM propostas WHERE filial_id = ? AND numero = ?');
  const insProposta = db.prepare(`
    INSERT INTO propostas (
      filial_id, numero, data_emissao, cliente, tipo_negocio, status, etapa,
      data_fechamento, vlr_comodato, vlr_serv_adicional, vlr_mensal, vlr_taxa_adesao,
      vlr_venda, vlr_instalacao, vlr_serv_especial, vlr_total, consultor_id,
      descricao, observacao, termometro, proxima_data_contato
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insContato = db.prepare(
    'INSERT INTO contatos (proposta_id, data, anotacao) VALUES (?, ?, ?)'
  );

  const rows = wb.Sheets['PROPOSTAS']
    ? XLSX.utils.sheet_to_json(wb.Sheets['PROPOSTAS'], { raw: true })
    : [];

  const importarTudo = db.transaction(() => {
    for (const row of rows) {
      const codFilial = String(row['CODFIL'] || '').trim();
      const numero = String(row['Nº PROP.'] || '').trim();
      const cliente = String(row['NOME DO CLIENTE'] || '').trim();
      if (!codFilial || !numero || !cliente) continue;

      let filial = buscaFilial.get(codFilial);
      if (!filial) {
        insFilial.run(codFilial, 'FILIAL', String(row['EMPRESA'] || '').trim());
        filial = buscaFilial.get(codFilial);
        resultado.filiais++;
      }
      if (existeProposta.get(filial.id, numero)) {
        resultado.ignoradas++;
        continue;
      }

      const nomeConsultor = String(row['CONSULTOR'] || '').trim();
      let consultorId = null;
      if (nomeConsultor) {
        let c = buscaConsultor.get(nomeConsultor);
        if (!c) {
          insConsultor.run(nomeConsultor, 'FRANQUEADO');
          c = buscaConsultor.get(nomeConsultor);
          resultado.consultores++;
        }
        consultorId = c.id;
      }

      const etapa = mapEtapa(row['EM NEGOCIAÇÃO']);
      let status = mapStatus(row['STATUS']);
      if (etapa === 'FECHADO') status = 'FECHADA';
      if (etapa === 'PERDIDO') status = 'PERDIDA';

      const termometroBruto = String(row['TERMOMETRO'] || '').trim().toUpperCase();
      const termometro = ['QUENTE', 'MORNO', 'FRIO'].includes(termometroBruto)
        ? termometroBruto : null;

      const info = insProposta.run(
        filial.id, numero,
        toIsoDate(row['DATA']) || '1900-01-01',
        cliente,
        String(row['TIPO NEGOC.'] || '').trim() || 'PORTARIA INTELIGENTE',
        status, etapa,
        toIsoDate(row['DT. FECHADA']),
        toNumber(row['VLR. COMOD.']), toNumber(row['VLR. SERV. AD.']),
        toNumber(row['VLR. MENSAL']), toNumber(row['VLR.TX.ADESÃO']),
        toNumber(row['VLR. VENDA']), toNumber(row['VLR. INSTAL.']),
        toNumber(row['VLR.SRV.ESP.']), toNumber(row['VLR. TOTAL']),
        consultorId,
        String(row['DESCRIÇÃO PROPOSTA'] || '').trim() || null,
        String(row['OBSERVAÇÃO'] || '').trim() || null,
        termometro,
        toIsoDate(row['PROXIMA DT. CONTATO'])
      );
      resultado.inseridas++;

      const ultimoContato = toIsoDate(row['ULTIMA DT. CONTATO']);
      if (ultimoContato) {
        insContato.run(info.lastInsertRowid, ultimoContato, 'Importado da planilha');
      }
    }
  });
  importarTudo();

  return resultado;
}

module.exports = { importarPlanilha };
