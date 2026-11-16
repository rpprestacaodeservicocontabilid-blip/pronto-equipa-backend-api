import { createHash } from 'crypto';

export interface DeviceFingerprintInput {
  userAgent?: string;
  ipAddress?: string;
  acceptLanguage?: string;
  platform?: string;
}

export class DeviceFingerprintService {
  public generate(input: DeviceFingerprintInput): string {
    const raw = [
      input.userAgent ?? '',
      input.ipAddress ?? '',
      input.acceptLanguage ?? '',
      input.platform ?? '',
    ].join('|');

    return createHash('sha256').update(raw).digest('hex');
  }
}
