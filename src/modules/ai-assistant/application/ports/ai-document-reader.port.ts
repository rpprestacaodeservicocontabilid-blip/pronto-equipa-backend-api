/**
 * Porta de leitura de documentos do módulo `documents/`
 * (RF-AI-023, RN-AI-009).
 *
 * O acesso é verificado pelo módulo proprietário — o assistente
 * apenas recebe conteúdo que o utilizador já pode consultar.
 */
export interface AiAuthorizedDocument {
  id: string;
  title: string;
  classification: string;
  version: string;
  content: string;
  reference: string;
}

export interface AiDocumentReaderPort {
  /** Documentos do tenant que o actor pode consultar. */
  search(input: {
    tenantId: number;
    actorId: number;
    query: string;
    limit: number;
  }): Promise<AiAuthorizedDocument[]>;

  /** Conteúdo de um documento específico, com verificação de acesso. */
  read(input: { tenantId: number; actorId: number; documentId: string }): Promise<AiAuthorizedDocument | null>;

  /** Garante que o documento continua disponível (revogações). */
  assertAvailable(input: { tenantId: number; documentId: string }): Promise<void>;
}
