const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtMoeda(n) {
  return fmtBRL.format(Number(n) || 0);
}

function fmtData(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function fmtPct(n) {
  return `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`;
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// '2026-07' -> 'Julho 2026'. Chave vazia ou inválida -> 'Sem data'.
function fmtMesAno(chave) {
  const [ano, mes] = String(chave || '').split('-');
  const nome = NOMES_MES[Number(mes) - 1];
  if (!nome || !/^\d{4}$/.test(ano)) return 'Sem data';
  return `${nome} ${ano}`;
}
