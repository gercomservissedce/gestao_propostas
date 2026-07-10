const Consultores = {
  ordem: { coluna: 'valorFechado', desc: true },
  dados: [],
  selecionado: null,

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

    const nomeSelecionado = (this.dados.find(c => c.id === this.selecionado) || {}).nome;

    tela.innerHTML = `
      <div class="linha-filtros" style="margin-bottom:10px">
        <button class="btn btn-primario" id="cons-exportar" ${this.selecionado ? '' : 'disabled'}>Gerar planilha do consultor</button>
        <button class="btn" id="cons-importar" ${this.selecionado ? '' : 'disabled'}>Importar atualizações</button>
        <input type="file" id="cons-arquivo" accept=".xlsx" style="display:none">
        ${nomeSelecionado ? `<span style="color:var(--tinta-2);font-size:12.5px">Selecionado: ${esc(nomeSelecionado)}</span>` : ''}
      </div>
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
          <th></th>
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
            <td><input type="radio" name="consultor-sel" data-id="${c.id}" ${this.selecionado === c.id ? 'checked' : ''}></td>
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
    // Rádio de seleção fica dentro da linha clicável; para o o clique não
    // acionar também a navegação para Propostas, ele precisa de stopPropagation.
    tela.querySelectorAll('input[name="consultor-sel"]').forEach(input => {
      input.onclick = e => e.stopPropagation();
      input.onchange = e => {
        this.selecionado = Number(e.target.dataset.id);
        this.render();
      };
    });

    document.getElementById('cons-exportar').onclick = () => {
      window.location.href = `/api/consultores/${this.selecionado}/exportar`;
    };
    document.getElementById('cons-importar').onclick = () => {
      document.getElementById('cons-arquivo').click();
    };
    document.getElementById('cons-arquivo').onchange = async e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      try {
        const base64 = await new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(leitor.result.split(',')[1]);
          leitor.onerror = reject;
          leitor.readAsDataURL(arquivo);
        });
        const resumo = await apiSend('POST', '/api/consultores/importar-atualizacoes', { arquivo: base64 });
        aviso(`Atualizadas: ${resumo.atualizadas} · Contatos adicionados: ${resumo.contatosAdicionados}` +
          (resumo.naoEncontradas ? ` · Não encontradas: ${resumo.naoEncontradas}` : ''));
        App.recarregarTela();
      } catch (err) {
        aviso(err.message, true);
      } finally {
        e.target.value = '';
      }
    };
  },
};
