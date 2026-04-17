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

test("no destruye sesión local cuando refresh falla por error transitorio", async () => {
  setupBrowserLikeGlobals();
  const calls: string[] = [];
  const auth = await import("./auth");
  auth.resetAuthForTests();
  auth.login("token-vigente", { id: 2, email: "maria@test.com", fullName: "Maria", role: "admin", tenantId: 7, isSuperAdmin: false, branchId: null });

  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    if (url === "/api/protected") {
      return { ok: false, status: 401, json: async () => ({ code: "AUTH_EXPIRED", error: "expirada" }) } as Response;
    }
    if (url === "/api/auth/refresh") {
      throw new Error("network-down");
    }
    throw new Error("unexpected");
  };

  const response = await auth.authFetch("/api/protected");
  assert.equal(response.status, 401);
  assert.equal(auth.getToken(), "token-vigente");
  assert.equal(auth.getUser()?.email, "maria@test.com");
  assert.deepEqual(calls, ["/api/protected", "/api/auth/refresh"]);
});

test("authFetch reintenta request luego de refresh exitoso", async () => {
  setupBrowserLikeGlobals();
  const auth = await import("./auth");
  auth.resetAuthForTests();
  auth.login("token-inicial", { id: 3, email: "leo@test.com", fullName: "Leo", role: "admin", tenantId: 9, isSuperAdmin: false, branchId: null });

  let protectedCalls = 0;
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    if (url === "/api/protected") {
      protectedCalls += 1;
      const authHeader = (init?.headers as Record<string, string>)?.Authorization || "";
      if (protectedCalls === 1) {
        assert.equal(authHeader, "Bearer token-inicial");
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_EXPIRED", error: "expirada" }) } as Response;
      }
      assert.equal(authHeader, "Bearer token-renovado");
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }
    if (url === "/api/auth/refresh") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          token: "token-renovado",
          user: { id: 3, email: "leo@test.com", fullName: "Leo", role: "admin", tenantId: 9, isSuperAdmin: false, branchId: null },
          session: { rememberDevice: true },
        }),
      } as Response;
    }
    throw new Error("unexpected");
  };

  const response = await auth.authFetch("/api/protected");
  assert.equal(response.ok, true);
  assert.equal(protectedCalls, 2);
  assert.equal(auth.getToken(), "token-renovado");
});
