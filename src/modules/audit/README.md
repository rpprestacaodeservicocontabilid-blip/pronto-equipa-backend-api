# Audit

Auditoria modular com domínio independente, casos de uso e portas, adaptadores de infraestrutura e apresentação HTTP.

O contrato público encontra-se em `audit.module.ts`. A composição da aplicação injeta autorização e notificações; relógio, assinatura, persistência e armazenamento têm portas próprias.

`createAuditEventRecorder(sourceId)` expõe o contrato canónico para produtores, com fonte vinculada e propagação de falhas. Políticas, retenção, bloqueios legais, evidências, integridade e regras de alertas possuem agregados de domínio. Os eventos publicados usam uma porta própria e outbox SQL com entrega por Redis Streams.

`AuditRecorderPort.record()` mantém compatibilidade com operações já confirmadas e registo best effort. **Operações críticas** usam captura SQL na transacção ou `TransactionalAuditPort.append(event,context)` com a mesma `RecordStoreContext` da alteração de negócio. O último contrato propaga erros; não os suprimir no chamador.

Consultas não recebem o tenant do corpo do pedido: o contexto é resolvido antes do router. Exportações exigem decisão independente; leitura sensível é uma permissão adicional. Registos confirmados não têm API de edição ou eliminação.

Ver [instalação, API, permissões, garantias e limites de isolamento](../../../docs/audit-deployment.md). As migrações e os testes estão em `src/infra/database/migrations` e `src/tests/integration`. O histórico MySQL 8.4 é exercitado com `docker-compose.mysql-test.yml`; o ensaio de RLS PostgreSQL continua opt-in numa base vazia e descartável.
