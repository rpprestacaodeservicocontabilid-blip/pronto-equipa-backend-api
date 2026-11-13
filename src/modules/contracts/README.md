# Contracts module

The module is mounted at `/api/v1/contracts`. It follows the backend's
Express/Sequelize conventions and requires both an authenticated user and a
validated `X-Company-Id` membership context.

Contract changes are tenant-scoped and versioned. Effective-contract changes
are recorded as immutable contract records instead of overwriting history.
Lifecycle events and expiration alerts are written to `contract_outbox` in the
same transaction as the contract change. Consumers should process these
records idempotently and set `publishedAt` only after successful delivery.

Contract-type renewal limits and an opaque `legalRuleVersionId` are configurable
per company. This module does not hard-code Angolan legal limits or validate
legal rule identifiers; that requires an approved `legal-rules` provider.
PostgreSQL RLS supplements repository-level company filters and transaction
context; it does not replace authorization middleware.
