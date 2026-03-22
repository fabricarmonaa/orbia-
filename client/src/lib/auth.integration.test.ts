import test from "node:test";
import assert from "node:assert/strict";
import { ensureDom, resetDom } from "@/test/test-dom";

test("las rutas públicas de tracking quedan excluidas del redirect de auth", async () => {
  ensureDom();
  resetDom();

  const { isPublicRoute } = await import("./auth");

  assert.equal(isPublicRoute("/tracking/public-link"), true);
  assert.equal(isPublicRoute("/t/demo/tos"), true);
  assert.equal(isPublicRoute("/legal/terms"), true);
  assert.equal(isPublicRoute("/app/orders"), false);
});
