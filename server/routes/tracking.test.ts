import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicTrackingAttachmentUrl, isTrackingAttachmentVisible } from "./tracking.helpers";

test("tracking público genera URLs públicas de preview y descarga sin auth interna", () => {
  assert.equal(
    buildPublicTrackingAttachmentUrl("trk_123", 44),
    "/api/public/tracking/trk_123/attachments/44",
  );
  assert.equal(
    buildPublicTrackingAttachmentUrl("trk_123", 44, { download: true }),
    "/api/public/tracking/trk_123/attachments/44?download=1",
  );
});

test("tracking público solo expone adjuntos visibles del pedido correcto", () => {
  const fields = [
    { fileStorageKey: "att:44", visibleOverride: null, visibleInTracking: true },
    { fileStorageKey: "atts:45,46", visibleOverride: true, visibleInTracking: false },
    { fileStorageKey: "att:99", visibleOverride: false, visibleInTracking: true },
  ];

  assert.equal(isTrackingAttachmentVisible(fields, 44), true);
  assert.equal(isTrackingAttachmentVisible(fields, 45), true);
  assert.equal(isTrackingAttachmentVisible(fields, 46), true);
  assert.equal(isTrackingAttachmentVisible(fields, 99), false);
  assert.equal(isTrackingAttachmentVisible(fields, 777), false);
});
