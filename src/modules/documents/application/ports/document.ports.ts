export interface DocumentUploadPort {
  createUpload(input: {
    companyId: number;
    documentId: string;
    versionId: string;
    uploadId: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    partSizeBytes: number;
  }): Promise<{
    storageKey: string;
    mode: 'SINGLE' | 'MULTIPART';
    multipartUploadId?: string;
    expiresAt: string;
    parts: Array<{ partNumber: number; url: string; headers: Record<string, string> }>;
  }>;
  completeUpload(
    storageKey: string,
    multipartUploadId?: string,
    parts?: Array<{ partNumber: number; etag: string }>,
  ): Promise<{ sizeBytes: number; etag: string | null; contentType: string | null }>;
  abortUpload(storageKey: string, multipartUploadId?: string): Promise<void>;
  downloadUrl(storageKey: string, expiresSeconds: number): Promise<string>;
  readObject(storageKey: string): Promise<Buffer>;
  promoteObject(sourceKey: string, destinationKey: string): Promise<void>;
  deleteObject(storageKey: string): Promise<void>;
}
export interface DocumentScannerPort {
  scan(bytes: Buffer): Promise<'CLEAN' | 'INFECTED' | 'UNAVAILABLE'>;
}
