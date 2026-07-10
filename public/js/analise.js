const Analise = {
  async carregar() {
    const tela = document.getElementById('tela-analise');
    const [props, cfg] = await Promise.all([
      apiGet('/api/propostas'),
      apiGet('/api/config'),
    ]);

    const hoje = new Date();
    const dias = iso => Math.floor((hoje - new Date(iso + 'T12:00:00')) / 86400000);

    const ativas = props.filter(p => p.status === 'ATIVA');
    const fechadas = props.filter(p => p.status === 'FECHADA');
    const soma = l => l.reduce((s, p) => s + (p.vlr_total || 0), 0);

    const semTemp = ativas.filter(p => !p.termometro);
    const paradas = ativas.filter(p => p.dias_sem_contato > cfg.dias_alerta);
    const quentesParadas = paradas.filter(p => p.termometro === 'QUENTE');
    const conversao = props.length ? (100 * fechadas.length / props.length) : 0;

    // ----- agrupamento por consultor (com status de cada proposta) -----
    const porConsultor = {};
    for (const p of props) {
      const nome = p.consultor || '(sem consultor)';
      const g = porConsultor[nome] ??= { nome, ATIVA: 0, FECHADA: 0, PERDIDA: 0, total: 0, valor: 0, paradas: 0, valorFechado: 0 };
      g[p.status]++;
      g.total++;
      g.valor += p.vlr_total || 0;
      if (p.status === 'FECHADA') g.valorFechado += p.vlr_total || 0;
      if (p.status === 'ATIVA' && p.dias_sem_contato > cfg.dias_alerta) g.paradas++;
    }
    const consultores = Object.values(porConsultor).sort((a, b) => b.total - a.total);

    // ----- agrupamento por filial -----
    const porFilial = {};
    for (const p of props) {
      const g = porFilial[p.filial || '?'] ??= { nome: p.filial || '?', total: 0, fechadas: 0, valorFechado: 0 };
      g.total++;
      if (p.status === 'FECHADA') { g.fechadas++; g.valorFechado += p.vlr_total || 0; }
    }
    const filiais = Object.values(porFilial).map(f => ({ ...f, conversao: f.total ? 100 * f.fechadas / f.total : 0 }))
      .sort((a, b) => b.total - a.total);

    // ----- idade do pipeline (só ativas) -----
    const faixas = [
      { nome: 'até 30 dias', de: 0, ate: 30 },
      { nome: '1 a 2 meses', de: 31, ate: 60 },
      { nome: '2 a 3 meses', de: 61, ate: 90 },
      { nome: '3 a 6 meses', de: 91, ate: 180 },
      { nome: 'mais de 6 meses', de: 181, ate: Infinity },
    ].map(f => {
      const lista = ativas.filter(p => { const d = dias(p.data_emissao); return d >= f.de && d <= f.ate; });
      return { ...f, qtde: lista.length, valor: soma(lista) };
    });

    // ----- ações prioritárias -----
    const acoes = [];
    if (quentesParadas.length) {
      const top = [...quentesParadas].sort((a, b) => b.vlr_total - a.vlr_total).slice(0, 3);
      acoes.push({
        icone: '🔥', titulo: `Ligue hoje: ${quentesParadas.length} proposta(s) QUENTE(S) sem contato há mais de ${cfg.dias_alerta} dias`,
        texto: `Cliente quente esfria rápido. Comece por: ${top.map(p => `${p.cliente} (${fmtMoeda(p.vlr_total)})`).join(' · ')}.`,
        filtro: { status: 'ATIVA', termometro: 'QUENTE' },
      });
    }
    const grandesParadas = [...paradas].sort((a, b) => b.vlr_total - a.vlr_total).slice(0, 3);
    if (grandesParadas.length) {
      acoes.push({
        icone: '💰', titulo: `Reative as paradas de maior valor (${paradas.length} no total, ${fmtMoeda(soma(paradas))})`,
        texto: `As três maiores: ${grandesParadas.map(p => `${p.cliente} (${fmtMoeda(p.vlr_total)}, ${p.dias_sem_contato} dias parada)`).join(' · ')}.`,
        filtro: { status: 'ATIVA' },
      });
    }
    if (semTemp.length) {
      acoes.push({
        icone: '🌡️', titulo: `Classifique o termômetro de ${semTemp.length} propostas (${Math.round(100 * semTemp.length / (ativas.length || 1))}% das ativas)`,
        texto: 'Sem a temperatura, a previsão de fechamento do dashboard não enxerga essas propostas. Comece pelas de maior valor.',
        filtro: { status: 'ATIVA', termometro: 'NULA' },
      });
    }
    const consParados = consultores.filter(c => c.paradas > 0).sort((a, b) => b.paradas - a.paradas).slice(0, 3);
    if (consParados.length) {
      acoes.push({
        icone: '👥', titulo: 'Cobre follow-up destes consultores',
        texto: consParados.map(c => `${primeiroNome(c.nome)}: ${c.paradas} paradas`).join(' · ') + '. Peça a cada um uma posição das propostas sem contato.',
      });
    }
    const filialFraca = [...filiais].filter(f => f.total >= 20).sort((a, b) => a.conversao - b.conversao)[0];
    if (filialFraca && filialFraca.conversao < conversao) {
      acoes.push({
        icone: '📍', titulo: `${filialFraca.nome} converte ${fmtPct(filialFraca.conversao)} — abaixo da média geral (${fmtPct(conversao)})`,
        texto: 'Vale investigar: preço fora da realidade local, demora no retorno ou perfil de cliente diferente.',
      });
    }

    function primeiroNome(n) { return n.split(' ').slice(0, 2).join(' '); }

    // ----- render -----
    const maxCons = Math.max(...consultores.map(c => c.total), 1);
    tela.innerHTML = `
      <div class="cartao" style="margin-bottom:14px">
        <div class="titulo-secao">O cenário em palavras</div>
        <ul class="cenario">
          <li>Você tem <b>${ativas.length} propostas em aberto</b>, somando <b>${fmtMoeda(soma(ativas))}</b>.</li>
          <li>De cada 100 propostas emitidas até hoje, <b>${conversao.toFixed(0)} viraram contrato</b> (${fechadas.length} fechadas, ${fmtMoeda(soma(fechadas))}).</li>
          <li><b>${paradas.length} propostas (${fmtMoeda(soma(paradas))})</b> estão sem nenhum contato há mais de ${cfg.dias_alerta} dias — é o dinheiro que esfria na mesa.</li>
          <li><b>${semTemp.length} propostas ainda não têm temperatura</b> definida, então a previsão de fechamento está enxergando só uma parte do funil.</li>
        </ul>
      </div>

      <div class="cartao" style="margin-bottom:14px">
        <div class="titulo-secao">Onde atuar agora — em ordem de prioridade</div>
        ${acoes.map((a, i) => `
          <div class="acao ${a.filtro ? 'clicavel-acao' : ''}" ${a.filtro ? `data-acao="${i}"` : ''}>
            <span class="acao-icone">${a.icone}</span>
            <div>
              <div class="acao-titulo">${a.titulo}</div>
              <div class="acao-texto">${a.texto}${a.filtro ? ' <u>Ver a lista</u>.' : ''}</div>
            </div>
          </div>`).join('') || '<p>Nenhuma pendência crítica. Bom trabalho!</p>'}
      </div>

      <div class="grade-2">
        <div class="cartao">
          <div class="titulo-secao">Propostas por consultor e situação</div>
          <div class="legenda-status">
            <span><span class="bolinha seg-status-ativa"></span>em aberto</span>
            <span><span class="bolinha seg-status-fechada"></span>fechada</span>
            <span><span class="bolinha seg-status-perdida"></span>perdida</span>
          </div>
          <div class="lista-consultores">
            ${consultores.map(c => `
            <div class="cons-linha clicavel" data-consultor="${esc(c.nome)}" title="Ver propostas de ${esc(c.nome)}">
              <span class="cons-nome">${esc(primeiroNome(c.nome))}</span>
              <div class="barra-emp" style="width:${(100 * c.total / maxCons).toFixed(1)}%">
                ${c.ATIVA ? `<div class="seg-status-ativa" style="flex:${c.ATIVA}" title="${c.ATIVA} em aberto"></div>` : ''}
                ${c.FECHADA ? `<div class="seg-status-fechada" style="flex:${c.FECHADA}" title="${c.FECHADA} fechadas"></div>` : ''}
                ${c.PERDIDA ? `<div class="seg-status-perdida" style="flex:${c.PERDIDA}" title="${c.PERDIDA} perdidas"></div>` : ''}
              </div>
              <span class="cons-num">${c.total}${c.FECHADA ? ` <em>(${c.FECHADA}✓)</em>` : ''}</span>
            </div>`).join('')}
          </div>
        </div>

        <div>
          <div class="cartao" style="margin-bottom:14px">
            <div class="titulo-secao">Conversão por filial</div>
            <table class="tabela">
              <thead><tr><th>Filial</th><th class="num">Emitidas</th><th class="num">Fechadas</th><th class="num">Conversão</th><th class="num">Valor fechado</th></tr></thead>
              <tbody>${filiais.map(f => `
                <tr>
                  <td>${esc(f.nome)}</td>
                  <td class="num">${f.total}</td>
                  <td class="num">${f.fechadas}</td>
                  <td class="num"><b>${fmtPct(f.conversao)}</b></td>
                  <td class="num">${fmtMoeda(f.valorFechado)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div class="cartao">
            <div class="titulo-secao">Idade das propostas em aberto — quanto mais antiga, mais fria</div>
            ${faixas.map(f => `
            <div class="funil-linha">
              <span class="nome">${f.nome}</span>
              <div class="funil-barra-wrap"><div class="funil-barra" style="width:${(100 * f.qtde / Math.max(...faixas.map(x => x.qtde), 1)).toFixed(1)}%"></div></div>
              <span><span class="qtd">${f.qtde}</span><br><span class="valor-sub">${fmtMoeda(f.valor)}</span></span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    `;

    tela.querySelectorAll('[data-consultor]').forEach(el => {
      el.onclick = () => {
        const alvo = props.find(p => (p.consultor || '(sem consultor)') === el.dataset.consultor);
        Propostas.filtros = { busca: '', filial_id: '', consultor_id: alvo?.consultor_id || '', status: '', etapa: '', termometro: '' };
        App.trocarTela('propostas');
      };
    });
    tela.querySelectorAll('[data-acao]').forEach(el => {
      el.onclick = () => {
        const a = acoes[Number(el.dataset.acao)];
        Propostas.filtros = { busca: '', filial_id: '', consultor_id: '', etapa: '', status: '', termometro: '', ...a.filtro };
        App.trocarTela('propostas');
      };
    });
  },
};
