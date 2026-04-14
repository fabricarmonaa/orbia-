import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { resolveAttachmentAbsolutePath } from "./attachment-paths";

const storageRoot = path.join(process.cwd(), "storage");

test("resuelve storagePath actual y fallback legacy por tenant/order/storedName", () => {
  const tenantCode = "demo_legacy";
  const orderId = 991;
  const currentDir = path.join(storageRoot, "tenants", tenantCode, "orders", String(orderId));
  fs.mkdirSync(currentDir, { recursive: true });

  const storedName = "legacy-file.pdf";
  const legacyPath = path.join(currentDir, storedName);
  fs.writeFileSync(legacyPath, "ok");

  const resolvedFallback = resolveAttachmentAbsolutePath({
    storagePath: `old/path/missing-${Date.now()}.pdf`,
    storedName,
    tenantCode,
    orderId,
  });
  assert.equal(resolvedFallback, legacyPath);

  const resolvedCurrent = resolveAttachmentAbsolutePath({
    storagePath: path.relative(storageRoot, legacyPath),
    storedName,
    tenantCode,
    orderId,
  });
  assert.equal(resolvedCurrent, legacyPath);

  fs.unlinkSync(legacyPath);
});
