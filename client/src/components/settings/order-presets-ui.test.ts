import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPresetDeleteRequest,
  buildPresetFieldsRequest,
  buildPresetListRequest,
  canCreateMoreOrderPresets,
  getActiveOrderPresets,
  getEmptyOrderPresetFieldForm,
  pickVisibleTrackingDefault,
} from "./order-presets-ui";

test("al borrar un preset custom deja de contar para el límite y desaparece de los activos", () => {
  const beforeDelete = [
    { id: 1, code: "default", label: "Default", isActive: true, sortOrder: 0 },
    { id: 2, code: "express", label: "Express", isActive: true, sortOrder: 1 },
    { id: 3, code: "garantia", label: "Garantía", isActive: true, sortOrder: 2 },
    { id: 4, code: "vip", label: "VIP", isActive: true, sortOrder: 3 },
    { id: 5, code: "outlet", label: "Outlet", isActive: true, sortOrder: 4 },
  ];
  const afterDelete = beforeDelete.filter((preset) => preset.id !== 5);

  assert.equal(canCreateMoreOrderPresets(beforeDelete), false);
  assert.equal(canCreateMoreOrderPresets(afterDelete), true);
  assert.deepEqual(getActiveOrderPresets(afterDelete).map((preset) => preset.id), [1, 2, 3, 4]);
});

test("los campos nuevos arrancan visibles en tracking por defecto", () => {
  assert.equal(getEmptyOrderPresetFieldForm().visibleInTracking, true);
  assert.equal(pickVisibleTrackingDefault(undefined), true);
  assert.equal(pickVisibleTrackingDefault(null), true);
  assert.equal(pickVisibleTrackingDefault(false), false);
});

test("las requests reales de presets usan endpoint correcto y cache-buster", () => {
  assert.deepEqual(buildPresetDeleteRequest(27), {
    method: "DELETE",
    url: "/api/order-presets/presets/27",
  });
  assert.equal(
    buildPresetListRequest("PEDIDO", 123),
    "/api/order-presets/types/PEDIDO/presets?_=123",
  );
  assert.equal(
    buildPresetFieldsRequest(99, { includeInactive: true, nonce: 456 }),
    "/api/order-presets/presets/99/fields?includeInactive=1&_=456",
  );
});
