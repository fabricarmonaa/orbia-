#!/usr/bin/env node
import assert from 'node:assert/strict';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:5000';
const tenantCode = process.env.SMOKE_TENANT_CODE || 'demo';
const email = process.env.SMOKE_EMAIL || 'admin@demo.com';
const password = process.env.SMOKE_PASSWORD || 'demo123';

async function login() {
  const res = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ tenantCode, email, password }),
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `login expected 200 got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(typeof body?.token, 'string', 'login token missing');
  return body.token;
}

async function main() {
  const token = process.env.AUTH_TOKEN || await login();

  // Uses validateQuery(saleQuerySchema): at least limit + offset should be parsed/coerced.
  const res = await fetch(`${appUrl}/api/sales?limit=7&offset=1&sort=date_desc&number=abc&number=def`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));

  assert.equal(res.status, 200, `sales expected 200 got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(Array.isArray(body?.items), true, 'items must be array');
  assert.equal(typeof body?.total, 'number', 'total must be number');
  assert.equal(Number(body?.meta?.limit), 7, `meta.limit expected 7 got ${body?.meta?.limit}`);
  assert.equal(Number(body?.meta?.offset), 1, `meta.offset expected 1 got ${body?.meta?.offset}`);

  console.log('smoke_validate_query: OK', {
    appUrl,
    status: res.status,
    limit: body?.meta?.limit,
    offset: body?.meta?.offset,
  });
}

main().catch((err) => {
  console.error('smoke_validate_query FAIL', err?.message || err);
  process.exit(1);
});
