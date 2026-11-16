/**
 * Porta de armazenamento de ficheiros do utilizador.
 *
 * Espelha o contrato efectivamente implementado pelo
 * `StorageGatewayImpl`.
 */
export interface StorageGateway {
  uploadAvatar(
    userId: number,
    file: Buffer,
    contentType: string,
  ): Promise<{
    url: string;
    key: string;
  }>;

  delete(key: string): Promise<void>;
}
