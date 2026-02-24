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
  let token;
  try {
    token = process.env.AUTH_TOKEN || await login();
  } catch (err) {
    if (String(err?.message || err).toLowerCase().includes("fetch")) {
      console.error("smoke_order_custom_fields: backend no disponible en", appUrl);
      process.exit(2);
    }
    throw err;
  }

  const fieldsRes = await api(token, '/api/order-presets/types/SERVICIO/fields');
  assert.equal(fieldsRes.res.status, 200, `fields expected 200 got ${fieldsRes.res.status}`);
  let field = (fieldsRes.body?.data || []).find((f) => f.fieldType === 'TEXT');

  if (!field) {
    const createField = await api(token, '/api/order-presets/types/SERVICIO/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: `Observación smoke ${Date.now()}`, fieldType: 'TEXT', required: false }),
    });
    assert.equal(createField.res.status, 201, `create field expected 201 got ${createField.res.status}`);
    field = createField.body?.data;
  }

  assert.ok(field?.id, 'custom text field id required');

  const createOrder = await api(token, '/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderTypeCode: 'SERVICIO',
      type: 'SERVICIO',
      customerName: 'Smoke Custom Fields',
      description: 'smoke order',
      customFields: [{ fieldId: field.id, valueText: 'valor smoke' }],
    }),
  });
  assert.equal(createOrder.res.status, 201, `create order expected 201 got ${createOrder.res.status}: ${JSON.stringify(createOrder.body)}`);
  const orderId = createOrder.body?.data?.id;
  assert.equal(typeof orderId, 'number', 'order id must be number');

  const readCustom = await api(token, `/api/orders/${orderId}/custom-fields`);
  assert.equal(readCustom.res.status, 200, `custom-fields expected 200 got ${readCustom.res.status}: ${JSON.stringify(readCustom.body)}`);
  let found = (readCustom.body?.data?.customFields || []).find((x) => x.fieldId === field.id);
  assert.ok(found, 'custom field should be returned');

  const updatedValue = `valor smoke actualizado ${Date.now()}`;
  const patchOrder = await api(token, `/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customFields: [{ fieldId: field.id, valueText: updatedValue }] }),
  });
  assert.equal(patchOrder.res.status, 200, `patch order expected 200 got ${patchOrder.res.status}: ${JSON.stringify(patchOrder.body)}`);

  const readAfter = await api(token, `/api/orders/${orderId}/custom-fields`);
  assert.equal(readAfter.res.status, 200, `custom-fields after patch expected 200 got ${readAfter.res.status}: ${JSON.stringify(readAfter.body)}`);
  found = (readAfter.body?.data?.customFields || []).find((x) => x.fieldId === field.id);
  assert.equal(found?.valueText, updatedValue, `custom value should be updated, got ${found?.valueText}`);

  console.log('smoke_order_custom_fields: OK', { appUrl, orderId, fieldId: field.id });
}

main().catch((err) => {
  console.error('smoke_order_custom_fields FAIL', err?.message || err);
  process.exit(1);
});
