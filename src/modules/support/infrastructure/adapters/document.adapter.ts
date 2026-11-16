import { SupportDocumentPort } from '../../application/ports/support-ports';

export class SupportDocumentAdapter implements SupportDocumentPort {
  constructor(
    private readonly readDocument: (companyId: number, id: string) => Promise<{ status: string }>,
  ) {}

  async assertAvailable(input: { tenantId: string; documentId: string }) {
    const document = await this.readDocument(Number(input.tenantId), input.documentId);
    if (document.status !== 'ACTIVE')
      throw Object.assign(new Error('O documento anexado não está disponível.'), {
        statusCode: 422,
      });
  }
}
