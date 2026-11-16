# Platform Billing

## Implementação disponível

O módulo utiliza Express, TypeScript e Sequelize, seguindo o ORM efectivamente utilizado pela aplicação. Os montantes são strings decimais convertidas em inteiros de precisão arbitrária. Cada operação financeira usa transacção PostgreSQL, contexto RLS e bloqueio consultivo por empresa.

Rotas do cliente em `/platform-billing`: GET account, invoices, payments, receipts e balance; PUT account. Exigem JWT, contexto da empresa e permissões `platform-billing:read` ou `platform-billing:account:update`.

Rotas administrativas em `/platform-billing/admin/tenants/:companyId`: PUT account; POST series; POST invoices; POST invoices/:id/issue; POST payments; POST payments/:id/confirm; GET account, invoices, payments, receipts, audit e events. Exigem SUPER_ADMIN.

Aplicar `20261116000001-create-platform-billing.js` com o executor de migrações existente. Utilizar PostgreSQL e um utilizador sem privilégios de superuser/BYPASSRLS. A emissão exige conta fiscal e série com emissor e referência de validação. Não existe taxa fiscal pré-configurada: cada linha exige taxa em basis points e identificação da versão fiscal.

As facturas preservam os dados do adquirente e emissor e hash no momento da emissão. As chaves de operação impedem duplicação de rascunhos; referências de pagamentos são únicas por prestador e empresa. A confirmação manual exige um actor diferente do autor do registo, evidência e moeda compatível. Sobrepagamentos são recusados. A confirmação cria recibo, auditoria e outbox na mesma transacção.

## Extensão financeira

Implementados POST credit-notes, refunds, refunds/:id/decision, refunds/:id/execute, statements e reconciliation nas rotas administrativas por empresa. Os reembolsos reservam o valor ainda disponível do pagamento e exigem aprovação por outro actor. A execução regista evidência da transferência externa; não efectua transferências bancárias. Notas de crédito reduzem apenas o saldo em aberto, sem criar saldo credor.

O runtime de outbox está registado no bootstrap. Configurar PLATFORM_BILLING_EVENTS_URL e PLATFORM_BILLING_EVENTS_TOKEN para o consumidor autorizado. Tentativas com backoff exponencial terminam em DEAD após dez falhas. O consumidor deve respeitar Idempotency-Key. Eventos de pagamentos parciais incluem settled=false e não devem activar ou renovar subscrições. Este dispatcher genérico não substitui o adaptador específico de Subscriptions.

As importações recebem movimentos estruturados JSON, até mil por pedido. Valores e moeda têm de coincidir com um pagamento confirmado para reconciliar. A unicidade impede reutilização do mesmo pagamento ou movimento.

## Cobrança e documentos

POST tax-rules regista versões fiscais imutáveis com validade, basisPoints e fundamento legal. A emissão valida cada linha contra esse catálogo. POST schedules recebe subscrição, moeda, linhas, nextAt, intervalMonths e dueDays; o runtime factura períodos vencidos, recupera falhas e impede duplicação pela chave do ciclo. POST debit-notes emite uma factura de ajuste ligada à original. GET /platform-billing/documents/:kind/:id/pdf entrega INVOICE, RECEIPT ou CREDIT_NOTE do tenant autenticado.

O runtime chama directamente Subscriptions para liquidações integrais e vencimentos. A entrega é idempotente no consumidor. Agendamentos devem ser criados para subscrições efectivamente contratadas; o runtime sincroniza automaticamente os agendamentos com Subscriptions, a cada 30 segundos. Configurar PLATFORM_BILLING_SUBSCRIPTION_TAX_VERSION e criar a versão fiscal correspondente em cada empresa. Contratos cancelados, suspensos, expirados ou com cancelamento no fim do período deixam de produzir novos agendamentos automáticos.

POST /platform-billing/internal/provider-events suporta um adaptador genérico de notificações assinadas. Configurar PLATFORM_BILLING_PROVIDER_WEBHOOK_SECRET. Headers: x-billing-timestamp em milissegundos, x-billing-payload com JSON em base64 contendo companyId, paymentId, reference, provider, amount e currency, x-billing-signature com HMAC SHA256 hexadecimal de timestamp + newline + payload. A tolerância é de cinco minutos. O prestador deve verificar o recebimento antes de assinar. O estado do pagamento torna retries idempotentes. Não se trata de integração homologada com um banco específico.

## Limitações para produção

A emissão fiscal real depende da validação das séries do emissor. Recibos e notas de crédito usam séries RC e NC, com snapshots e hash. Criar séries FT, RC, NC e ND pela rota administrativa de séries, indicando documentType. A numeração inclui o identificador da empresa para distinguir séries entre tenants e deve ser validada pela entidade emissora. A integração de prestadores é um contrato genérico assinado e exige homologação do adaptador do banco escolhido. Os agendamentos automáticos utilizam o preço da subscrição persistida. O contrato de leitura resolve o preço da versão pendente na moeda e periodicidade contratadas. Diferenças proporcionais de upgrade exigem validação comercial antes de emissão. 

Não activar emissão fiscal em produção até concluir estes pontos, validar o enquadramento da entidade emissora e executar verificações de integridade, concorrência e isolamento multi-tenant. As migrações não foram aplicadas nesta entrega.
