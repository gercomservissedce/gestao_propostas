const express = require('express');
const path = require('node:path');
const { importarPlanilha } = require('./importer');
const { getConfig, dashboardStats, consultorStats } = require('./stats');
const { normalizar, sincronizarFechamento } = require('./parse');
const { atualizarProposta, CAMPOS_PROPOSTA } = require('./propostaUpdate');
const { gerarPlanilhaConsultor, importarAtualizacoesConsultor } = require('./consultorPlanilha');
const { csvParaTexto, planejarImportacaoCsv, aplicarImportacaoCsv } = require('./csvPropostas');

function hojeLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CAMINHO_PLANILHA = path.join(__dirname, '..', 'Modelo', 'RELAÇÃO DAS PROPOSTAS CONDOMINIOS.xlsx');

function criarRotas(db) {
  const r = express.Router();

  function filtrosDaQuery(q) {
    return {
      filial_id: q.filial_id ? Number(q.filial_id) : null,
      consultor_id: q.consultor_id ? Number(q.consultor_id) : null,
      de: q.de || null,
      ate: q.ate || null,
      termometro: q.termometro || null,
    };
  }

  r.get('/dashboard', (req, res) => {
    res.json(dashboardStats(db, filtrosDaQuery(req.query)));
  });

  r.get('/propostas', (req, res) => {
    const q = req.query;
    const cond = [];
    const params = [];
    // "busca" fica de fora do SQL: LIKE do SQLite não ignora caixa em acentos
    // (ver normalizar() acima), então o texto é filtrado em JS depois da query.
    if (q.cliente) { cond.push('p.cliente = ?'); params.push(q.cliente); }
    if (q.filial_id) { cond.push('p.filial_id = ?'); params.push(Number(q.filial_id)); }
    if (q.consultor_id) { cond.push('p.consultor_id = ?'); params.push(Number(q.consultor_id)); }
    if (q.status) { cond.push('p.status = ?'); params.push(q.status); }
    if (q.etapa) { cond.push('p.etapa = ?'); params.push(q.etapa); }
    if (q.origem) { cond.push('p.origem = ?'); params.push(q.origem); }
    // padStart aceita tanto mes=6 quanto mes=06; strftime('%m') devolve com zero à esquerda
    if (q.mes) { cond.push("strftime('%m', p.data_emissao) = ?"); params.push(String(q.mes).padStart(2, '0')); }
    if (q.ano) { cond.push("strftime('%Y', p.data_emissao) = ?"); params.push(String(q.ano)); }
    if (q.termometro === 'NULA') cond.push('p.termometro IS NULL');
    else if (q.termometro) { cond.push('p.termometro = ?'); params.push(q.termometro); }
    if (q.marcadas === '1') cond.push('p.marcada_relatorio = 1');
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    let rows = db.prepare(`
      SELECT p.*, c.nome consultor, f.estado filial, f.codigo filial_codigo,
        (SELECT MAX(ct.data) FROM contatos ct WHERE ct.proposta_id = p.id) ultima_data_contato,
        CAST(julianday('now','localtime') - julianday(
          COALESCE((SELECT MAX(ct.data) FROM contatos ct WHERE ct.proposta_id = p.id), p.data_emissao)
        ) AS INTEGER) dias_sem_contato
      FROM propostas p
      LEFT JOIN consultores c ON c.id = p.consultor_id
      LEFT JOIN filiais f ON f.id = p.filial_id
      ${where}
      ORDER BY p.data_emissao DESC, p.id DESC
    `).all(...params);
    if (q.busca) {
      const alvo = normalizar(q.busca);
      rows = rows.filter(p => normalizar(p.cliente).includes(alvo) || normalizar(p.numero).includes(alvo));
    }
    res.json(rows);
  });

  // Precisa vir ANTES de '/propostas/:id': o Express casa as rotas na ordem
  // de declaração e 'anos' seria lido como um id de proposta.
  r.get('/propostas/anos', (req, res) => {
    res.json(db.prepare(`
      SELECT DISTINCT strftime('%Y', data_emissao) ano
      FROM propostas
      WHERE data_emissao IS NOT NULL AND data_emissao <> ''
      ORDER BY ano DESC
    `).all().map(r2 => r2.ano));
  });

  r.get('/propostas/:id', (req, res) => {
    const p = db.prepare(`
      SELECT p.*, c.nome consultor, f.estado filial
      FROM propostas p
      LEFT JOIN consultores c ON c.id = p.consultor_id
      LEFT JOIN filiais f ON f.id = p.filial_id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!p) return res.status(404).json({ erro: 'Proposta não encontrada' });
    p.contatos = db.prepare(
      'SELECT * FROM contatos WHERE proposta_id = ? ORDER BY data DESC, id DESC'
    ).all(req.params.id);
    res.json(p);
  });

  r.post('/propostas', (req, res) => {
    const b = sincronizarFechamento(req.body, hojeLocalIso());
    if (!b.filial_id || !b.numero || !b.data_emissao || !b.cliente) {
      return res.status(400).json({ erro: 'Campos obrigatórios: filial, número, data e cliente' });
    }
    const existe = db.prepare('SELECT id FROM propostas WHERE filial_id = ? AND numero = ?')
      .get(b.filial_id, b.numero);
    if (existe) return res.status(409).json({ erro: `Já existe a proposta ${b.numero} nessa filial` });
    const cols = CAMPOS_PROPOSTA.filter(c => b[c] !== undefined);
    const stmt = db.prepare(
      `INSERT INTO propostas (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    );
    const info = stmt.run(...cols.map(c => b[c] === '' ? null : b[c]));
    res.status(201).json({ id: info.lastInsertRowid });
  });

  r.put('/propostas/:id', (req, res) => {
    const { changes, nada } = atualizarProposta(db, req.params.id, req.body, hojeLocalIso());
    if (nada) return res.status(400).json({ erro: 'Nada para atualizar' });
    if (!changes) return res.status(404).json({ erro: 'Proposta não encontrada' });
    res.json({ ok: true });
  });

  r.delete('/propostas/:id', (req, res) => {
    const info = db.prepare('DELETE FROM propostas WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ erro: 'Proposta não encontrada' });
    res.json({ ok: true });
  });

  r.post('/propostas/:id/contatos', (req, res) => {
    const { data, anotacao, proximo_contato } = req.body;
    if (!data) return res.status(400).json({ erro: 'Data do contato é obrigatória' });
    const info = db.prepare(
      'INSERT INTO contatos (proposta_id, data, anotacao, proximo_contato) VALUES (?,?,?,?)'
    ).run(req.params.id, data, anotacao || null, proximo_contato || null);
    if (proximo_contato) {
      db.prepare('UPDATE propostas SET proxima_data_contato = ? WHERE id = ?')
        .run(proximo_contato, req.params.id);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  });

  r.get('/clientes', (req, res) => {
    res.json(db.prepare('SELECT DISTINCT cliente FROM propostas ORDER BY cliente').all().map(r2 => r2.cliente));
  });

  r.get('/consultores', (req, res) => {
    res.json(db.prepare('SELECT * FROM consultores WHERE ativo = 1 ORDER BY nome').all());
  });

  r.get('/consultores/stats', (req, res) => {
    res.json(consultorStats(db, filtrosDaQuery(req.query)));
  });

  r.get('/consultores/:id/exportar', (req, res) => {
    const consultor = db.prepare('SELECT * FROM consultores WHERE id = ?').get(req.params.id);
    if (!consultor) return res.status(404).json({ erro: 'Consultor não encontrado' });
    const buffer = gerarPlanilhaConsultor(db, consultor.id);
    const nomeArquivo = `${consultor.nome.replace(/[^\w\-À-ÿ ]/g, '')}-propostas-${hojeLocalIso()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  });

  r.post('/consultores/importar-atualizacoes', (req, res) => {
    if (!req.body.arquivo) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    try {
      const buffer = Buffer.from(req.body.arquivo, 'base64');
      res.json(importarAtualizacoesConsultor(db, buffer, hojeLocalIso()));
    } catch (e) {
      res.status(400).json({ erro: `Falha ao importar planilha: ${e.message}` });
    }
  });

  r.get('/filiais', (req, res) => {
    res.json(db.prepare('SELECT * FROM filiais ORDER BY codigo').all());
  });

  r.get('/config', (req, res) => res.json(getConfig(db)));

  r.put('/config', (req, res) => {
    const upd = db.prepare('UPDATE config SET valor = ? WHERE chave = ?');
    for (const chave of ['prob_quente', 'prob_morno', 'prob_frio', 'dias_alerta']) {
      if (req.body[chave] !== undefined) upd.run(String(Number(req.body[chave])), chave);
    }
    res.json(getConfig(db));
  });

  r.post('/importar', (req, res) => {
    try {
      res.json(importarPlanilha(db, CAMINHO_PLANILHA));
    } catch (e) {
      res.status(500).json({ erro: `Falha na importação: ${e.message}` });
    }
  });

  function textoCsvDoCorpo(body) {
    if (!body || !body.arquivo) throw new Error('Nenhum arquivo enviado');
    return csvParaTexto(Buffer.from(body.arquivo, 'base64'));
  }

  r.post('/importar-csv/previa', (req, res) => {
    try {
      res.json(planejarImportacaoCsv(db, textoCsvDoCorpo(req.body)));
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  });

  r.post('/importar-csv', (req, res) => {
    try {
      res.json(aplicarImportacaoCsv(db, textoCsvDoCorpo(req.body)));
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  });

  r.post('/relatorio/pdf', async (req, res) => {
    try {
      const { gerarPdf } = require('./pdf');
      const arquivo = await gerarPdf(`http://localhost:${req.socket.localPort}`);
      res.json({ arquivo });
    } catch (e) {
      res.status(500).json({ erro: `Falha ao gerar PDF: ${e.message}` });
    }
  });

  return r;
}

module.exports = { criarRotas, CAMINHO_PLANILHA };
