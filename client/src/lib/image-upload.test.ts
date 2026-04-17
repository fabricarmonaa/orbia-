import test from "node:test";
import assert from "node:assert/strict";
import { computeResizedDimensions } from "./image-upload";

test("computeResizedDimensions mantiene proporción sin exceder el edge máximo", () => {
  assert.deepEqual(computeResizedDimensions(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(computeResizedDimensions(1200, 2400, 1920), { width: 960, height: 1920 });
  assert.deepEqual(computeResizedDimensions(800, 600, 1920), { width: 800, height: 600 });
});
