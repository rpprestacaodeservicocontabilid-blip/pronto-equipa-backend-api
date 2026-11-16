import net from 'net';
import { DocumentScannerPort } from '../../application/ports/document.ports';
/** ClamAV clamd INSTREAM adapter. Missing or unavailable scanner fails closed. */
export class ClamAvDocumentScanner implements DocumentScannerPort {
  async scan(bytes: Buffer): Promise<'CLEAN' | 'INFECTED' | 'UNAVAILABLE'> {
    const host = process.env.DOCUMENTS_CLAMAV_HOST,
      port = Number(process.env.DOCUMENTS_CLAMAV_PORT || 3310);
    if (!host) return 'UNAVAILABLE';
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let response = '';
      let settled = false;
      const finish = (result: 'CLEAN' | 'INFECTED' | 'UNAVAILABLE') => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(15000, () => finish('UNAVAILABLE'));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
          const chunk = bytes.subarray(offset, Math.min(offset + 1024 * 1024, bytes.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
        if (response.includes('FOUND')) finish('INFECTED');
        else if (response.includes('OK')) finish('CLEAN');
        else if (response.includes('ERROR')) finish('UNAVAILABLE');
      });
      socket.on('error', () => finish('UNAVAILABLE'));
      socket.on('close', () => {
        if (!settled) finish('UNAVAILABLE');
      });
    });
  }
}
