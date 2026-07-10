function pad2(n) {
  return String(n).padStart(2, '0');
}

// Epoch do Excel: 1899-12-30 (serial 0)
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

// Datas da planilha vêm como serial do Excel (raw), Date ou texto M/D/YY
function toIsoDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (v <= 0) return null;
    const d = new Date(EXCEL_EPOCH_UTC + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // Datas lidas do xlsx podem vir deslocadas algumas horas; arredonda para o dia mais próximo
    const dias = Math.round((v.getTime() - EXCEL_EPOCH_UTC) / 86400000);
    const d = new Date(EXCEL_EPOCH_UTC + dias * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mes, dia, ano] = m;
  ano = Number(ano);
  if (ano < 100) ano += 2000;
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

// Valores vêm como número (raw) ou texto "R$ 1,234.56" (formato americano)
function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/R\$|\s/g, '').replace(/,/g, '');
  if (!s || s === '-') return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function mapStatus(s) {
  const v = String(s || '').trim().toUpperCase();
  if (v === 'FECHADA' || v === 'FECHADO') return 'FECHADA';
  return 'ATIVA';
}

function mapEtapa(s) {
  const v = String(s || '').trim().toUpperCase();
  return v || null;
}

module.exports = { toIsoDate, toNumber, mapStatus, mapEtapa };
