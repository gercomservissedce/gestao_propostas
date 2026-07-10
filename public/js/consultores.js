const Consultores = {
  ordem: { coluna: 'valorFechado', desc: true },
  dados: [],

  async carregar() {
    this.dados = await apiGet('/api/consultores/stats');
    this.render();
  },

  render() {
    const tela = document.getElementById('tela-consultores');
    const d = [...this.dados].sort((a, b) => {
      const va = a[this.ordem.coluna] ?? -1;
      const vb = b[this.ordem.coluna] ?? -1;
      if (typeof va === 'string') return this.ordem.desc ? vb.localeCompare(va) : va.localeCompare(vb);
      return this.ordem.desc ? vb - va : va - vb;
    });

    const grupo = tipo => {
      const g = this.dados.filter(c => c.tipo === tipo && c.emitidas > 0);
      const emitidas = g.reduce((s, c) => s + c.emitidas, 0);
      const fechadas = g.reduce((s, c) => s + c.fechadas, 0);
      return {
        n: g.length, emitidas, fechadas,
        valor: g.reduce((s, c) => s + c.valorTotal, 0),
        valorFechado: g.reduce((s, c) => s + c.valorFechado, 0),
        conversao: emitidas ? (100 * fechadas) / emitidas : 0,
      };
    };
    const fr = grupo('FRANQUEADO');
    const clt = grupo('CONSULTOR CLT');

    const col = (chave, rotulo) => {
      const seta = this.ordem.coluna === chave ? (this.ordem.desc ? ' ▾' : ' ▴') : '';
      return `<th class="ordenavel num" data-col="${chave}">${rotulo}${seta}</th>`;
    };

    tela.innerHTML = `
      <div class="kpis">
        <div class="cartao kpi">
          <div class="rotulo">Franqueados (${fr.n} com propostas)</div>
          <div class="valor">${fmtMoeda(fr.valorFechado)}</div>
          <div class="detalhe">${fr.emitidas} emitidas · ${fr.fechadas} fechadas · conversão ${fmtPct(fr.conversao)}</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Consultores CLT (${clt.n} com propostas)</div>
          <div class="valor">${fmtMoeda(clt.valorFechado)}</div>
          <div class="detalhe">${clt.emitidas} emitidas · ${clt.fechadas} fechadas · conversão ${fmtPct(clt.conversao)}</div>
        </div>
      </div>
      <div class="cartao"><div class="rolagem">
      <table class="tabela">
        <thead><tr>
          <th class="ordenavel" data-col="nome">Consultor</th>
          <th>Tipo</th>
          ${col('emitidas', 'Emitidas')}
          ${col('valorTotal', 'Valor emitido')}
          ${col('fechadas', 'Fechadas')}
          ${col('valorFechado', 'Valor fechado')}
          ${col('taxaConversao', 'Conversão')}
          ${col('ticketMedio', 'Ticket médio')}
          ${col('tempoMedioFechamentoDias', 'Dias p/ fechar')}
          ${col('paradas', 'Paradas ⚠')}
        </tr></thead>
        <tbody>
          ${d.filter(c => c.emitidas > 0).map(c => `
          <tr class="clicavel" data-id="${c.id}" title="Ver propostas de ${esc(c.nome)}">
            <td>${esc(c.nome)}</td>
            <td style="font-size:11px;color:var(--tinta-2)">${c.tipo === 'FRANQUEADO' ? 'Franqueado' : 'CLT'}</td>
            <td class="num">${c.emitidas}</td>
            <td class="num">${fmtMoeda(c.valorTotal)}</td>
            <td class="num">${c.fechadas}</td>
            <td class="num">${fmtMoeda(c.valorFechado)}</td>
            <td class="num">${fmtPct(c.taxaConversao)}</td>
            <td class="num">${fmtMoeda(c.ticketMedio)}</td>
            <td class="num">${c.tempoMedioFechamentoDias ?? '—'}</td>
            <td class="num">${c.paradas ? `<span class="badge badge-alerta">${c.paradas}</span>` : '0'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>
    `;

    tela.querySelectorAll('th.ordenavel').forEach(th => {
      th.onclick = () => {
        const c = th.dataset.col;
        if (this.ordem.coluna === c) this.ordem.desc = !this.ordem.desc;
        else this.ordem = { coluna: c, desc: true };
        this.render();
      };
    });
    tela.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => {
        Propostas.filtros = { busca: '', filial_id: '', consultor_id: tr.dataset.id, status: '', etapa: '', termometro: '' };
        App.trocarTela('propostas');
      };
    });
  },
};
