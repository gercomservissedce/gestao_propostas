// Importação do CSV do ERP: mostra a prévia do que vai mudar e só grava depois
// do Confirmar. O arquivo é reenviado na confirmação — o servidor não guarda
// estado entre a prévia e a gravação.
const ImportacaoCsv = {
  ROTULOS: {
    cliente: 'Cliente', data_emissao: 'Data de emissão', tipo_negocio: 'Tipo de negócio',
    consultor: 'Representante', descricao: 'Descrição', observacao: 'Observação',
    vlr_comodato: 'Comodato', vlr_serv_adicional: 'Serviço adicional', vlr_mensal: 'Mensal',
    vlr_taxa_adesao: 'Taxa de adesão', vlr_venda: 'Venda', vlr_instalacao: 'Instalação',
    vlr_serv_especial: 'Serviço especial', vlr_total: 'Valor total',
    vlr_desconto: 'Desconto', vlr_total_com_desconto: 'Total c/ desconto',
  },

  fmtCampo(campo, valor) {
    if (campo.startsWith('vlr_')) return fmtMoeda(valor);
    if (campo.startsWith('data_')) return fmtData(valor);
    return valor === null || valor === '' ? '—' : String(valor);
  },

  async lerBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result.split(',')[1]);
      // onerror entrega um ProgressEvent, que não tem .message: sem um Error
      // aqui, o aviso da tela sairia em branco e o usuário não saberia de nada.
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo escolhido.'));
      leitor.readAsDataURL(arquivo);
    });
  },

  async escolher(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const base64 = await this.lerBase64(arquivo);
      const plano = await apiSend('POST', '/api/importar-csv/previa', { arquivo: base64 });
      this.render(arquivo.name, plano, base64);
    } catch (e) {
      aviso(e.message, true);
    } finally {
      input.value = '';
    }
  },

  render(nomeArquivo, plano, base64) {
    const lista = (titulo, itens, html) => !itens.length ? '' : `
      <div class="previa-secao">
        <div class="titulo-secao">${titulo} (${itens.length})</div>
        <div class="previa-lista">${itens.map(html).join('')}</div>
      </div>`;

    document.getElementById('modal-caixa').innerHTML = `
      <div class="modal-titulo">
        <h2>Importar CSV do ERP</h2>
        <button class="btn" id="csv-fechar">✕</button>
      </div>
      <div class="previa-arquivo">${esc(nomeArquivo)}</div>
      <div class="previa-contagens">
        <span><b>${plano.novas.length}</b> novas</span>
        <span><b>${plano.atualizadas.length}</b> a atualizar</span>
        <span><b>${plano.semMudanca}</b> sem mudança</span>
        <span><b>${plano.invalidas.length}</b> com problema</span>
      </div>
      ${lista('Propostas novas', plano.novas, p => `
        <div class="previa-item">
          <span class="previa-num">${esc(p.numero)}</span>
          <span class="previa-cliente">${esc(p.cliente)}</span>
          <span class="num">${fmtMoeda(p.vlr_total)}</span>
        </div>`)}
      ${lista('Propostas a atualizar', plano.atualizadas, p => `
        <div class="previa-item previa-item-col">
          <div>
            <span class="previa-num">${esc(p.numero)}</span>
            <span class="previa-cliente">${esc(p.cliente)}</span>
          </div>
          ${p.mudancas.map(m => `
            <div class="previa-mudanca">
              ${esc(this.ROTULOS[m.campo] || m.campo)}:
              <span class="previa-de">${esc(this.fmtCampo(m.campo, m.de))}</span>
              → <b>${esc(this.fmtCampo(m.campo, m.para))}</b>
            </div>`).join('')}
        </div>`)}
      ${lista('Serão criados', [...plano.filiaisNovas.map(f => `Filial ${f.codigo} — ${f.nome}`),
        ...plano.consultoresNovos.map(c => `Representante ${c}`)],
        t => `<div class="previa-mudanca">${esc(t)}</div>`)}
      ${lista('Linhas com problema (não serão importadas)', plano.invalidas,
        i => `<div class="previa-mudanca">Linha ${i.linha}: ${esc(i.motivo)}</div>`)}
      <div class="acoes-modal">
        <button class="btn btn-primario" id="csv-confirmar"
          ${plano.novas.length || plano.atualizadas.length ? '' : 'disabled'}>Confirmar importação</button>
        <button class="btn" id="csv-cancelar">Cancelar</button>
      </div>
    `;
    App.abrirModal();
    document.getElementById('csv-fechar').onclick = () => App.fecharModal();
    document.getElementById('csv-cancelar').onclick = () => App.fecharModal();
    document.getElementById('csv-confirmar').onclick = async e => {
      e.target.disabled = true;
      try {
        const r = await apiSend('POST', '/api/importar-csv',
          { arquivo: base64, nomeArquivo });
        aviso(`Importação: ${r.inseridas} novas, ${r.atualizadas} atualizadas, `
          + `${r.semMudanca} sem mudança`
          + (r.invalidas ? `, ${r.invalidas} com problema` : '')
          + `. Backup: ${r.backup}`);
        App.recarregarTela();
        // Volta para Configurações em vez de só fechar: a importação já aparece
        // no histórico, com o backup que acabou de ser gerado.
        await App.abrirConfig();
      } catch (err) {
        aviso(err.message, true);
        e.target.disabled = false;
      }
    };
  },
};
