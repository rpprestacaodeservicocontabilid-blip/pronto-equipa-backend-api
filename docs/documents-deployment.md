# Módulo Documents — operação

## Dependências

- PostgreSQL com migrações Sequelize aplicadas; a migração cria tabelas, índices, políticas RLS por `app.current_tenant` e permissões de tenant.
- Armazenamento privado compatível com S3, com suporte a presigned PUT, multipart e CopyObject.
- ClamAV `clamd` acessível pela rede da aplicação.
- Redis/BullMQ para processar verificações e eliminações em background.

Configure as variáveis no serviço API e no worker:

```env
DOCUMENTS_S3_ENDPOINT=https://s3.example.internal
DOCUMENTS_S3_BUCKET=prontoequipas-private
DOCUMENTS_S3_ACCESS_KEY=<secret>
DOCUMENTS_S3_SECRET_KEY=<secret>
DOCUMENTS_S3_REGION=us-east-1
DOCUMENTS_CLAMAV_HOST=clamav
DOCUMENTS_CLAMAV_PORT=3310
DOCUMENTS_WORKER_ENABLED=true
DOCUMENTS_MAX_FILE_BYTES=104857600
DOCUMENTS_MULTIPART_PART_BYTES=8388608
DOCUMENTS_DEFAULT_QUOTA_BYTES=107374182400
```

Use TLS entre aplicação e armazenamento, bucket privado, credenciais limitadas ao bucket, rotação de chaves e backups com retenção. A URL pré-assinada expira em 15 minutos para upload e 2 minutos para download. O object key inclui sempre o identificador da empresa e a área `quarantine/`; apenas objectos limpos são copiados para `documents/`.

## Fluxo de upload

1. `POST /api/v1/documents/uploads` com `Idempotency-Key` (também aceite no corpo como `idempotencyKey`) cria documento e versão pendentes e reserva a quota. Upload em lote: `POST /api/v1/documents/batches` com `files` (até 100 ficheiros), seguido da consulta `GET /api/v1/documents/batches/:id/progress`.
2. O cliente envia os bytes aos URLs devolvidos. Para multipart, envia todas as partes e recolhe o ETag de cada parte.
3. `POST /api/v1/documents/uploads/:sessionId/complete` com `{ "parts": [{ "partNumber": 1, "etag": "..." }] }` conclui e valida o objecto.
4. O worker lê o conteúdo, confere assinatura real/MIME, tamanho e SHA-256, executa ClamAV e promove o conteúdo limpo. Sem worker habilitado, o processamento ocorre sincronamente na API.
5. Com `requireValidation=true` (predefinição), utilizador autorizado submete a validação e outro utilizador aprova/rejeita. O estado `QUARANTINED` nunca permite download.

Os tipos aceites por omissão são PDF, PNG, JPEG, WebP, texto simples, DOCX e XLSX. A lista está no serviço de domínio; ficheiros sem assinatura compatível ou scanner indisponível são colocados em quarentena. O produto não deve expor o object key como URL pública.

## Endpoints disponíveis

| Área | Rotas |
|---|---|
| Upload | `POST /uploads`, `POST /batches`, `GET /batches/:id/progress`, `POST /uploads/:id/complete`, `DELETE /uploads/:id` |
| Documentos | `GET /`, `GET /:id`, `PATCH /:id`, `GET /:id/versions`, `GET /:id/download`, `GET /:id/preview`, `POST /:id/archive`, `POST /:id/restore` |
| Validação | `POST /:id/validation/submit`, `POST /:id/validation/approve`, `POST /:id/validation/reject` |
| Associação e retenção | `GET/POST /:id/associations`, `POST /:id/legal-holds`, `POST /legal-holds/:holdId/release`, `POST /:id/deletion-requests`, `POST /deletion-requests/:id/approve|reject` |
| Administração | `GET/POST /categories`, `GET/PUT /policies`, `GET /storage/usage`, `GET /audit/access` |

Todas as rotas estão atrás de JWT e tenant context. A empresa é sempre derivada do contexto autenticado, nunca do payload. A aprovação de validação e eliminação exige segregação do requerente.

## Operação e reconciliação

- Alertar sobre falhas do worker, disponibilidade do Redis/ClamAV/S3, quota, fila em atraso e falhas de assinatura.
- Reprocessar apenas jobs falhados após confirmar o estado do objecto e da sessão; a fila usa tentativas com backoff exponencial e identificador determinístico.
- Quarentena requer revisão operacional antes de qualquer acção; não disponibilizar URL de download nesse estado.
- Eliminação física é executada só após aprovação, ausência de legal hold e fim do prazo de retenção. Metadados e trilho de auditoria ficam preservados.
- O worker percorre tenants activos de hora a hora, marca documentos expirados e cria alertas auditáveis. Ainda é necessário ligar a entrega/notificação desses alertas ao canal de notificações do produto e configurar uma rotina de limpeza para sessões abandonadas/objectos órfãos.
