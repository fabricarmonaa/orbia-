import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("el modal de creación ya no incluye el copy técnico eliminado", () => {
  const filePath = path.resolve(process.cwd(), "client/src/pages/app/orders.tsx");
  const source = fs.readFileSync(filePath, "utf8");

  assert.doesNotMatch(source, /El formulario respeta tipo, preset, orden, active\/inactive, deletedAt y visibleInForm\./);
});
