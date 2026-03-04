import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { createRequireBranchAccess, resolveBranchScope } from "./branch-scope";

function mockResponse() {
  const payload: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      payload.status = code;
      return this;
    },
    json(body: unknown) {
      payload.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, payload };
}

test("BRANCH_REQUIRED cuando falta sucursal en endpoint branch-scoped", async () => {
  const middleware = resolveBranchScope(true);
  const req = {
    method: "POST",
    headers: {},
    query: {},
    auth: { tenantId: 1, userId: 9, scope: "TENANT" },
  } as unknown as Request;
  const { res, payload } = mockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(payload.status, 403);
  assert.deepEqual(payload.body, { code: "BRANCH_REQUIRED", message: "Seleccioná una sucursal para continuar" });
});

test("BRANCH_FORBIDDEN cuando usuario no pertenece a la sucursal", async () => {
  const middleware = createRequireBranchAccess({
    findUserRoleAndScope: async () => ({ role: "staff", scope: "TENANT" }),
    hasBranchAssignment: async () => false,
  });
  const req = {
    auth: { tenantId: 1, userId: 9, role: "staff", scope: "TENANT" },
    branchScopeId: 99,
  } as unknown as Request;
  const { res, payload } = mockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(payload.status, 403);
  assert.deepEqual(payload.body, { code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
});

test("happy path: usuario asignado puede operar en su sucursal", async () => {
  const middleware = createRequireBranchAccess({
    findUserRoleAndScope: async () => ({ role: "staff", scope: "TENANT" }),
    hasBranchAssignment: async () => true,
  });
  const req = {
    auth: { tenantId: 1, userId: 9, role: "staff", scope: "TENANT" },
    branchScopeId: 10,
  } as unknown as Request;
  const { res } = mockResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
