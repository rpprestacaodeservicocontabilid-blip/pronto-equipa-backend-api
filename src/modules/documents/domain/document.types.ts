export type DocumentConfidentiality =
  | 'PUBLIC_INTERNAL'
  | 'RESTRICTED'
  | 'CONFIDENTIAL'
  | 'HIGHLY_CONFIDENTIAL';
export const DOCUMENT_CATEGORIES = [
  ...[
    'Identificação',
    'Dados profissionais',
    'Contratos',
    'Férias e licenças',
    'Justificativos',
    'Remuneração',
    'Empréstimos',
    'Outros',
  ].map((name, i) => ({
    code: `DOC-EMP-${String(i + 1).padStart(3, '0')}`,
    scope: 'EMPLOYEE',
    name,
  })),
  ...[
    'Institucionais',
    'Administrativos',
    'Fiscais',
    'Segurança Social',
    'Bancários',
    'Políticas internas',
    'Relatórios',
    'Outros',
  ].map((name, i) => ({
    code: `DOC-CMP-${String(i + 1).padStart(3, '0')}`,
    scope: 'COMPANY',
    name,
  })),
] as const;
export const DOCUMENT_PERMISSIONS = {
  read: 'documents:read',
  sensitive: 'documents:read-sensitive',
  upload: 'documents:upload',
  bulk: 'documents:upload-bulk',
  metadata: 'documents:metadata:update',
  classify: 'documents:classify',
  download: 'documents:download',
  preview: 'documents:preview',
  versionCreate: 'documents:versions:create',
  versionRead: 'documents:versions:read',
  validationSubmit: 'documents:validation:submit',
  validationApprove: 'documents:validation:approve',
  validationReject: 'documents:validation:reject',
  associationCreate: 'documents:associations:create',
  associationDelete: 'documents:associations:delete',
  archive: 'documents:archive',
  restore: 'documents:restore',
  deleteRequest: 'documents:deletion:request',
  deleteApprove: 'documents:deletion:approve',
  holdCreate: 'documents:legal-holds:create',
  holdRelease: 'documents:legal-holds:release',
  categories: 'documents:categories:manage',
  types: 'documents:types:manage',
  policies: 'documents:policies:manage',
  storage: 'documents:storage:read',
  audit: 'documents:audit:read',
} as const;
