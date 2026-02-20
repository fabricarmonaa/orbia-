import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("server/auth.ts", "utf8");
assert.equal(auth.includes('requirePlanCodes(["PROFESIONAL", "ESCALA"])'), true);
assert.equal(auth.includes("export function requireRoleAny"), true);

const cashierRoutes = fs.readFileSync("server/routes/cashiers.ts", "utf8");
assert.equal(cashierRoutes.includes('"/api/cashiers/login"'), true);
assert.equal(cashierRoutes.includes("comparePassword(pin"), true);
assert.equal(cashierRoutes.includes("role: \"CASHIER\""), true);

const salesRoutes = fs.readFileSync("server/routes/sales.ts", "utf8");
assert.equal(salesRoutes.includes("requireRoleAny([\"admin\", \"staff\", \"CASHIER\"])"), true);
assert.equal(salesRoutes.includes("cashierProfile?.name"), true);

const sidebar = fs.readFileSync("client/src/components/app-sidebar.tsx", "utf8");
assert.equal(sidebar.includes('user?.role !== "CASHIER" || ["/app/pos", "/app/sales"]'), true);

console.log("Cashier module checks passed");
