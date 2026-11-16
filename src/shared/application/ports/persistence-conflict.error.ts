export class PersistenceConflictError extends Error {
  constructor() {
    super('A record with this identity already exists.');
    this.name = 'PersistenceConflictError';
  }
}
