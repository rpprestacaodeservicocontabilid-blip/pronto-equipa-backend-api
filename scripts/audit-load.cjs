/* Read-only local HTTP workload. Run against an isolated test database, never production. */
'use strict';
const { performance } = require('node:perf_hooks');
const base = new URL(process.env.AUDIT_LOAD_BASE_URL || 'http://127.0.0.1:3000/api/v1/');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
  process.env.AUDIT_LOAD_CONFIRMED !== 'YES'
)
  throw new Error('Use localhost and AUDIT_LOAD_CONFIRMED=YES with an isolated test database.');
const token = process.env.AUDIT_LOAD_TOKEN,
  company = process.env.AUDIT_LOAD_COMPANY_ID;
if (!token || !company) throw new Error('Set AUDIT_LOAD_TOKEN and AUDIT_LOAD_COMPANY_ID.');
const concurrency = Number(process.env.AUDIT_LOAD_CONCURRENCY || 20),
  requests = Number(process.env.AUDIT_LOAD_REQUESTS || 200);
if (
  !Number.isSafeInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 5000 ||
  !Number.isSafeInteger(requests) ||
  requests < 1 ||
  requests > 100000
)
  throw new Error('Invalid load bounds.');
let next = 0,
  errors = 0;
const latencies = [],
  statuses = {};
const start = performance.now();
async function run() {
  while (next++ < requests) {
    const began = performance.now();
    try {
      const response = await fetch(
        new URL(
          'audit/records?limit=50&purpose=Authorized%20load%20test',
          base.href.endsWith('/') ? base : new URL(base.href + '/'),
        ),
        {
          headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': company },
          signal: AbortSignal.timeout(30000),
        },
      );
      await response.arrayBuffer();
      statuses[response.status] = (statuses[response.status] || 0) + 1;
      if (!response.ok) errors++;
    } catch {
      errors++;
    } finally {
      latencies.push(performance.now() - began);
    }
  }
}
Promise.all(Array.from({ length: Math.min(concurrency, requests) }, run))
  .then(() => {
    latencies.sort((a, b) => a - b);
    const elapsedMs = performance.now() - start;
    console.log(
      JSON.stringify(
        {
          requests,
          concurrency,
          errors,
          statuses,
          elapsedMs,
          requestsPerSecond: requests / (elapsedMs / 1000),
          p50Ms: latencies[Math.floor((latencies.length - 1) * 0.5)],
          p95Ms: latencies[Math.floor((latencies.length - 1) * 0.95)],
          p99Ms: latencies[Math.floor((latencies.length - 1) * 0.99)],
        },
        null,
        2,
      ),
    );
    if (errors) process.exitCode = 1;
  })
  .catch(() => {
    process.exitCode = 1;
  });
