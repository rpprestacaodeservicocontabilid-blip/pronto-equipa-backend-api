# Notifications

## Integração

O módulo usa Express, TypeScript e Sequelize, seguindo a aplicação existente. A tabela communication_records evita colisões com as tabelas legadas notifications. Regista mensagens, entregas, versões de templates, preferências, quotas, tentativas e auditoria. Aplicar 20261116000003-create-communications.js depois das migrações de companies e permissions.

Rotas empresariais /notifications exigem autenticação, tenant e permissões. Rotas /notifications/personal usam autenticação e titularidade, para mensagens anteriores à criação de empresa. /notifications/admin/providers exige SUPER_ADMIN e mostra apenas a disponibilidade de configuração, sem segredos.

## APIs

- GET me e me/unread-count; POST me/read-all, me/:id/read e me/:id/archive.
- GET e PUT me/preferences.
- GET me/stream disponibiliza contador SSE com actualização a cada quinze segundos. O cliente deve reconectar após cinco minutos.
- POST send e campaigns recebem key, category, template, variables, recipients com IDs de utilizador e channels. scheduledAt é opcional. São aceites até quinhentos destinatários por pedido.
- GET templates, deliveries, campaigns, quotas e audit.
- POST templates cria nova versão em rascunho; PATCH templates/:id edita apenas rascunhos; POST templates/:id/publish preserva a versão publicada; POST templates/:id/preview valida variáveis.
- POST campaigns/:id/cancel cancela entregas ainda pendentes; não pode retirar mensagens já aceites pelo prestador.
- POST deliveries/:id/retry exige a permissão correspondente e só reabre falhas definitivas, mediante decisão autorizada.

O renderizador produz texto simples, sem avaliar expressões ou HTML. Os destinatários empresariais são resolvidos apenas entre membros activos. E-mails exigem contacto verificado. O adaptador actual de identidade não possui prova de verificação telefónica: SMS fica indisponível até o directório fornecer um número verificado.

## Prestadores e segurança

Configurar NOTIFICATIONS_EMAIL_URL e NOTIFICATIONS_EMAIL_TOKEN para o gateway HTTPS de e-mail. NOTIFICATIONS_SMS_URL e NOTIFICATIONS_SMS_TOKEN seguem o mesmo contrato. O gateway recebe id, channel, recipient, subject e body em JSON e deve honrar Idempotency-Key. Devolve status ACCEPTED, DELIVERED ou UNKNOWN e providerMessageId. HTTP 429 e 5xx são transitórios; outras rejeições HTTP são definitivas. Timeouts ficam UNKNOWN, sem reenvio automático, para evitar duplicação.

O contrato é genérico e precisa de um gateway implementado ou adaptador do prestador contratado. Não pressupõe SMTP, envio SMS homologado ou Push disponível.

POST /notifications/internal/provider-events exige NOTIFICATIONS_CALLBACK_SECRET. Headers x-notification-timestamp, x-notification-payload e x-notification-signature usam milissegundos, JSON em base64 e HMAC SHA256 hexadecimal de timestamp + newline + payload. A tolerância é de cinco minutos. O JSON contém companyId (ou null), deliveryId, providerMessageId e status DELIVERED ou FAILED_PERMANENT. Eventos repetidos não duplicam efeitos.

POST /notifications/internal/events exige Bearer NOTIFICATIONS_EVENTS_TOKEN e envelope `{companyId,notification}`. notification respeita o contrato de send. Só produtores internos autorizados devem possuir esse token. A key deve derivar do identificador persistente do evento. O módulo valida novamente destinatários, modelo e quotas. A integração directa de Onboarding utiliza a mesma aplicação de envio.

## Execução

O runtime é registado no bootstrap e procura trabalho a cada dez segundos. Activar NOTIFICATIONS_BULLMQ_ENABLED=true para utilizar Redis/BullMQ. Os jobs têm cinco tentativas e backoff. Sem esse modo, a varredura persistente processa as mesmas entregas. PostgreSQL serializa o âmbito e usa locks; as chamadas ao prestador têm timeout de quinze segundos. Configurar NOTIFICATIONS_DAILY_QUOTA, com padrão de dez mil entregas por âmbito/dia.

Preferências opcionais são respeitadas antes de criar entregas. Modelos empresariais não podem declarar mensagens obrigatórias. O modelo global de estado de Onboarding é obrigatório. A notificação não contém documentos salariais nem anexos; a consulta dos documentos permanece nas APIs autorizadas. Dados de salário em variáveis explicitamente monetárias das categorias PAYROLL/PAYSLIP/PAYMENT são recusados.

## Validação e limites

Os testes unitários cobrem interpolação segura, variáveis obrigatórias, idempotência do gateway, HTTPS e tratamento de resultados incertos/transitórios/permanentes. Não substituem testes com PostgreSQL, Redis, S3, ClamAV e o prestador contratado. A aplicação tem configurações SQLite/MySQL existentes; o isolamento RLS e a concorrência financeira precisam de um ambiente PostgreSQL coerente antes de produção.

Limitações: gestão de prestadores pela base de dados, campanhas com mais de quinhentos destinatários, relatórios de custos e failover entre prestadores não estão implementados. A ingestão de eventos é explícita; os produtores precisam de publicar ou chamar o contrato interno. As migrations não foram aplicadas nesta entrega.

GET/PUT rules configura regras empresariais por tipo de evento, com destinatários e templates explícitos. POST /notifications/internal/domain-events consome companyId, id, type e variables com o mesmo token interno, sem aceitar destinatários do produtor. GET reports agrega entregas por estado. NOTIFICATIONS_CLEANUP_ENABLED=true activa limpeza de mensagens/entregas terminais conforme NOTIFICATIONS_RETENTION_DAYS (padrão noventa, mínimo trinta dias); estados UNKNOWN/ACCEPTED e auditoria são preservados.
