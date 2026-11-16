const escape = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1');
export function billingPdf(data: Record<string, any>, kind: string): Buffer {
  const lines = [
    kind,
    data.number || data.invoiceId || '',
    `Emitido: ${data.issuedAt || ''}`,
    `Emissor: ${data.issuer?.name || ''} NIF ${data.issuer?.taxId || ''}`,
    `Cliente: ${data.buyer?.name || ''} NIF ${data.buyer?.taxId || ''}`,
    ...(data.lines || []).flatMap((l: any) => [
      l.description,
      `${l.quantity} x ${l.unitPrice} | Imposto ${l.tax} | Total ${l.total}`,
    ]),
    `Total: ${data.total || data.amount || ''} ${data.currency || ''}`,
    `Integridade: ${data.documentHash || ''}`,
  ].flatMap((line) => String(line).match(/.{1,85}/g) || ['']);
  const pages = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((page, i) => {
    const id = 4 + i * 2,
      stream = [
        'BT',
        '/F1 10 Tf',
        '45 790 Td',
        '15 TL',
        ...page.flatMap((l) => [`(${escape(l)}) Tj`, 'T*']),
        'ET',
      ].join('\n');
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(output);
    output += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++)
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(
    output + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
  );
}
