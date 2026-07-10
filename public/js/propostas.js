const ETAPAS = ['ELABORANDO PROPOSTA', 'AGENDADO VISITA', 'AGUARDANDO VISITA', 'EM NEGOCIAÇÃO', 'FECHADO', 'PERDIDO'];
const CAMPOS_VALOR = [
  ['vlr_comodato', 'Vlr. comodato'], ['vlr_serv_adicional', 'Vlr. serv. adicional'],
  ['vlr_mensal', 'Vlr. mensal'], ['vlr_taxa_adesao', 'Vlr. taxa adesão'],
  ['vlr_venda', 'Vlr. venda'], ['vlr_instalacao', 'Vlr. instalação'],
  ['vlr_serv_especial', 'Vlr. serv. especial'], ['vlr_total', 'Vlr. total'],
];

const Propostas = {
  filtros: { busca: '', filial_id: '', consultor_id: '', status: 'ATIVA', etapa: '', termometro: '' },
  filiais: [],
  consultores: [],
  diasAlerta: 30,

  async carregar() {
    const tela = document.getElementById('tela-propostas');
    const [filiais, consultores, cfg] = await Promise.all([
      apiGet('/api/filiais'), apiGet('/api/consultores'), apiGet('/api/config'),
    ]);
    this.filiais = filiais;
    this.consultores = consultores;
    this.diasAlerta = cfg.dias_alerta;

    tela.innerHTML = `
      <div class="linha-filtros">
        <div class="campo"><label>Buscar</label><input id="pr-busca" placeholder="cliente ou nº" value="${esc(this.filtros.busca)}"></div>
        <div class="campo"><label>Filial</label><select id="pr-filial">
          <option value="">Todas</option>
          ${filiais.map(f => `<option value="${f.id}" ${String(f.id) === String(this.filtros.filial_id) ? 'selected' : ''}>${esc(f.estado)}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Consultor</label><select id="pr-consultor">
          <option value="">Todos</option>
          ${consultores.map(c => `<option value="${c.id}" ${String(c.id) === String(this.filtros.consultor_id) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Status</label><select id="pr-status">
          <option value="">Todos</option>
          ${['ATIVA', 'FECHADA', 'PERDIDA'].map(s => `<option ${s === this.filtros.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Etapa</label><select id="pr-etapa">
          <option value="">Todas</option>
          ${ETAPAS.map(e => `<option ${e === this.filtros.etapa ? 'selected' : ''}>${e}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Termômetro</label><select id="pr-term">
          <option value="">Todos</option>
          <option value="QUENTE" ${this.filtros.termometro === 'QUENTE' ? 'selected' : ''}>Quente</option>
          <option value="MORNO" ${this.filtros.termometro === 'MORNO' ? 'selected' : ''}>Morno</option>
          <option value="FRIO" ${this.filtros.termometro === 'FRIO' ? 'selected' : ''}>Frio</option>
          <option value="NULA" ${this.filtros.termometro === 'NULA' ? 'selected' : ''}>Não classificada</option>
        </select></div>
        <button class="btn btn-primario" id="pr-nova">+ Nova proposta</button>
      </div>
      <div class="cartao"><div class="rolagem" id="pr-tabela">Carregando…</div></div>
    `;

    const liga = (id, chave, evento = 'change') => {
      document.getElementById(id)['on' + evento] = e => {
        this.filtros[chave] = e.target.value;
        this.listar();
      };
    };
    liga('pr-busca', 'busca', 'input');
    liga('pr-filial', 'filial_id');
    liga('pr-consultor', 'consultor_id');
    liga('pr-status', 'status');
    liga('pr-etapa', 'etapa');
    liga('pr-term', 'termometro');
    document.getElementById('pr-nova').onclick = () => this.abrirForm(null);
    await this.listar();
  },

  async listar() {
    const qs = new URLSearchParams(
      Object.entries(this.filtros).filter(([, v]) => v)
    ).toString();
    const lista = await apiGet('/api/propostas' + (qs ? `?${qs}` : ''));
    const alvo = document.getElementById('pr-tabela');
    if (!lista.length) { alvo.innerHTML = '<p>Nenhuma proposta encontrada com esses filtros.</p>'; return; }

    const badgeTerm = t => t
      ? `<span class="badge badge-${t}">${t}</span>`
      : '<span class="badge badge-NC">sem classif.</span>';

    alvo.innerHTML = `
      <p style="margin-bottom:8px;color:var(--tinta-2);font-size:12.5px">${lista.length} proposta(s) · ${fmtMoeda(lista.reduce((s, p) => s + (p.vlr_total || 0), 0))}</p>
      <table class="tabela">
      <thead><tr>
        <th>Nº</th><th>Data</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
        <th style="text-align:right">Valor total</th><th>Termômetro</th><th>Etapa</th><th>Últ. contato</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => `
        <tr class="clicavel" data-id="${p.id}">
          <td class="cod">${esc(p.numero)}</td>
          <td class="num">${fmtData(p.data_emissao)}</td>
          <td>${esc(p.cliente)}</td>
          <td>${esc(p.filial || '')}</td>
          <td>${esc((p.consultor || '—').split(' ').slice(0, 2).join(' '))}</td>
          <td class="num">${fmtMoeda(p.vlr_total)}</td>
          <td>${badgeTerm(p.termometro)}</td>
          <td style="font-size:11.5px">${esc((p.etapa || '—').toLowerCase())}</td>
          <td class="num">${p.status === 'ATIVA' && p.dias_sem_contato > this.diasAlerta
            ? `<span class="badge badge-alerta" title="Sem contato há ${p.dias_sem_contato} dias">${p.ultima_data_contato ? fmtData(p.ultima_data_contato) : 'nunca'} ⚠</span>`
            : (p.ultima_data_contato ? fmtData(p.ultima_data_contato) : '—')}</td>
          <td><span class="badge badge-${p.status}">${p.status}</span></td>
        </tr>`).join('')}
      </tbody></table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => this.abrirDetalhe(Number(tr.dataset.id));
    });
  },

  async abrirDetalhe(id) {
    const p = await apiGet(`/api/propostas/${id}`);
    this.abrirForm(p);
  },

  async abrirForm(p) {
    if (!this.filiais.length) {
      [this.filiais, this.consultores] = await Promise.all([
        apiGet('/api/filiais'), apiGet('/api/consultores'),
      ]);
    }
    const nova = !p;
    p = p || {};
    const caixa = document.getElementById('modal-caixa');

    const campoValor = (nome, rotulo) => `
      <div class="campo"><label>${rotulo}</label>
      <input type="number" step="0.01" min="0" id="f-${nome}" value="${p[nome] ?? ''}"></div>`;

    caixa.innerHTML = `
      <div class="modal-titulo">
        <h2>${nova ? 'Nova proposta' : `Proposta ${esc(p.numero)} — ${esc(p.cliente)}`}</h2>
        <button class="btn" id="f-fechar-modal">✕</button>
      </div>
      <div class="form-grade">
        <div class="campo"><label>Filial *</label><select id="f-filial_id">
          ${this.filiais.map(f => `<option value="${f.id}" ${f.id === p.filial_id ? 'selected' : ''}>${esc(f.estado)} (${esc(f.codigo)})</option>`).join('')}
        </select></div>
        <div class="campo"><label>Nº proposta *</label><input id="f-numero" value="${esc(p.numero || '')}"></div>
        <div class="campo"><label>Data emissão *</label><input type="date" id="f-data_emissao" value="${p.data_emissao || hojeIso()}"></div>
        <div class="campo"><label>Consultor</label><select id="f-consultor_id">
          <option value="">—</option>
          ${this.consultores.map(c => `<option value="${c.id}" ${c.id === p.consultor_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select></div>
        <div class="campo col-2"><label>Cliente *</label><input id="f-cliente" value="${esc(p.cliente || '')}"></div>
        <div class="campo"><label>Tipo de negócio</label><input id="f-tipo_negocio" value="${esc(p.tipo_negocio || 'PORTARIA INTELIGENTE')}"></div>
        <div class="campo"><label>Etapa</label><select id="f-etapa">
          <option value="">—</option>
          ${ETAPAS.map(e => `<option ${e === p.etapa ? 'selected' : ''}>${e}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Termômetro</label><select id="f-termometro">
          <option value="">Não classificada</option>
          ${['QUENTE', 'MORNO', 'FRIO'].map(t => `<option ${t === p.termometro ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Status</label><select id="f-status">
          ${['ATIVA', 'FECHADA', 'PERDIDA'].map(s => `<option ${s === (p.status || 'ATIVA') ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="campo"><label>Data fechamento</label><input type="date" id="f-data_fechamento" value="${p.data_fechamento || ''}"></div>
        <div class="campo"><label>Próximo contato</label><input type="date" id="f-proxima_data_contato" value="${p.proxima_data_contato || ''}"></div>
        ${CAMPOS_VALOR.map(([n, r]) => campoValor(n, r)).join('')}
        <div class="campo col-2"><label>Descrição</label><textarea id="f-descricao">${esc(p.descricao || '')}</textarea></div>
        <div class="campo col-2"><label>Observação</label><textarea id="f-observacao">${esc(p.observacao || '')}</textarea></div>
      </div>

      ${nova ? '' : `
      <div style="margin-top:18px">
        <div class="titulo-secao">Histórico de contatos (${(p.contatos || []).length})</div>
        <div class="linha-filtros" style="margin-bottom:6px">
          <div class="campo"><label>Data</label><input type="date" id="ct-data" value="${hojeIso()}"></div>
          <div class="campo" style="flex:1"><label>Anotação</label><input id="ct-anotacao" placeholder="ex.: liguei, síndico vai levar à assembleia" style="min-width:260px"></div>
          <div class="campo"><label>Próximo contato</label><input type="date" id="ct-proximo"></div>
          <button class="btn" id="ct-add">Registrar contato</button>
        </div>
        <div class="contatos-lista">
          ${(p.contatos || []).map(c => `
            <div class="contato-item">
              <span class="data">${fmtData(c.data)}</span>
              <span style="flex:1">${esc(c.anotacao || '')}</span>
              ${c.proximo_contato ? `<span class="prox">próx.: ${fmtData(c.proximo_contato)}</span>` : ''}
            </div>`).join('') || '<p style="color:var(--tinta-3)">Nenhum contato registrado ainda.</p>'}
        </div>
      </div>`}

      <div class="acoes-modal">
        <button class="btn btn-primario" id="f-salvar">${nova ? 'Criar proposta' : 'Salvar alterações'}</button>
        ${nova ? '' : `
          ${p.status === 'ATIVA' ? '<button class="btn" id="f-fechar-negocio">✔ Marcar como fechada</button><button class="btn" id="f-perder">Marcar como perdida</button>' : ''}
          <span class="espaco"></span>
          <button class="btn btn-perigo" id="f-excluir">Excluir</button>`}
      </div>
    `;
    App.abrirModal();

    document.getElementById('f-fechar-modal').onclick = () => App.fecharModal();

    // Ao mudar o status, mantém etapa e data de fechamento coerentes na tela
    // (o servidor garante a mesma regra ao salvar)
    document.getElementById('f-status').onchange = e => {
      const dataFech = document.getElementById('f-data_fechamento');
      const etapa = document.getElementById('f-etapa');
      if (e.target.value === 'FECHADA') {
        if (!dataFech.value) dataFech.value = hojeIso();
        etapa.value = 'FECHADO';
      } else if (e.target.value === 'PERDIDA') {
        etapa.value = 'PERDIDO';
      } else {
        dataFech.value = '';
        if (etapa.value === 'FECHADO' || etapa.value === 'PERDIDO') etapa.value = '';
      }
    };

    const coletar = () => ({
      filial_id: Number(document.getElementById('f-filial_id').value),
      numero: document.getElementById('f-numero').value.trim(),
      data_emissao: document.getElementById('f-data_emissao').value,
      cliente: document.getElementById('f-cliente').value.trim(),
      tipo_negocio: document.getElementById('f-tipo_negocio').value.trim(),
      etapa: document.getElementById('f-etapa').value || '',
      termometro: document.getElementById('f-termometro').value || '',
      status: document.getElementById('f-status').value,
      data_fechamento: document.getElementById('f-data_fechamento').value || '',
      proxima_data_contato: document.getElementById('f-proxima_data_contato').value || '',
      descricao: document.getElementById('f-descricao').value.trim(),
      observacao: document.getElementById('f-observacao').value.trim(),
      ...Object.fromEntries(CAMPOS_VALOR.map(([n]) => [n, Number(document.getElementById(`f-${n}`).value) || 0])),
    });

    document.getElementById('f-salvar').onclick = async () => {
      try {
        const dados = coletar();
        if (!dados.numero || !dados.cliente || !dados.data_emissao) {
          return aviso('Preencha nº da proposta, data e cliente.', true);
        }
        if (nova) await apiSend('POST', '/api/propostas', dados);
        else await apiSend('PUT', `/api/propostas/${p.id}`, dados);
        aviso(nova ? 'Proposta criada.' : 'Proposta salva.');
        App.fecharModal();
        App.recarregarTela();
      } catch (e) { aviso(e.message, true); }
    };

    if (!nova) {
      const btnFecharNeg = document.getElementById('f-fechar-negocio');
      if (btnFecharNeg) btnFecharNeg.onclick = async () => {
        try {
          await apiSend('PUT', `/api/propostas/${p.id}`, { status: 'FECHADA', etapa: 'FECHADO', data_fechamento: hojeIso() });
          aviso('Proposta marcada como fechada. Parabéns!');
          App.fecharModal(); App.recarregarTela();
        } catch (e) { aviso(e.message, true); }
      };
      const btnPerder = document.getElementById('f-perder');
      if (btnPerder) btnPerder.onclick = async () => {
        try {
          await apiSend('PUT', `/api/propostas/${p.id}`, { status: 'PERDIDA', etapa: 'PERDIDO' });
          aviso('Proposta marcada como perdida.');
          App.fecharModal(); App.recarregarTela();
        } catch (e) { aviso(e.message, true); }
      };
      document.getElementById('f-excluir').onclick = async () => {
        if (!confirm(`Excluir definitivamente a proposta ${p.numero} — ${p.cliente}?`)) return;
        try {
          await apiSend('DELETE', `/api/propostas/${p.id}`);
          aviso('Proposta excluída.');
          App.fecharModal(); App.recarregarTela();
        } catch (e) { aviso(e.message, true); }
      };
      const btnCt = document.getElementById('ct-add');
      if (btnCt) btnCt.onclick = async () => {
        const data = document.getElementById('ct-data').value;
        if (!data) return aviso('Informe a data do contato.', true);
        try {
          await apiSend('POST', `/api/propostas/${p.id}/contatos`, {
            data,
            anotacao: document.getElementById('ct-anotacao').value.trim(),
            proximo_contato: document.getElementById('ct-proximo').value || null,
          });
          aviso('Contato registrado.');
          this.abrirDetalhe(p.id);
        } catch (e) { aviso(e.message, true); }
      };
    }
  },
};
