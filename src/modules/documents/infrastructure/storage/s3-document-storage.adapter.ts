import { createHash, createHmac } from 'crypto';
import { DocumentUploadPort } from '../../application/ports/document.ports';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();
const enc = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const canonicalQuery = (params: URLSearchParams) =>
  [...params.entries()]
    .map(([k, v]) => [enc(k), enc(v)] as [string, string])
    .sort(([a, va], [b, vb]) => a.localeCompare(b) || va.localeCompare(vb))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
export class S3DocumentStorage implements DocumentUploadPort {
  private config() {
    const endpoint = process.env.DOCUMENTS_S3_ENDPOINT,
      bucket = process.env.DOCUMENTS_S3_BUCKET,
      accessKey = process.env.DOCUMENTS_S3_ACCESS_KEY,
      secretKey = process.env.DOCUMENTS_S3_SECRET_KEY;
    if (!endpoint || !bucket || !accessKey || !secretKey)
      throw Object.assign(new Error('S3-compatible document storage is not configured.'), {
        statusCode: 503,
      });
    return {
      endpoint: new URL(endpoint),
      bucket,
      accessKey,
      secretKey,
      region: process.env.DOCUMENTS_S3_REGION || 'us-east-1',
    };
  }
  private url(key: string, query?: Record<string, string>) {
    const c = this.config(),
      url = new URL(c.endpoint);
    const prefix = url.pathname.replace(/\/$/, '');
    url.pathname = `${prefix}/${c.bucket}/${key.split('/').map(enc).join('/')}`.replace(
      /\/+/g,
      '/',
    );
    url.search = '';
    for (const [k, v] of Object.entries(query || {})) url.searchParams.append(k, v);
    return url;
  }
  async createUpload(input: {
    companyId: number;
    documentId: string;
    versionId: string;
    uploadId: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    partSizeBytes: number;
  }) {
    const multipart = input.sizeBytes >= 8 * 1024 * 1024;
    const storageKey = `tenants/${input.companyId}/quarantine/${input.uploadId}/original`;
    if (!multipart)
      return {
        storageKey,
        mode: 'SINGLE' as const,
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        parts: [{ partNumber: 1, url: this.presign('PUT', storageKey, 900), headers: {} }],
      };
    const started = await this.request(
      'POST',
      storageKey,
      undefined,
      { 'content-type': 'application/xml' },
      { uploads: '' },
    );
    const xml = await started.text();
    const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
    if (!uploadId) throw new Error('Object storage did not return a multipart upload identifier.');
    const count = Math.ceil(input.sizeBytes / input.partSizeBytes);
    const parts = Array.from({ length: count }, (_, i) => ({
      partNumber: i + 1,
      url: this.presign('PUT', storageKey, 900, { partNumber: String(i + 1), uploadId }),
      headers: {},
    }));
    return {
      storageKey,
      mode: 'MULTIPART' as const,
      multipartUploadId: uploadId,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      parts,
    };
  }
  async completeUpload(
    storageKey: string,
    multipartUploadId?: string,
    parts: Array<{ partNumber: number; etag: string }> = [],
  ) {
    if (multipartUploadId) {
      if (!parts.length)
        throw Object.assign(new Error('Multipart upload parts are required.'), { statusCode: 400 });
      const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      if (
        ordered.some(
          (part, index) =>
            part.partNumber !== index + 1 || !/^"?[a-fA-F0-9-]{8,80}"?$/.test(part.etag),
        )
      )
        throw Object.assign(new Error('Invalid or incomplete multipart part list.'), {
          statusCode: 400,
        });
      const body = `<CompleteMultipartUpload>${ordered.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag.startsWith('"') ? part.etag : `"${part.etag}"`}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const response = await this.request(
        'POST',
        storageKey,
        Buffer.from(body),
        { 'content-type': 'application/xml' },
        { uploadId: multipartUploadId },
      );
      const result = await response.text();
      if (result.includes('<Error>'))
        throw new Error('Object storage could not complete multipart upload.');
    }
    const response = await this.request('HEAD', storageKey);
    return {
      sizeBytes: Number(response.headers.get('content-length') || 0),
      etag: response.headers.get('etag'),
      contentType: response.headers.get('content-type'),
    };
  }
  async abortUpload(storageKey: string, multipartUploadId?: string) {
    if (multipartUploadId)
      await this.request('DELETE', storageKey, undefined, {}, { uploadId: multipartUploadId });
    else await this.deleteObject(storageKey);
  }
  async downloadUrl(storageKey: string, expiresSeconds: number) {
    return this.presign('GET', storageKey, Math.max(30, Math.min(expiresSeconds, 600)));
  }
  async readObject(storageKey: string) {
    const response = await this.request('GET', storageKey);
    return Buffer.from(await response.arrayBuffer());
  }
  async promoteObject(sourceKey: string, destinationKey: string) {
    const source = `/${this.config().bucket}/${sourceKey.split('/').map(enc).join('/')}`;
    await this.request('PUT', destinationKey, undefined, { 'x-amz-copy-source': source });
  }
  async deleteObject(storageKey: string) {
    await this.request('DELETE', storageKey);
  }
  private presign(
    method: string,
    key: string,
    expires: number,
    extra: Record<string, string> = {},
  ) {
    const c = this.config(),
      url = this.url(key, extra),
      now = new Date(),
      amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
      day = amz.slice(0, 8),
      scope = `${day}/${c.region}/s3/aws4_request`;
    const params = new URLSearchParams(url.search);
    params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    params.set('X-Amz-Credential', `${c.accessKey}/${scope}`);
    params.set('X-Amz-Date', amz);
    params.set('X-Amz-Expires', String(expires));
    params.set('X-Amz-SignedHeaders', 'host');
    const canonical = [
      method,
      url.pathname,
      canonicalQuery(params),
      `host:${url.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha(canonical)}`;
    const signature = createHmac('sha256', this.signingKey(c.secretKey, day, c.region))
      .update(stringToSign)
      .digest('hex');
    params.set('X-Amz-Signature', signature);
    url.search = canonicalQuery(params);
    return url.toString();
  }
  private signingKey(secret: string, day: string, region: string) {
    const date = hmac(`AWS4${secret}`, day),
      regionKey = hmac(date, region),
      service = hmac(regionKey, 's3');
    return hmac(service, 'aws4_request');
  }
  private async request(
    method: string,
    key: string,
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
    query: Record<string, string> = {},
  ): Promise<Response> {
    const c = this.config(),
      url = this.url(key, query),
      now = new Date(),
      amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
      day = amz.slice(0, 8),
      payload = sha(body ?? Buffer.alloc(0));
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payload,
      'x-amz-date': amz,
      ...extraHeaders,
    };
    const names = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = names
      .map(
        (name) =>
          `${name}:${headers[Object.keys(headers).find((k) => k.toLowerCase() === name)!].trim().replace(/\s+/g, ' ')}\n`,
      )
      .join('');
    const signed = names.join(';');
    const canonical = [
      method,
      url.pathname,
      canonicalQuery(url.searchParams),
      canonicalHeaders,
      signed,
      payload,
    ].join('\n');
    const scope = `${day}/${c.region}/s3/aws4_request`,
      stringToSign = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha(canonical)}`,
      signature = createHmac('sha256', this.signingKey(c.secretKey, day, c.region))
        .update(stringToSign)
        .digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
    const response = await fetch(url, {
      method,
      headers: { ...headers, Authorization: authorization },
      ...(body ? { body: body as any } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok && !(method === 'DELETE' && response.status === 404))
      throw Object.assign(
        new Error(`Document object storage request failed (${response.status}).`),
        { statusCode: 502 },
      );
    return response;
  }
}
