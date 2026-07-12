const Consultores = {
  ordem: 'valorFechado',
  filtroTipo: '',
  filtros: { de: '', ate: '', termometro: '' },
  dados: [],

  async carregar() {
    const query = new URLSearchParams(
      Object.entries(this.filtros).filter(([, v]) => v)).toString();
    this.dados = await apiGet('/api/consultores/stats' + (query ? '?' + query : ''));
    this.render();
  },

  aplicarFiltro(campo, valor) {
    this.filtros[campo] = valor;
    this.carregar().catch(e => aviso(e.message, true));
  },

  iniciais(nome) {
    const partes = String(nome).trim().split(/\s+/);
    return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
  },

  avatarCor(nome) {
    const cores = ['#3e7cb1', '#2e7d46', '#b87503', '#7b5cb8', '#c2503f', '#178f8f'];
    let h = 0;
    for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return cores[h % cores.length];
  },

  render() {
    const tela = document.getElementById('tela-consultores');

    const grupo = tipo => {
      const g = this.dados.filter(c => c.tipo === tipo && c.emitidas > 0);
      const emitidas = g.reduce((s, c) => s + c.emitidas, 0);
      const fechadas = g.reduce((s, c) => s + c.fechadas, 0);
      return {
        n: g.length, emitidas, fechadas,
        valorFechado: g.reduce((s, c) => s + c.valorFechado, 0),
        conversao: emitidas ? (100 * fechadas) / emitidas : 0,
      };
    };
    const fr = grupo('FRANQUEADO');
    const clt = grupo('CONSULTOR CLT');

    const ativos = this.dados.filter(c =>
      c.emitidas > 0 && (!this.filtroTipo || c.tipo === this.filtroTipo));
    const d = [...ativos].sort((a, b) => (b[this.ordem] ?? -1) - (a[this.ordem] ?? -1));
    const maximo = chave => Math.max(1, ...ativos.map(c => c[chave] || 0));
    const maximos = {
      emitidas: maximo('emitidas'), valorTotal: maximo('valorTotal'),
      fechadas: maximo('fechadas'), valorFechado: maximo('valorFechado'),
    };

    const metrica = (c, chave, rotulo, valor, cor) => `
      <div class="rep-metrica">
        <div class="rotulo">${rotulo}</div>
        <div class="valor" style="color:var(${cor})">${valor}</div>
        <div class="rep-barra"><div style="width:${Math.round(100 * (c[chave] || 0) / maximos[chave])}%;background:var(${cor})"></div></div>
      </div>`;

    const opcoesOrdem = [
      ['valorFechado', 'Valor fechado'],
      ['emitidas', 'Emitidas'],
      ['taxaConversao', 'Conversão'],
      ['valorTotal', 'Valor emitido'],
    ];

    tela.innerHTML = `
      <div class="linha-filtros" style="margin-bottom:10px">
        <button class="btn" id="cons-importar">Importar atualizações</button>
        <input type="file" id="cons-arquivo" accept=".xlsx" style="display:none">
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
      <div class="linha-filtros">
        <div class="campo"><label>Emitidas de</label><input type="date" id="cons-de" value="${this.filtros.de}"></div>
        <div class="campo"><label>até</label><input type="date" id="cons-ate" value="${this.filtros.ate}"></div>
        <div class="campo"><label>Termômetro</label>
          <select id="cons-termometro">
            <option value="">Todos</option>
            <option value="QUENTE" ${this.filtros.termometro === 'QUENTE' ? 'selected' : ''}>Quente</option>
            <option value="MORNO" ${this.filtros.termometro === 'MORNO' ? 'selected' : ''}>Morno</option>
            <option value="FRIO" ${this.filtros.termometro === 'FRIO' ? 'selected' : ''}>Frio</option>
            <option value="NULA" ${this.filtros.termometro === 'NULA' ? 'selected' : ''}>Não classificada</option>
          </select>
        </div>
        <div class="campo"><label>Tipo</label>
          <select id="cons-tipo">
            <option value="">Todos</option>
            <option value="FRANQUEADO" ${this.filtroTipo === 'FRANQUEADO' ? 'selected' : ''}>Franqueados</option>
            <option value="CONSULTOR CLT" ${this.filtroTipo === 'CONSULTOR CLT' ? 'selected' : ''}>CLT</option>
          </select>
        </div>
        <div class="campo"><label>Ordenar por</label>
          <select id="cons-ordem">
            ${opcoesOrdem.map(([v, r]) => `<option value="${v}" ${this.ordem === v ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <button class="btn" id="cons-limpar">Limpar</button>
        <span class="cons-contador">${d.length} ${d.length === 1 ? 'consultor' : 'consultores'}</span>
      </div>
      ${d.length === 0
        ? `<div class="cartao" style="text-align:center;color:var(--tinta-2);padding:28px">Nenhum consultor encontrado para o filtro selecionado.</div>`
        : `<div class="rep-grade">
        ${d.map(c => `
        <div class="rep-cartao">
          <div class="rep-topo">
            <div class="rep-avatar" style="background:${this.avatarCor(c.nome)}">${this.iniciais(c.nome)}</div>
            <div class="rep-id">
              <div class="rep-nome">${esc(c.nome)}</div>
              <span class="badge ${c.tipo === 'FRANQUEADO' ? 'badge-FRANQUEADO' : 'badge-CLT'}">${c.tipo === 'FRANQUEADO' ? 'Franqueado' : 'CLT'}</span>
            </div>
          </div>
          <div class="rep-metricas">
            ${metrica(c, 'emitidas', 'Emitidas', c.emitidas, '--frio')}
            ${metrica(c, 'valorTotal', 'Valor emitido', fmtMoeda(c.valorTotal), '--frio')}
            ${metrica(c, 'fechadas', 'Fechadas', c.fechadas, '--fechada')}
            ${metrica(c, 'valorFechado', 'Valor fechado', fmtMoeda(c.valorFechado), '--fechada')}
          </div>
          <div class="rep-acoes">
            <button class="btn" data-ver="${c.id}">📋 Ver propostas</button>
            <button class="btn" data-planilha="${c.id}">📊 Gerar planilha</button>
          </div>
        </div>`).join('')}
      </div>`
      }
    `;

    document.getElementById('cons-de').onchange = e => this.aplicarFiltro('de', e.target.value);
    document.getElementById('cons-ate').onchange = e => this.aplicarFiltro('ate', e.target.value);
    document.getElementById('cons-termometro').onchange = e => this.aplicarFiltro('termometro', e.target.value);
    document.getElementById('cons-limpar').onclick = () => {
      this.filtros = { de: '', ate: '', termometro: '' };
      this.filtroTipo = '';
      this.carregar().catch(e => aviso(e.message, true));
    };
    document.getElementById('cons-tipo').onchange = e => {
      this.filtroTipo = e.target.value;
      this.render();
    };
    document.getElementById('cons-ordem').onchange = e => {
      this.ordem = e.target.value;
      this.render();
    };

    tela.querySelectorAll('[data-ver]').forEach(btn => {
      btn.onclick = () => {
        Propostas.filtros = { busca: '', cliente: '', filial_id: '', consultor_id: btn.dataset.ver, status: '', etapa: '', termometro: '', origem: '' };
        App.trocarTela('propostas');
      };
    });
    tela.querySelectorAll('[data-planilha]').forEach(btn => {
      btn.onclick = () => {
        window.location.href = `/api/consultores/${btn.dataset.planilha}/exportar`;
      };
    });

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
