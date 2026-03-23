import test from "node:test";
import assert from "node:assert/strict";
import { countUserManagedBranches, findBranchNameConflict, isSystemCentralBranchName, isSystemManagedBranch } from "./branches";

test("reconoce sucursal principal del sistema aunque sea legacy por nombre", () => {
  assert.equal(isSystemCentralBranchName("Casa Central"), true);
  assert.equal(isSystemManagedBranch({ name: "Sucursal Central", isSystem: false }), true);
});

test("el límite de sucursales cuenta solo sucursales de usuario", () => {
  const branches = [
    { id: 1, name: "Casa Central", isSystem: true },
    { id: 2, name: "Sucursal Norte", isSystem: false },
  ];

  assert.equal(countUserManagedBranches(branches), 1);
});

test("detecta conflictos reales por nombre dentro del tenant", () => {
  const conflict = findBranchNameConflict([
    { id: 1, name: "Sucursal Norte", isSystem: false },
  ], "  sucursal   norte ");

  assert.equal(conflict?.id, 1);
});
