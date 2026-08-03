// Parser de CSV separado por vírgula, com campos opcionalmente entre aspas
// duplas: dentro das aspas, vírgula e quebra de linha valem como texto e ""
// vale uma aspa literal. Escrito à mão em vez de usar a lib xlsx porque o
// xlsx faz coerção de tipos (transformaria "R$3383,15" e "2026-07-01
// 00:00:00" em algo imprevisível) e não dá controle sobre BOM/encoding.

function parseLinhas(texto) {
  const t = String(texto).replace(/^﻿/, '');
  const linhas = [];
  let campos = [];
  let atual = '';
  let dentroAspas = false;
  let linhaFisica = 1;
  let linhaInicio = 1;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { atual += '"'; i++; } else dentroAspas = false;
      } else {
        if (c === '\n') linhaFisica++;
        atual += c;
      }
      continue;
    }
    if (c === '"') { dentroAspas = true; continue; }
    if (c === ',') { campos.push(atual); atual = ''; continue; }
    if (c === '\r') continue; // CRLF: quem fecha a linha é o \n
    if (c === '\n') {
      campos.push(atual);
      linhas.push({ numero: linhaInicio, campos });
      linhaFisica++;
      linhaInicio = linhaFisica;
      campos = [];
      atual = '';
      continue;
    }
    atual += c;
  }
  campos.push(atual);
  linhas.push({ numero: linhaInicio, campos });

  return linhas.filter(l => l.campos.some(c => c.trim() !== ''));
}

function parseCsv(texto) {
  const linhas = parseLinhas(texto);
  if (!linhas.length) return { colunas: [], registros: [] };
  const colunas = linhas[0].campos.map(c => c.trim());
  const registros = linhas.slice(1).map(l => {
    const reg = { _linha: l.numero };
    colunas.forEach((coluna, i) => { reg[coluna] = (l.campos[i] ?? '').trim(); });
    return reg;
  });
  return { colunas, registros };
}

module.exports = { parseCsv };
