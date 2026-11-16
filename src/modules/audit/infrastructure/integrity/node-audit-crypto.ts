import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import { AuditCryptoPort } from '../../application/ports/audit-engine.ports';
import { AuditSignature, auditFailure } from '../../domain/audit-contracts';
export class NodeAuditCrypto implements AuditCryptoPort {
  constructor(
    private readonly signingKey?: string,
    private readonly trustedKeys: Readonly<Record<string, string>> = {},
    private readonly keyId = 'audit-key-v1',
  ) {}
  hash(value: string | Buffer) {
    return createHash('sha256').update(value).digest('hex');
  }
  sign(value: string): AuditSignature {
    if (!this.signingKey)
      throw auditFailure('Configure an Ed25519 audit signing key before sealing evidence.', 503);
    const key = createPrivateKey(this.signingKey);
    if (key.asymmetricKeyType !== 'ed25519') throw auditFailure('Audit key must be Ed25519.', 503);
    return {
      keyId: this.keyId,
      algorithm: 'Ed25519',
      signature: sign(null, Buffer.from(value), key).toString('base64'),
    };
  }
  verify(value: string, signature: AuditSignature) {
    if (signature.algorithm !== 'Ed25519') return false;
    const pem =
      this.trustedKeys[signature.keyId] ||
      (signature.keyId === this.keyId && this.signingKey
        ? createPublicKey(this.signingKey).export({ type: 'spki', format: 'pem' })
        : undefined);
    if (!pem) return false;
    try {
      return verify(null, Buffer.from(value), pem, Buffer.from(signature.signature, 'base64'));
    } catch {
      return false;
    }
  }
}
