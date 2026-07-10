function getConfig(db) {
  const rows = db.prepare('SELECT chave, valor FROM config').all();
  const cfg = Object.fromEntries(rows.map(r => [r.chave, Number(r.valor)]));
  return {
    prob_quente: cfg.prob_quente ?? 70,
    prob_morno: cfg.prob_morno ?? 40,
    prob_frio: cfg.prob_frio ?? 10,
    dias_alerta: cfg.dias_alerta ?? 30,
  };
}

// Monta WHERE dinâmico sobre a tabela propostas (alias p)
function filtroSql(filtros = {}) {
  const cond = [];
  const params = [];
  if (filtros.filial_id) { cond.push('p.filial_id = ?'); params.push(filtros.filial_id); }
  if (filtros.consultor_id) { cond.push('p.consultor_id = ?'); params.push(filtros.consultor_id); }
  if (filtros.de) { cond.push('p.data_emissao >= ?'); params.push(filtros.de); }
  if (filtros.ate) { cond.push('p.data_emissao <= ?'); params.push(filtros.ate); }
  return { where: cond.length ? 'AND ' + cond.join(' AND ') : '', params };
}

function dashboardStats(db, filtros = {}) {
  const cfg = getConfig(db);
  const { where, params } = filtroSql(filtros);

  const totalAtivas = db.prepare(`
    SELECT COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
    FROM propostas p WHERE status='ATIVA' ${where}
  `).get(...params);

  const prev = db.prepare(`
    SELECT COALESCE(SUM(CASE termometro
      WHEN 'QUENTE' THEN vlr_total * ? / 100.0
      WHEN 'MORNO' THEN vlr_total * ? / 100.0
      WHEN 'FRIO' THEN vlr_total * ? / 100.0
      ELSE 0 END), 0) v
    FROM propostas p WHERE status='ATIVA' ${where}
  `).get(cfg.prob_quente, cfg.prob_morno, cfg.prob_frio, ...params);

  const fechadasMes = db.prepare(`
    SELECT COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
    FROM propostas p
    WHERE status='FECHADA' AND strftime('%Y-%m', data_fechamento) = strftime('%Y-%m', 'now', 'localtime') ${where}
  `).get(...params);

  const conv = db.prepare(`
    SELECT
      SUM(CASE WHEN status='FECHADA' THEN 1 ELSE 0 END) fechadas,
      COUNT(*) total
    FROM propostas p WHERE 1=1 ${where}
  `).get(...params);

  const funil = db.prepare(`
    SELECT COALESCE(etapa, 'SEM ETAPA') etapa, COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
    FROM propostas p WHERE status='ATIVA' ${where}
    GROUP BY COALESCE(etapa, 'SEM ETAPA')
    ORDER BY valor DESC
  `).all(...params);

  const termometro = db.prepare(`
    SELECT COALESCE(termometro, 'NÃO CLASSIFICADA') nivel, COUNT(*) qtde, COALESCE(SUM(vlr_total),0) valor
    FROM propostas p WHERE status='ATIVA' ${where}
    GROUP BY COALESCE(termometro, 'NÃO CLASSIFICADA')
  `).all(...params);

  const esquecidas = db.prepare(`
    SELECT p.id, p.numero, p.cliente, p.vlr_total valor, p.termometro,
      c.nome consultor, f.estado filial,
      CAST(julianday('now', 'localtime') - julianday(
        COALESCE((SELECT MAX(ct.data) FROM contatos ct WHERE ct.proposta_id = p.id), p.data_emissao)
      ) AS INTEGER) diasSemContato
    FROM propostas p
    LEFT JOIN consultores c ON c.id = p.consultor_id
    LEFT JOIN filiais f ON f.id = p.filial_id
    WHERE p.status='ATIVA' ${where}
      AND julianday('now', 'localtime') - julianday(
        COALESCE((SELECT MAX(ct.data) FROM contatos ct WHERE ct.proposta_id = p.id), p.data_emissao)
      ) > ?
    ORDER BY p.vlr_total DESC
  `).all(...params, cfg.dias_alerta);

  const naoClassificadas = db.prepare(`
    SELECT COUNT(*) n FROM propostas p WHERE status='ATIVA' AND termometro IS NULL ${where}
  `).get(...params).n;

  return {
    totalAtivas: { qtde: totalAtivas.qtde, valor: totalAtivas.valor },
    previsaoPonderada: prev.v,
    fechadasMes: { qtde: fechadasMes.qtde, valor: fechadasMes.valor },
    taxaConversao: conv.total ? (100 * (conv.fechadas || 0)) / conv.total : 0,
    funil,
    termometro,
    esquecidas,
    naoClassificadas,
    config: cfg,
  };
}

function consultorStats(db, filtros = {}) {
  const cfg = getConfig(db);
  const { where, params } = filtroSql(filtros);
  return db.prepare(`
    SELECT
      c.id, c.nome, c.tipo,
      COUNT(p.id) emitidas,
      COALESCE(SUM(p.vlr_total), 0) valorTotal,
      SUM(CASE WHEN p.status='FECHADA' THEN 1 ELSE 0 END) fechadas,
      COALESCE(SUM(CASE WHEN p.status='FECHADA' THEN p.vlr_total ELSE 0 END), 0) valorFechado,
      CASE WHEN COUNT(p.id) > 0
        THEN 100.0 * SUM(CASE WHEN p.status='FECHADA' THEN 1 ELSE 0 END) / COUNT(p.id)
        ELSE 0 END taxaConversao,
      CASE WHEN COUNT(p.id) > 0 THEN COALESCE(SUM(p.vlr_total), 0) / COUNT(p.id) ELSE 0 END ticketMedio,
      (SELECT ROUND(AVG(julianday(p2.data_fechamento) - julianday(p2.data_emissao)))
        FROM propostas p2
        WHERE p2.consultor_id = c.id AND p2.status='FECHADA' AND p2.data_fechamento IS NOT NULL
      ) tempoMedioFechamentoDias,
      SUM(CASE WHEN p.status='ATIVA' AND
        julianday('now', 'localtime') - julianday(
          COALESCE((SELECT MAX(ct.data) FROM contatos ct WHERE ct.proposta_id = p.id), p.data_emissao)
        ) > ? THEN 1 ELSE 0 END) paradas
    FROM consultores c
    LEFT JOIN propostas p ON p.consultor_id = c.id ${where.replace(/^AND/, 'AND')}
    GROUP BY c.id
    HAVING COUNT(p.id) > 0 OR c.ativo = 1
    ORDER BY valorFechado DESC, valorTotal DESC
  `).all(cfg.dias_alerta, ...params);
}

module.exports = { getConfig, dashboardStats, consultorStats, filtroSql };
