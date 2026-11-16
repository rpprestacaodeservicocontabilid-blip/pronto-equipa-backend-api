# Módulo Subscriptions

## Preparação

1. Aplicar a migração `20261114000009-create-subscriptions.js` depois das migrações anteriores.
2. Configurar o secret de eventos recebido do módulo de cobrança e o endpoint de entrega de eventos.
3. Iniciar a API e, em produção, activar o worker com Redis disponível.
4. A equipa de plataforma cria um plano, cria uma versão, define preços/funcionalidades/limites e publica a versão. O módulo não cria preços nem limites comerciais fictícios.
5. Atribuir as permissões `subscriptions:*` aos papéis de tenant apropriados. A administração `/subscriptions/admin` requer a role global `SUPER_ADMIN`.

```env
SUBSCRIPTIONS_BILLING_EVENTS_TOKEN=<secret-partilhado-com-platform-billing>
SUBSCRIPTIONS_EVENTS_URL=https://platform-billing.internal/events
SUBSCRIPTIONS_EVENTS_TOKEN=<token-de-publicacao-de-eventos>
SUBSCRIPTIONS_WORKER_ENABLED=true
SUBSCRIPTIONS_SWEEP_INTERVAL_MS=300000
```

Proteja as duas integrações com TLS e secrets rotacionáveis. O callback de cobrança valida bearer token e `eventId`; a aplicação rejeita eventos repetidos e pagamentos com o mesmo `invoiceId`. Sem token de evento configurado, o endpoint de callback permanece fechado.

## Rotas

Prefixos: `/api/v1/subscriptions`, `/api/v1/subscriptions/admin` e `/api/v1/subscriptions/internal`.

| Área | Operações principais |
|---|---|
| Empresa | `GET /current`, `POST /`, cancelamento/reativação, períodos, histórico, renovação e conversão de trial |
| Catálogo | `GET /plans`, comparação, catálogo de direitos e limites |
| Mudanças | Criar/listar pedidos; aprovação e rejeição pela administração da plataforma por tenant |
| Consumo | Consulta de utilização, feature e limite; reservas/commit/release por contratos TypeScript internos |
| Administração | CRUD de planos em rascunho, catálogo de funcionalidades, versões, publicação, arquivo, subscrições, trials, excepções, políticas e indicadores |
| Cobrança | `POST /api/v1/subscriptions/internal/billing-events`, com bearer token de integração |

Preço é guardado em decimal com duas casas e moeda ISO 4217. Uma versão publicada não pode ser editada. Alterações de preço para cima ficam pendentes de cobrança; downgrades são agendados para o fim do período e recusados se uso/ reservas excederem os limites novos.

## Contratos internos de quota

Os módulos operacionais devem receber `entitlements` e `usage` de `createSubscriptionsModule` por injeção de dependências, em conjunto com RBAC. A sequência para operações limitadas é:

1. Reservar com tenant, métrica, quantidade e `operationKey` estável.
2. Se a operação for confirmada, chamar `commit` com o `reservationId`.
3. Em falha, chamar `release`; reservas vencidas são libertadas pelo ciclo de reconciliação.

Contas de consumo são actualizadas em transacções PostgreSQL com lock/advisory lock; reserva duplicada com mesma chave é idempotente. Sem subscrição activa não é possível reservar. Limites ausentes representam uso ilimitado apenas quando configurados dessa forma no plano.

## Ciclo e eventos

- O worker percorre tenants activos: expira trials, processa períodos de tolerância, cancelamentos agendados, pedidos de alteração aprovados e reservas expiradas.
- Mensagens de outbox ficam pendentes até publicação confirmada pelo destino. O destino deve deduplicar `Idempotency-Key`.
- Eventos de cobrança aceites: `platform-billing.payment.confirmed`, `platform-billing.payment.failed` e `platform-billing.invoice.overdue`.
- A cobrança mantém a responsabilidade por facturas e pagamentos; subscriptions controla vigência e direitos, sem gravar transacções financeiras.
- As chamadas internas de direitos e quota estão disponíveis no contrato de módulo; integre-as em employees, documents, payroll, reports e simulations antes de activar limites comerciais correspondentes.

## Isolamento e observabilidade

Tabelas tenant usam RLS com `app.current_tenant`; o catálogo de planos é global e os caminhos administrativos estão sob `SUPER_ADMIN`. Toda transição cria histórico/outbox e alterações administrativas geram auditoria. Monitorize jobs pendentes, callbacks rejeitados, reservas expiradas, tenants em tolerância e eventos que excedam tentativas.
