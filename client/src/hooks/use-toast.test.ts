import test from "node:test";
import assert from "node:assert/strict";
import { reducer } from "./use-toast";

test("toast reducer deduplica notificaciones iguales", () => {
  const first = reducer(
    { toasts: [] },
    { type: "ADD_TOAST", toast: { id: "1", title: "Campo agregado", open: true } },
  );
  const second = reducer(
    first,
    { type: "ADD_TOAST", toast: { id: "2", title: "Campo agregado", open: true } },
  );

  assert.equal(second.toasts.length, 1);
  assert.equal(second.toasts[0]?.id, "2");
});

test("toast reducer cierra el toast al dismiss", () => {
  const state = reducer(
    { toasts: [{ id: "1", title: "Ok", open: true }] },
    { type: "DISMISS_TOAST", toastId: "1" },
  );

  assert.equal(state.toasts[0]?.open, false);
});
