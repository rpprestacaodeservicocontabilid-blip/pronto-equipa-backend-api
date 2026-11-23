import { promises as fs } from 'fs';
import path from 'path';
import { AuditEvidenceStoragePort } from '../../application/ports/audit-engine.ports';
import { auditFailure } from '../../domain/audit-contracts';
export class FileAuditEvidenceStorage implements AuditEvidenceStoragePort {
  async statistics(scopeKey: string): Promise<{
    evidenceFiles: number;
    evidenceBytes: number;
    anchorFiles: number;
    anchorBytes: number;
  }> {
    const measure = async (root: string): Promise<{ files: number; bytes: number }> => {
      const directory = this.location(root, scopeKey.replace(':', '-'));
      let entries: string[];
      try {
        entries = await fs.readdir(directory);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
          return { files: 0, bytes: 0 };
        throw error;
      }
      let files = 0,
        bytes = 0;
      for (const name of entries.filter((n) => /^[a-f0-9-]+\.json$/.test(n))) {
        const stat = await fs.stat(path.join(directory, name));
        if (stat.isFile()) {
          files++;
          bytes += stat.size;
        }
      }
      return { files, bytes };
    };
    const evidence = await measure(this.root),
      anchors = this.anchorRoot ? await measure(this.anchorRoot) : { files: 0, bytes: 0 };
    return {
      evidenceFiles: evidence.files,
      evidenceBytes: evidence.bytes,
      anchorFiles: anchors.files,
      anchorBytes: anchors.bytes,
    };
  }
  constructor(
    private readonly root: string,
    private readonly anchorRoot?: string,
  ) {
    if (anchorRoot) {
      const evidence = path.resolve(root),
        anchor = path.resolve(anchorRoot);
      if (
        evidence === anchor ||
        evidence.startsWith(anchor + path.sep) ||
        anchor.startsWith(evidence + path.sep)
      )
        throw auditFailure(
          'Audit evidence and independent anchors require separate storage roots.',
          503,
        );
    }
  }
  private location(root: string, key: string) {
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(path.resolve(root) + path.sep))
      throw new Error('Invalid audit storage key.');
    return resolved;
  }
  async put(scopeKey: string, id: string, bytes: Buffer) {
    const key = `${scopeKey.replace(':', '-')}/${id}.json`;
    const file = this.location(this.root, key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o400 });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      const current = await fs.readFile(file);
      if (!current.equals(bytes))
        throw new Error('Immutable evidence already exists with different content.');
    }
    return key;
  }
  read(key: string) {
    return fs.readFile(this.location(this.root, key));
  }
  async anchor(scopeKey: string, id: string, bytes: Buffer) {
    if (!this.anchorRoot)
      throw auditFailure('Configure an independently protected audit checkpoint anchor.', 503);
    const storage = new FileAuditEvidenceStorage(this.anchorRoot);
    return storage.put(scopeKey, id, bytes);
  }
  async anchors(scopeKey: string) {
    if (!this.anchorRoot) return [];
    const directory = scopeKey.replace(':', '-');
    const location = this.location(this.anchorRoot, directory);
    let files: string[];
    try {
      files = await fs.readdir(location);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    return Promise.all(
      files
        .filter((file) => /^[a-f0-9-]+\.json$/.test(file))
        .map(async (file) => ({
          key: `${directory}/${file}`,
          bytes: await fs.readFile(this.location(this.anchorRoot!, `${directory}/${file}`)),
        })),
    );
  }
}
