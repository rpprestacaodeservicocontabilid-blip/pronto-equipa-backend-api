export class Password {
  private constructor(
    private readonly value: string,
    private readonly hashed: boolean,
  ) {}

  /**
   * Cria uma Password a partir de texto puro.
   *
   * Deve ser usada antes do processo de hash.
   */
  public static create(value: string): Password {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('Password is required.');
    }

    return new Password(value, false);
  }

  /**
   * Cria uma Password a partir de um hash
   * já existente.
   *
   * Deve ser usada quando recuperamos
   * uma password da base de dados.
   */
  public static fromHash(hash: string): Password {
    if (typeof hash !== 'string' || !hash.trim()) {
      throw new Error('Password hash is required.');
    }

    return new Password(hash, true);
  }

  public getValue(): string {
    return this.value;
  }

  public isHashed(): boolean {
    return this.hashed;
  }
}
