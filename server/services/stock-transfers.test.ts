import test from "node:test";
import assert from "node:assert/strict";
import { receiveTransferWithDeps } from "./stock-transfers";

test("receive dos veces no duplica movimientos (idempotente)", async () => {
  let status: "SENT" | "RECEIVED" = "SENT";
  let movements = 0;

  const deps = {
    findTransfer: async () => ({
      id: 1,
      tenantId: 1,
      fromBranchId: 10,
      toBranchId: 11,
      status,
      createdBy: 1,
      createdAt: new Date(),
      completedAt: null,
    }),
    findItems: async () => [{ id: 1, tenantId: 1, transferId: 1, productId: 99, quantity: "2" }],
    applyMovement: async () => {
      movements += 1;
      return null as never;
    },
    markReceived: async () => {
      status = "RECEIVED";
      return {
        id: 1,
        tenantId: 1,
        fromBranchId: 10,
        toBranchId: 11,
        status,
        createdBy: 1,
        createdAt: new Date(),
        completedAt: new Date(),
      };
    },
  };

  const first = await receiveTransferWithDeps(1, 1, 7, deps);
  const second = await receiveTransferWithDeps(1, 1, 7, deps);

  assert.equal(first.status, "RECEIVED");
  assert.equal(second.status, "RECEIVED");
  assert.equal(movements, 2);
});
