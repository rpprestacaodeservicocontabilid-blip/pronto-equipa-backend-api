/**
 * Geração e validação de códigos OTP.
 *
 * O código nunca é persistido em texto simples:
 * apenas o seu hash é guardado.
 */
export interface OtpServicePort {
  generateCode(): string;

  hash(code: string): string;

  matches(code: string, codeHash: string): boolean;
}
