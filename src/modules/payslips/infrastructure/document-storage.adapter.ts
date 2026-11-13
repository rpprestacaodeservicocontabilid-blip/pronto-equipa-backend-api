import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

export interface PayslipDocumentStorage {
  put(companyId: number, payslipId: string, bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

/** Private disk adapter for single-node deployments; production can replace this port with S3/MinIO. */
export class FileSystemPayslipStorage implements PayslipDocumentStorage {
  private readonly root = path.resolve(process.env.PAYSLIPS_STORAGE_PATH ?? path.join(process.cwd(), 'storage', 'payslips'));

  async put(companyId: number, payslipId: string, bytes: Buffer): Promise<string> {
    const key = `tenants/${companyId}/${payslipId}/${payslipId}.pdf`;
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
      await fs.rm(temporary, { force: true });
      await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    });
    await fs.rename(temporary, file).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
      await fs.rm(file, { force: true });
      await fs.rename(temporary, file);
    });
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    const file = path.resolve(this.root, key);
    if (!file.startsWith(`${this.root}${path.sep}`)) throw new Error('Invalid payslip storage key.');
    return file;
  }
}
