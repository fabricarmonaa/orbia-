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

async function api(token, path, init = {}) {
  const res = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  const token = process.env.AUTH_TOKEN || await login();

  const types = await api(token, '/api/order-presets/types');
  assert.equal(types.res.status, 200, `types expected 200 got ${types.res.status}: ${JSON.stringify(types.body)}`);
  assert.equal(Array.isArray(types.body?.data), true, 'types data must be array');

  const fieldsBefore = await api(token, '/api/order-presets/types/SERVICIO/fields');
  assert.equal(fieldsBefore.res.status, 200, `fields expected 200 got ${fieldsBefore.res.status}: ${JSON.stringify(fieldsBefore.body)}`);
  assert.equal(Array.isArray(fieldsBefore.body?.data), true, 'fields data must be array');

  const label = `Foto smoke ${Date.now()}`;
  const created = await api(token, '/api/order-presets/types/SERVICIO/fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, fieldType: 'FILE', required: false }),
  });
  assert.equal(created.res.status, 201, `create expected 201 got ${created.res.status}: ${JSON.stringify(created.body)}`);
  const createdId = created.body?.data?.id;
  assert.equal(typeof createdId, 'number', 'created id must be number');

  const fieldsAfter = await api(token, '/api/order-presets/types/SERVICIO/fields');
  assert.equal(fieldsAfter.res.status, 200, `fields-after expected 200 got ${fieldsAfter.res.status}: ${JSON.stringify(fieldsAfter.body)}`);
  const createdField = fieldsAfter.body?.data?.find((f) => f.id === createdId);
  assert.ok(createdField, 'new field should be listed');

  const ids = fieldsAfter.body.data.map((f) => f.id);
  const reorderedIds = [createdId, ...ids.filter((id) => id !== createdId)];
  const reorder = await api(token, '/api/order-presets/types/SERVICIO/fields/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedFieldIds: reorderedIds }),
  });
  assert.equal(reorder.res.status, 200, `reorder expected 200 got ${reorder.res.status}: ${JSON.stringify(reorder.body)}`);

  const deactivate = await api(token, `/api/order-presets/fields/${createdId}/deactivate`, {
    method: 'POST',
  });
  assert.equal(deactivate.res.status, 200, `deactivate expected 200 got ${deactivate.res.status}: ${JSON.stringify(deactivate.body)}`);

  console.log('smoke_order_presets: OK', { appUrl, createdId, totalTypes: types.body.data.length });
}

main().catch((err) => {
  console.error('smoke_order_presets FAIL', err?.message || err);
  process.exit(1);
});
