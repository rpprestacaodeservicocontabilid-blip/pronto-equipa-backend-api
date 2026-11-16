import { promises as fs } from 'fs';
import path from 'path';
import { AuditEvidenceStoragePort } from '../../application/ports/audit-engine.ports';
export class FileAuditEvidenceStorage implements AuditEvidenceStoragePort {
  constructor(
    private readonly root: string,
    private readonly anchorRoot?: string,
  ) {}
  private location(root: string, key: string) {
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(path.resolve(root) + path.sep))
      throw new Error('Invalid audit storage key.');
    return resolved;
  }
  async put(scopeKey: string, id: string, bytes: Buffer) {
    const key = `${scopeKey.replace(':', '-')}/${id}.json`;
    const file = this.location(this.root, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
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
      throw new Error('Configure an independently protected audit checkpoint anchor.');
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
