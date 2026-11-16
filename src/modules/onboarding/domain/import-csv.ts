/** RFC-style quoted cells; bounded input; no expressions or formulas are evaluated. */
export function parseImportCsv(csv: string): Record<string, string>[] {
  if (Buffer.byteLength(csv, 'utf8') > 1048576) throw new Error('CSV excede um MiB.');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('Aspas inválidas no CSV.');
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
    if (rows.length > 501) throw new Error('CSV excede quinhentas linhas.');
  }
  if (quoted) throw new Error('Campo CSV sem fecho.');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((h) => h.replace(/^\uFEFF/, '').trim());
  if (
    !headers?.length ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !h || ['__proto__', 'constructor', 'prototype'].includes(h))
  )
    throw new Error('Cabeçalhos CSV inválidos.');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Número de colunas inválido na linha ${index + 2}.`);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
}
