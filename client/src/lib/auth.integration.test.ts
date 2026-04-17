import test from "node:test";
import assert from "node:assert/strict";

function setupBrowserLikeGlobals() {
  const storageFactory = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  };
  const localStorage = storageFactory();
  const sessionStorage = storageFactory();
  (globalThis as any).localStorage = localStorage;
  (globalThis as any).sessionStorage = sessionStorage;
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  (globalThis as any).window = {
    location: {
      pathname: "/app",
      assign: () => {},
    },
    dispatchEvent: () => true,
    setTimeout,
    clearTimeout,
  };
}

test("las rutas públicas de tracking quedan excluidas del redirect de auth", async () => {
  setupBrowserLikeGlobals();
  const { isPublicRoute, resetAuthForTests } = await import("./auth");
  resetAuthForTests();

  assert.equal(isPublicRoute("/tracking/public-link"), true);
  assert.equal(isPublicRoute("/t/demo/tos"), true);
  assert.equal(isPublicRoute("/legal/terms"), true);
  assert.equal(isPublicRoute("/app/orders"), false);
});
