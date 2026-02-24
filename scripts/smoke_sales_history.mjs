#!/usr/bin/env node
import assert from 'node:assert/strict';

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5000';
const token = process.env.AUTH_TOKEN || process.env.TOKEN || '';

if (!token) {
  console.error('Missing AUTH_TOKEN (or TOKEN)');
  process.exit(1);
}

async function call(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function assertShape(body) {
  assert.equal(Array.isArray(body?.items), true, 'items must be an array');
  assert.equal(typeof body?.total, 'number', 'total must be a number');
}

const withoutFilters = await call('/api/sales?limit=5&offset=0&sort=date_desc');
assert.equal(withoutFilters.res.status, 200, `Expected 200, got ${withoutFilters.res.status}`);
assertShape(withoutFilters.body);

const withDateRange = await call('/api/sales?from=2026-02-01&to=2026-02-28&limit=5&offset=0&sort=date_desc');
assert.equal(withDateRange.res.status, 200, `Expected 200, got ${withDateRange.res.status}`);
assertShape(withDateRange.body);

console.log('smoke_sales_history: OK', {
  baseUrl,
  statuses: {
    withoutFilters: withoutFilters.res.status,
    withDateRange: withDateRange.res.status,
  },
});
