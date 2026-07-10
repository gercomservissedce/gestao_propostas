const App = {
  telaAtual: 'dashboard',

  trocarTela(nome) {
    this.telaAtual = nome;
    document.querySelectorAll('.tela').forEach(t => t.classList.add('oculta'));
    document.getElementById(`tela-${nome}`).classList.remove('oculta');
    document.querySelectorAll('.aba').forEach(a =>
      a.classList.toggle('ativa', a.dataset.tela === nome)
    );
    this.recarregarTela();
  },

  recarregarTela() {
    const telas = {
      dashboard: () => Dashboard.carregar(),
      propostas: () => Propostas.carregar(),
      consultores: () => Consultores.carregar(),
      analise: () => Analise.carregar(),
      relatorio: () => Relatorio.carregar(),
    };
    telas[this.telaAtual]().catch(e => aviso(e.message, true));
  },

  abrirModal() {
    document.getElementById('modal-fundo').classList.remove('oculta');
  },

  fecharModal() {
    document.getElementById('modal-fundo').classList.add('oculta');
  },

  async abrirConfig() {
    const cfg = await apiGet('/api/config');
    const caixa = document.getElementById('modal-caixa');
    caixa.innerHTML = `
      <div class="modal-titulo">
        <h2>Configurações</h2>
        <button class="btn" id="cfg-fechar">✕</button>
      </div>
      <div class="form-grade">
        <div class="campo"><label>Probabilidade quente (%)</label><input type="number" id="cfg-quente" min="0" max="100" value="${cfg.prob_quente}"></div>
        <div class="campo"><label>Probabilidade morno (%)</label><input type="number" id="cfg-morno" min="0" max="100" value="${cfg.prob_morno}"></div>
        <div class="campo"><label>Probabilidade frio (%)</label><input type="number" id="cfg-frio" min="0" max="100" value="${cfg.prob_frio}"></div>
        <div class="campo"><label>Alerta sem contato (dias)</label><input type="number" id="cfg-dias" min="1" value="${cfg.dias_alerta}"></div>
      </div>
      <div class="acoes-modal">
        <button class="btn btn-primario" id="cfg-salvar">Salvar</button>
        <span class="espaco"></span>
        <button class="btn" id="cfg-importar" title="Relê a planilha do Modelo e adiciona apenas propostas novas">Reimportar planilha</button>
      </div>
    `;
    this.abrirModal();
    document.getElementById('cfg-fechar').onclick = () => this.fecharModal();
    document.getElementById('cfg-salvar').onclick = async () => {
      try {
        await apiSend('PUT', '/api/config', {
          prob_quente: document.getElementById('cfg-quente').value,
          prob_morno: document.getElementById('cfg-morno').value,
          prob_frio: document.getElementById('cfg-frio').value,
          dias_alerta: document.getElementById('cfg-dias').value,
        });
        aviso('Configurações salvas.');
        this.fecharModal();
        this.recarregarTela();
      } catch (e) { aviso(e.message, true); }
    };
    document.getElementById('cfg-importar').onclick = async e => {
      e.target.disabled = true;
      try {
        const r = await apiSend('POST', '/api/importar');
        aviso(`Importação: ${r.inseridas} novas, ${r.ignoradas} já existiam.`);
        this.fecharModal();
        this.recarregarTela();
      } catch (err) {
        aviso(err.message, true);
      } finally { e.target.disabled = false; }
    };
  },
};

document.getElementById('abas').addEventListener('click', e => {
  if (e.target.dataset.tela) App.trocarTela(e.target.dataset.tela);
});
document.getElementById('btn-config').onclick = () => App.abrirConfig();

function atualizarIconeTema() {
  const escuro = document.documentElement.dataset.theme === 'dark';
  const btn = document.getElementById('btn-tema');
  btn.textContent = escuro ? '☀' : '🌙';
  btn.title = escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro';
}
document.getElementById('btn-tema').onclick = () => {
  const novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  localStorage.setItem('gp-tema', novo);
  atualizarIconeTema();
};
atualizarIconeTema();
document.getElementById('modal-fundo').addEventListener('click', e => {
  if (e.target.id === 'modal-fundo') App.fecharModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') App.fecharModal();
});

App.recarregarTela();
