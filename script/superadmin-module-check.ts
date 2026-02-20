import { strict as assert } from "assert";
import fs from "fs";

const superRoutes = fs.readFileSync("server/routes/super.ts", "utf8");
const authRoutes = fs.readFileSync("server/routes/auth.ts", "utf8");
const authCore = fs.readFileSync("server/auth.ts", "utf8");

assert.equal(superRoutes.includes('/api/super/plans/:code'), true);
assert.equal(superRoutes.includes('/api/super/subscriptions'), true);
assert.equal(superRoutes.includes('/api/super/transfer-info'), true);
assert.equal(authRoutes.includes('SUPERADMIN_ROOT_REQUIRED'), true);
assert.equal(authCore.includes('requirePlanFeature(featureKey: string)'), true);

console.log('Superadmin module checks passed');
