const Dashboard = {
  filtros: { filial_id: '', consultor_id: '', de: '', ate: '' },

  async carregar() {
    const tela = document.getElementById('tela-dashboard');
    const qs = new URLSearchParams(
      Object.entries(this.filtros).filter(([, v]) => v)
    ).toString();
    const [d, filiais, consultores] = await Promise.all([
      apiGet('/api/dashboard' + (qs ? `?${qs}` : '')),
      apiGet('/api/filiais'),
      apiGet('/api/consultores'),
    ]);

    const cores = { QUENTE: 'QUENTE', MORNO: 'MORNO', FRIO: 'FRIO', 'NÃO CLASSIFICADA': 'NC' };
    const ordemTerm = ['QUENTE', 'MORNO', 'FRIO', 'NÃO CLASSIFICADA'];
    const term = ordemTerm
      .map(nivel => d.termometro.find(t => t.nivel === nivel))
      .filter(Boolean);
    const totalTerm = term.reduce((s, t) => s + t.valor, 0) || 1;

    tela.innerHTML = `
      <div class="linha-filtros">
        <div class="campo"><label>Filial</label>
          <select id="dash-filial">
            <option value="">Todas</option>
            ${filiais.map(f => `<option value="${f.id}" ${String(f.id) === this.filtros.filial_id ? 'selected' : ''}>${esc(f.estado)} (${esc(f.codigo)})</option>`).join('')}
          </select></div>
        <div class="campo"><label>Consultor</label>
          <select id="dash-consultor">
            <option value="">Todos</option>
            ${consultores.map(c => `<option value="${c.id}" ${String(c.id) === this.filtros.consultor_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
          </select></div>
        <div class="campo"><label>Emitidas de</label><input type="date" id="dash-de" value="${this.filtros.de}"></div>
        <div class="campo"><label>até</label><input type="date" id="dash-ate" value="${this.filtros.ate}"></div>
        <button class="btn" id="dash-limpar">Limpar</button>
      </div>

      <div class="kpis">
        <div class="cartao kpi">
          <div class="rotulo">Em negociação</div>
          <div class="valor">${fmtMoeda(d.totalAtivas.valor)}</div>
          <div class="detalhe">${d.totalAtivas.qtde} propostas ativas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Previsão ponderada</div>
          <div class="valor">${fmtMoeda(d.previsaoPonderada)}</div>
          <div class="detalhe">quente ${d.config.prob_quente}% · morno ${d.config.prob_morno}% · frio ${d.config.prob_frio}%</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Fechadas no mês</div>
          <div class="valor">${fmtMoeda(d.fechadasMes.valor)}</div>
          <div class="detalhe">${d.fechadasMes.qtde} proposta(s)</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Taxa de conversão</div>
          <div class="valor">${fmtPct(d.taxaConversao)}</div>
          <div class="detalhe">fechadas sobre o total emitido</div>
        </div>
      </div>

      <div class="kpis">
        <div class="cartao kpi">
          <div class="rotulo">Geradas</div>
          <div class="valor">${fmtMoeda(d.geradas.valor)}</div>
          <div class="detalhe">${d.geradas.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Em andamento</div>
          <div class="valor">${fmtMoeda(d.totalAtivas.valor)}</div>
          <div class="detalhe">${d.totalAtivas.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Fechadas</div>
          <div class="valor">${fmtMoeda(d.fechadasTotal.valor)}</div>
          <div class="detalhe">${d.fechadasTotal.qtde} propostas</div>
        </div>
        <div class="cartao kpi">
          <div class="rotulo">Perdidas</div>
          <div class="valor">${fmtMoeda(d.perdidas.valor)}</div>
          <div class="detalhe">${d.perdidas.qtde} propostas</div>
        </div>
      </div>

      <div class="cartao regua-wrap">
        <div class="titulo-secao">Termômetro do pipeline — valor em negociação por temperatura</div>
        <div class="regua">
          ${term.map(t => `<div class="seg seg-${cores[t.nivel]}" style="flex:${(t.valor / totalTerm).toFixed(4)}" title="${esc(t.nivel)}: ${t.qtde} propostas, ${fmtMoeda(t.valor)}"></div>`).join('')}
        </div>
        <div class="regua-legenda">
          ${term.map(t => `<span class="item"><span class="bolinha seg-${cores[t.nivel]}"></span>${esc(t.nivel.toLowerCase())} <b>${t.qtde}</b> · <b>${fmtMoeda(t.valor)}</b></span>`).join('')}
        </div>
        <div class="regua-previsao">Previsão ponderada de fechamento: <b>${fmtMoeda(d.previsaoPonderada)}</b>
          ${d.naoClassificadas ? ` — <a href="#" id="link-triagem">${d.naoClassificadas} propostas sem temperatura</a> fora do cálculo` : ''}
        </div>
      </div>

      <div class="grade-2">
        <div class="cartao">
          <div class="titulo-secao">Funil por etapa (ativas)</div>
          ${this.renderFunil(d.funil)}
        </div>
        <div class="cartao">
          <div class="titulo-secao">Propostas esquecidas — sem contato há mais de ${d.config.dias_alerta} dias (${d.esquecidas.length})</div>
          ${this.renderEsquecidas(d.esquecidas)}
        </div>
      </div>
    `;

    document.getElementById('dash-filial').onchange = e => this.aplicar('filial_id', e.target.value);
    document.getElementById('dash-consultor').onchange = e => this.aplicar('consultor_id', e.target.value);
    document.getElementById('dash-de').onchange = e => this.aplicar('de', e.target.value);
    document.getElementById('dash-ate').onchange = e => this.aplicar('ate', e.target.value);
    document.getElementById('dash-limpar').onclick = () => {
      this.filtros = { filial_id: '', consultor_id: '', de: '', ate: '' };
      this.carregar();
    };
    const linkTriagem = document.getElementById('link-triagem');
    if (linkTriagem) linkTriagem.onclick = e => {
      e.preventDefault();
      Propostas.filtros = { busca: '', filial_id: '', consultor_id: '', status: 'ATIVA', etapa: '', termometro: 'NULA' };
      App.trocarTela('propostas');
    };
    tela.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => Propostas.abrirDetalhe(Number(tr.dataset.id));
    });
  },

  aplicar(chave, valor) {
    this.filtros[chave] = valor;
    this.carregar();
  },

  renderFunil(funil) {
    if (!funil.length) return '<p>Nenhuma proposta ativa.</p>';
    const max = Math.max(...funil.map(f => f.qtde));
    return funil.map(f => `
      <div class="funil-linha">
        <span class="nome">${esc(f.etapa.toLowerCase())}</span>
        <div class="funil-barra-wrap"><div class="funil-barra" style="width:${(100 * f.qtde / max).toFixed(1)}%"></div></div>
        <span><span class="qtd">${f.qtde}</span><br><span class="valor-sub">${fmtMoeda(f.valor)}</span></span>
      </div>`).join('');
  },

  renderEsquecidas(lista) {
    if (!lista.length) return '<p>Nenhuma proposta esquecida. Bom trabalho!</p>';
    const linhas = lista.slice(0, 15).map(e => `
      <tr class="clicavel" data-id="${e.id}">
        <td class="cod">${esc(e.numero)}</td>
        <td>${esc(e.cliente)}</td>
        <td>${esc(e.consultor || '—')}</td>
        <td class="num">${fmtMoeda(e.valor)}</td>
        <td class="num"><span class="badge badge-alerta">${e.diasSemContato} dias</span></td>
      </tr>`).join('');
    return `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Nº</th><th>Cliente</th><th>Consultor</th><th>Valor</th><th>Sem contato</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
      ${lista.length > 15 ? `<p style="margin-top:8px;color:var(--tinta-3);font-size:12px">Mostrando as 15 de maior valor, de ${lista.length} no total.</p>` : ''}`;
  },
};
