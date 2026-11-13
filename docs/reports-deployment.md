# Reports module: schema and deployment

The module adds tenant-scoped `report_records` for immutable execution snapshots and controlled metadata for exports, custom definitions and schedules. Apply the migration with the project's normal command before exposing `/api/v1/reports`:

```powershell
npm run db:migrate
```

The migration installs PostgreSQL row-level security using `app.current_tenant` and registers the reports permissions. A company administrator must assign the appropriate report permissions to tenant roles. Report execution is bounded to 5,000 rows; the API currently processes a request synchronously and stores its generated result snapshot. Payroll and tax reports only read payroll results whose run is `CLOSED`; reports do not recalculate IRT/INSS or make a legal declaration.

Exports are private to the creating user and require `reports:exports:download`. The current implementation stores export bytes in the tenant-scoped report record; production deployments with large exports should route this storage port to the private document/object storage service.
