'use strict';
const { Sequelize } = require('sequelize');
const { createAuditMonth } = require('../src/infra/database/helpers/audit-partitioning.cjs');
const url = process.env.AUDIT_PARTITION_DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\//.test(url))
  throw new Error('Set AUDIT_PARTITION_DATABASE_URL using a dedicated migration role.');
const db = new Sequelize(url, { logging: false });
(async () => {
  try {
    const at = new Date();
    for (let offset = 0; offset <= 2; offset++)
      console.log(
        await createAuditMonth(
          db.getQueryInterface(),
          new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + offset, 1)),
        ),
      );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(
    'Audit partition maintenance failed:',
    error instanceof Error ? error.name : 'Unknown',
  );
  process.exitCode = 1;
});
