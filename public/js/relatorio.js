const Relatorio = {
  timerSalvar: {},

  async carregar() {
    const tela = document.getElementById('tela-relatorio');
    const lista = await apiGet('/api/propostas?status=ATIVA');
    const marcadas = lista.filter(p => p.marcada_relatorio);

    const totalOriginal = marcadas.reduce((s, p) => s + (p.vlr_total || 0), 0);
    const totalMinimo = marcadas.reduce((s, p) => s + (p.valor_minimo_fechamento ?? p.vlr_total ?? 0), 0);

    tela.innerHTML = `
      <div class="cartao" style="margin-bottom:14px">
        <div class="titulo-secao">Relatório para a diretoria — viabilização de fechamentos</div>
        <p style="font-size:13px;color:var(--tinta-2)">
          Marque as propostas com potencial de fechamento e informe o valor mínimo aceitável de cada uma.
          O PDF mostra o valor original, o valor para fechamento e a diferença que a diretoria precisa aprovar.
        </p>
        <div class="relatorio-resumo">
          <span>Selecionadas: <b>${marcadas.length}</b></span>
          <span>Valor original: <b>${fmtMoeda(totalOriginal)}</b></span>
          <span>Valor p/ fechamento: <b>${fmtMoeda(totalMinimo)}</b></span>
          <span>Redução proposta: <b>${fmtMoeda(totalOriginal - totalMinimo)}</b></span>
        </div>
        <div class="acoes-modal" style="margin-top:6px">
          <button class="btn btn-primario" id="rel-pdf" ${marcadas.length ? '' : 'disabled'}>Gerar PDF para a diretoria</button>
          <button class="btn" id="rel-previa" ${marcadas.length ? '' : 'disabled'}>Ver prévia no navegador</button>
        </div>
      </div>
      <div class="cartao"><div class="rolagem">
        <table class="tabela">
          <thead><tr>
            <th></th><th>Nº</th><th>Cliente</th><th>Filial</th><th>Consultor</th>
            <th style="text-align:right">Valor original</th><th style="text-align:right">Valor mín. p/ fechamento</th><th>Termômetro</th>
          </tr></thead>
          <tbody>
            ${lista.map(p => `
            <tr>
              <td><input type="checkbox" data-marca="${p.id}" ${p.marcada_relatorio ? 'checked' : ''}></td>
              <td class="cod">${esc(p.numero)}</td>
              <td>${esc(p.cliente)}</td>
              <td>${esc(p.filial || '')}</td>
              <td>${esc((p.consultor || '—').split(' ').slice(0, 2).join(' '))}</td>
              <td class="num">${fmtMoeda(p.vlr_total)}</td>
              <td class="num"><input class="vlr-min" type="number" step="0.01" min="0"
                data-minimo="${p.id}" value="${p.valor_minimo_fechamento ?? ''}"
                placeholder="${(p.vlr_total || 0).toFixed(2)}" ${p.marcada_relatorio ? '' : 'disabled'}></td>
              <td>${p.termometro ? `<span class="badge badge-${p.termometro}">${p.termometro}</span>` : '<span class="badge badge-NC">sem classif.</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div>
    `;

    tela.querySelectorAll('input[data-marca]').forEach(cb => {
      cb.onchange = async () => {
        await apiSend('PUT', `/api/propostas/${cb.dataset.marca}`, { marcada_relatorio: cb.checked ? 1 : 0 });
        this.carregar();
      };
    });
    tela.querySelectorAll('input[data-minimo]').forEach(inp => {
      inp.oninput = () => {
        clearTimeout(this.timerSalvar[inp.dataset.minimo]);
        this.timerSalvar[inp.dataset.minimo] = setTimeout(async () => {
          await apiSend('PUT', `/api/propostas/${inp.dataset.minimo}`, {
            valor_minimo_fechamento: inp.value === '' ? '' : Number(inp.value),
          });
          aviso('Valor salvo.');
        }, 600);
      };
    });
    document.getElementById('rel-previa').onclick = () => window.open('/relatorio/print', '_blank');
    document.getElementById('rel-pdf').onclick = async e => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Gerando PDF…';
      try {
        const r = await apiSend('POST', '/api/relatorio/pdf');
        aviso(`PDF gerado: ${r.arquivo}`);
        window.open(`/relatorios/${encodeURIComponent(r.arquivo)}`, '_blank');
      } catch (err) {
        aviso(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar PDF para a diretoria';
      }
    };
  },
};
