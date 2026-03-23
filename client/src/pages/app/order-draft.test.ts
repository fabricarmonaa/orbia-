import test from "node:test";
import assert from "node:assert/strict";
import { clearOrderDraft, getOrderDraftKey, loadOrderDraft, saveOrderDraft } from "./order-draft";

function setupBrowserLikeGlobals() {
  const storageFactory = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  };
  (globalThis as any).localStorage = storageFactory();
  (globalThis as any).sessionStorage = storageFactory();
}

test("los drafts se aíslan por tenant + usuario + tipo + preset + pestaña", () => {
  setupBrowserLikeGlobals();

  const userA = { id: 10, tenantId: 1 } as any;
  const userB = { id: 11, tenantId: 1 } as any;

  const keyPedido = getOrderDraftKey({ user: userA, type: "PEDIDO", presetId: 5 });
  const keyServicio = getOrderDraftKey({ user: userA, type: "SERVICIO", presetId: 5 });
  const keyOtherUser = getOrderDraftKey({ user: userB, type: "PEDIDO", presetId: 5 });

  assert.notEqual(keyPedido, keyServicio);
  assert.notEqual(keyPedido, keyOtherUser);

  saveOrderDraft({ user: userA, type: "PEDIDO", presetId: 5 }, {
    newOrder: { type: "PEDIDO", orderPresetId: 5, customerName: "Ana" },
    customFieldInputs: { 1: { valueText: "A" } },
  });

  saveOrderDraft({ user: userA, type: "SERVICIO", presetId: 5 }, {
    newOrder: { type: "SERVICIO", orderPresetId: 5, customerName: "Luis" },
    customFieldInputs: { 2: { valueText: "B" } },
  });

  assert.equal(loadOrderDraft<any, any>({ user: userA, type: "PEDIDO", presetId: 5 })?.newOrder.customerName, "Ana");
  assert.equal(loadOrderDraft<any, any>({ user: userA, type: "SERVICIO", presetId: 5 })?.newOrder.customerName, "Luis");
  assert.equal(loadOrderDraft<any, any>({ user: userB, type: "PEDIDO", presetId: 5 }), null);
});

test("limpiar el draft elimina solo la combinación activa", () => {
  setupBrowserLikeGlobals();
  const user = { id: 20, tenantId: 7 } as any;

  saveOrderDraft({ user, type: "ENCARGO", presetId: 1 }, {
    newOrder: { type: "ENCARGO", orderPresetId: 1 },
    customFieldInputs: { 1: { valueNumber: "100" } },
  });
  saveOrderDraft({ user, type: "TURNO", presetId: 1 }, {
    newOrder: { type: "TURNO", orderPresetId: 1 },
    customFieldInputs: { 2: { valueText: "2026-03-23" } },
  });

  clearOrderDraft({ user, type: "ENCARGO", presetId: 1 });

  assert.equal(loadOrderDraft<any, any>({ user, type: "ENCARGO", presetId: 1 }), null);
  assert.ok(loadOrderDraft<any, any>({ user, type: "TURNO", presetId: 1 }));
});
