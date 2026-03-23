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

test("rehidrata la sesión desde /api/auth/session y persiste metadata de remember device", async () => {
  setupBrowserLikeGlobals();
  const fetchCalls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    fetchCalls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token: "token-rehidratado",
        user: { id: 1, email: "ana@test.com", fullName: "Ana", role: "admin", tenantId: 5, isSuperAdmin: false, branchId: null },
        session: { rememberDevice: true, expiresAt: "2026-05-01T00:00:00.000Z" },
      }),
    } as Response;
  };

  const auth = await import("./auth");
  auth.resetAuthForTests();
  const ok = await auth.rehydrateSession();

  assert.equal(ok, true);
  assert.equal(auth.getToken(), "token-rehidratado");
  assert.equal(auth.getUser()?.email, "ana@test.com");
  assert.equal(auth.getSessionMeta()?.rememberDevice, true);
  assert.deepEqual(fetchCalls, ["/api/auth/session"]);
});
