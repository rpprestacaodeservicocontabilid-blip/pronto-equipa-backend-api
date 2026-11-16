import { RenderSnapshot } from '../application/ports/payslip-output.port';
import { Buffer } from 'buffer';

const ascii = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
const escapePdf = (value: string) =>
  ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Minimal dependency-free PDF 1.4 renderer. Template data is text/config only; no HTML or scripts execute. */
export class PdfPayslipRenderer {
  render(data: RenderSnapshot): Buffer {
    const lines = [
      String(data.template.title ?? 'RECIBO DE VENCIMENTO'),
      data.copyLabel ?? '',
      `${data.employer.name}  |  NIF: ${data.employer.taxId}`,
      data.employer.address ? String(data.employer.address) : '',
      'TRABALHADOR',
      `${data.employee.fullName}  |  Codigo: ${data.employee.employeeCode}`,
      `Periodo: ${data.period.startDate} a ${data.period.endDate}  |  Emitido: ${data.issuedAt.slice(0, 10)}`,
      `Recibo: ${data.payslipNumber}  |  Moeda: ${data.currency}`,
      '',
      'REMUNERACOES',
      ...data.earnings.map(
        (line) => `${line.description} [${line.code}]  ${line.amount} ${data.currency}`,
      ),
      `TOTAL BRUTO  ${data.grossAmount} ${data.currency}`,
      '',
      'DESCONTOS DO TRABALHADOR',
      ...data.deductions.map(
        (line) => `${line.description} [${line.code}]  ${line.amount} ${data.currency}`,
      ),
      `TOTAL DESCONTOS  ${data.totalDeductions} ${data.currency}`,
      '',
      `REMUNERACAO LIQUIDA  ${data.netAmount} ${data.currency}`,
      `Encargos patronais (informativo)  ${data.employerCostsAmount} ${data.currency}`,
      '',
      `Validacao: ${data.verificationCode}`,
    ].filter((line) => line !== '');
    const pages: string[][] = [];
    for (let offset = 0; offset < lines.length; offset += 42)
      pages.push(lines.slice(offset, offset + 42));
    const objects: string[] = [];
    const pageIds = pages.map((_, index) => 4 + index * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    pages.forEach((page, index) => {
      const pageId = pageIds[index];
      const streamId = pageId + 1;
      const content = [
        'BT',
        '/F1 10 Tf',
        '50 790 Td',
        '14 TL',
        ...page.flatMap((line) => [`(${escapePdf(line)}) Tj`, 'T*']),
        'ET',
      ].join('\n');
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`;
      objects[streamId] =
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
    });
    let output = '%PDF-1.4\n';
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = Buffer.byteLength(output, 'latin1');
      output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++)
      output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'latin1');
  }
}
