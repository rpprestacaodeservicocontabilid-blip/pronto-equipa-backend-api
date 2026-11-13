# Organization module

The module is mounted at `/api/v1/organization` and uses the repository's
Express/Sequelize stack. Every route requires authentication, a validated
company context, and an `organization:*` permission. Organization changes are
versioned, written to an append-only history table, audited, and inserted into
an outbox in the same database transaction.

Supported resources include departments and their hierarchy, employee
department assignments, job functions, positions, professional categories,
cost centers and percentage allocations, establishments, work calendars and
exceptions, schedules, shifts, and schedule assignments. API IDs and foreign
references are validated within the active company. PostgreSQL RLS supplements
these tenant-scoped repository queries.

No Angolan legal limits, official holidays, or weekly-hours maxima are
hard-coded. Calendar and schedule records can reference a legal-rule version,
but a `legal-rules` provider is not yet available to validate those references.
Outbox consumers should be idempotent and set `publishedAt` only after
successful delivery. Integration with closed payroll periods and downstream
notifications remains the responsibility of those consumers.

The implementation uses a shared typed record table with a resource-type
discriminator to keep migrations aligned with this Sequelize codebase. If the
domain later needs specialized query workloads, individual resource tables
can be extracted behind the existing repository contract.
