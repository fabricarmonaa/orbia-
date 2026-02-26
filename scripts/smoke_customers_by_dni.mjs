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

const missingDni = `99${Date.now().toString().slice(-8)}`;
const notFound = await call(`/api/customers/by-dni?dni=${encodeURIComponent(missingDni)}`);
assert.equal(notFound.res.status, 404, `Expected 404 for missing customer, got ${notFound.res.status}`);
assert.equal(typeof notFound.body?.error?.code, 'string', 'Expected JSON error.code for missing customer');

const invalid = await call('/api/customers/by-dni?dni=abc');
assert.equal(invalid.res.status, 400, `Expected 400 for invalid DNI, got ${invalid.res.status}`);
assert.equal(invalid.body?.error?.code, 'CUSTOMER_DNI_INVALID', 'Expected CUSTOMER_DNI_INVALID code');

console.log('smoke_customers_by_dni: OK', {
  baseUrl,
  statuses: {
    notFound: notFound.res.status,
    invalid: invalid.res.status,
  },
});
