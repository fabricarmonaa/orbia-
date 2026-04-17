import { useState, useEffect, useCallback } from "react";
import { parseApiError } from "@/lib/api-errors";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  tenantId: number | null;
  isSuperAdmin: boolean;
  branchId: number | null;
  avatarUrl?: string | null;
  subscriptionWarning?: string | null;
  cashierId?: number | null;
  passwordWeak?: boolean;
  scope?: string | null;
}

type LogoutReason = "manual" | "expired" | "invalid" | "required" | "offline" | "forced";

type AuthSessionMeta = {
  rememberDevice?: boolean;
  expiresAt?: string | null;
  rehydratedAt?: string | null;
};

const TOKEN_STORAGE_KEY = "orbia_token";
const USER_STORAGE_KEY = "orbia_user";
const SESSION_META_STORAGE_KEY = "orbia_session_meta";

let currentUser: AuthUser | null = null;
let currentToken: string | null = null;
let currentSessionMeta: AuthSessionMeta | null = null;
const listeners = new Set<() => void>();
const sessionCleanupHandlers = new Set<() => void>();
const activeAbortControllers = new Set<AbortController>();
let logoutPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;
let rehydratePromise: Promise<boolean> | null = null;
let unauthorizedHandled = false;

const TERMINAL_REFRESH_CODES = new Set([
  "AUTH_REFRESH_REQUIRED",
  "AUTH_REFRESH_EXPIRED",
  "AUTH_REFRESH_REVOKED",
  "AUTH_INVALID",
  "TOKEN_INVALID",
  "TOKEN_REQUIRED",
  "AUTH_REQUIRED",
]);

function notifyListeners() {
  listeners.forEach((l) => l());
}

function persistAuthState() {
  if (currentToken && currentUser) {
    localStorage.setItem(TOKEN_STORAGE_KEY, currentToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
    if (currentSessionMeta) {
      localStorage.setItem(SESSION_META_STORAGE_KEY, JSON.stringify(currentSessionMeta));
    }
  }
}

function loadFromStorage() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const userStr = localStorage.getItem(USER_STORAGE_KEY);
  const sessionMetaStr = localStorage.getItem(SESSION_META_STORAGE_KEY);
  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      currentToken = token;
      currentSessionMeta = sessionMetaStr ? JSON.parse(sessionMetaStr) : null;
    } catch {
      currentUser = null;
      currentToken = null;
      currentSessionMeta = null;
    }
  }
}

function clearAuthState() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(SESSION_META_STORAGE_KEY);
  currentUser = null;
  currentToken = null;
  currentSessionMeta = null;
  notifyListeners();
}

function reasonMessage(reason: LogoutReason) {
  if (reason === "expired") return "Sesión expirada. Iniciá sesión nuevamente.";
  if (reason === "invalid") return "Tu sesión no es válida. Iniciá sesión nuevamente.";
  if (reason === "offline") return "Se perdió la conexión. Volvé a iniciar sesión cuando recuperes internet.";
  return "Sesión finalizada.";
}

function isTerminalRefreshResponse(status: number, code?: string | null) {
  if (status !== 401) return false;
  const normalizedCode = String(code || "").toUpperCase();
  return TERMINAL_REFRESH_CODES.has(normalizedCode);
}

export function isPublicRoute(pathname: string) {
  return pathname.startsWith("/tracking/")
    || pathname.startsWith("/t/")
    || pathname.startsWith("/legal/")
    || pathname === "/legal/terms"
    || pathname === "/legal/privacy";
}

loadFromStorage();

export function login(token: string, user: AuthUser, sessionMeta?: AuthSessionMeta | null) {
  currentToken = token;
  currentUser = user;
  currentSessionMeta = sessionMeta || currentSessionMeta || null;
  unauthorizedHandled = false;
  persistAuthState();
  notifyListeners();
}

export function registerSessionCleanup(handler: () => void) {
  sessionCleanupHandlers.add(handler);
  return () => {
    sessionCleanupHandlers.delete(handler);
  };
}

export function createSessionAbortController() {
  const controller = new AbortController();
  activeAbortControllers.add(controller);
  controller.signal.addEventListener(
    "abort",
    () => {
      activeAbortControllers.delete(controller);
    },
    { once: true }
  );
  return controller;
}

export function unregisterSessionAbortController(controller: AbortController) {
  activeAbortControllers.delete(controller);
}

export function stopSessionActivity() {
  for (const cleanup of Array.from(sessionCleanupHandlers)) {
    try {
      cleanup();
    } catch {
      // cleanup best-effort
    }
  }
  for (const controller of Array.from(activeAbortControllers)) {
    try {
      controller.abort("session_shutdown");
    } catch {
      // abort best-effort
    }
    activeAbortControllers.delete(controller);
  }
}

async function requestSessionRefresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) {
        const payload = await parseApiError(res).catch(() => ({ code: undefined } as { code?: string }));
        if (isTerminalRefreshResponse(res.status, payload.code)) {
          clearAuthState();
        }
        return false;
      }
      const payload = await res.json();
      login(payload.token, payload.user, payload.session || null);
      return true;
    } catch {
      // Error transitorio de red: no destruimos sesión local.
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function rehydrateSession() {
  if (currentToken && currentUser) return true;
  if (rehydratePromise) return rehydratePromise;
  rehydratePromise = (async () => {
    try {
      const res = await fetch("/api/auth/session", { method: "GET" });
      if (res.status === 204) return false;
      if (!res.ok) return false;
      const payload = await res.json();
      login(payload.token, payload.user, {
        ...(payload.session || {}),
        rehydratedAt: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    } finally {
      rehydratePromise = null;
    }
  })();
  return rehydratePromise;
}

export async function gracefulLogout(reason: LogoutReason = "manual") {
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    const token = currentToken;
    stopSessionActivity();

    try {
      if (navigator.onLine) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
            keepalive: true,
          });
        } catch {
          // server notification is best-effort
        } finally {
          window.clearTimeout(timeout);
        }
      }
    } catch {
      // noop
    }

    clearAuthState();
    unauthorizedHandled = false;

    try {
      const [{ queryClient }, { clearPlanCache }] = await Promise.all([
        import("@/lib/queryClient"),
        import("@/lib/plan"),
      ]);
      await queryClient.cancelQueries();
      queryClient.clear();
      clearPlanCache();
    } catch {
      // noop
    }

    const message = reasonMessage(reason);
    try {
      sessionStorage.setItem("orbia_logout_message", message);
      window.dispatchEvent(new CustomEvent("orbia:logout", { detail: { reason, message } }));
    } catch {
      // noop
    }

    if (typeof window !== "undefined" && !window.location.pathname.includes("/login") && !isPublicRoute(window.location.pathname)) {
      const path = window.location.pathname;
      if (path.startsWith("/owner") || path.startsWith("/super")) {
        window.location.assign("/owner/login");
      } else if (path.startsWith("/delivery")) {
        window.location.assign("/delivery/login");
      } else {
        window.location.assign("/login");
      }
    }
  })().finally(() => {
    logoutPromise = null;
  });

  return logoutPromise;
}

export function logout(reason: LogoutReason = "manual") {
  void gracefulLogout(reason);
}

export function handleUnauthorizedCode(code?: string) {
  const normalizedCode = (code || "").toUpperCase();
  if (!["AUTH_EXPIRED", "AUTH_INVALID", "AUTH_REQUIRED", "TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_REQUIRED", "AUTH_REFRESH_REQUIRED", "AUTH_REFRESH_EXPIRED", "AUTH_REFRESH_REVOKED"].includes(normalizedCode)) return;
  if (unauthorizedHandled) return;
  unauthorizedHandled = true;
  const reason = (normalizedCode === "AUTH_EXPIRED" || normalizedCode === "TOKEN_EXPIRED" || normalizedCode === "AUTH_REFRESH_EXPIRED")
    ? "expired"
    : (normalizedCode === "AUTH_INVALID" || normalizedCode === "TOKEN_INVALID" || normalizedCode === "AUTH_REFRESH_REVOKED")
      ? "invalid"
      : "required";
  void gracefulLogout(reason);
}

export function getToken(): string | null {
  return currentToken;
}

export function getUser(): AuthUser | null {
  return currentUser;
}

export function getSessionMeta() {
  return currentSessionMeta;
}

export function resetAuthForTests() {
  currentUser = null;
  currentToken = null;
  currentSessionMeta = null;
  unauthorizedHandled = false;
  refreshPromise = null;
  rehydratePromise = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(SESSION_META_STORAGE_KEY);
}

export function updateCurrentUser(partial: Partial<AuthUser>) {
  if (!currentUser) return;
  currentUser = { ...currentUser, ...partial };
  persistAuthState();
  notifyListeners();
}

export function useAuth() {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const getSnapshot = useCallback(
    () => ({
      user: currentUser,
      token: currentToken,
      session: currentSessionMeta,
      isAuthenticated: !!currentToken && !!currentUser,
    }),
    []
  );

  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    const unsub = subscribe(() => {
      setState({
        user: currentUser,
        token: currentToken,
        session: currentSessionMeta,
        isAuthenticated: !!currentToken && !!currentUser,
      });
    });
    void rehydrateSession().then(() => {
      setState({
        user: currentUser,
        token: currentToken,
        session: currentSessionMeta,
        isAuthenticated: !!currentToken && !!currentUser,
      });
    });
    return unsub;
  }, [subscribe]);

  return { ...state, login, logout, rehydrateSession };
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  await rehydrateSession();

  const makeRequest = () => {
    const token = getToken();
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }
    return fetch(url, { ...options, headers });
  };

  let response = await makeRequest();
  if (response.status === 401) {
    const refreshed = await requestSessionRefresh();
    if (refreshed) {
      response = await makeRequest();
    }
  }
  return response;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number; skipAuthHandling?: boolean; retryOnAuth?: boolean }
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Sin conexión a internet. Revisá tu red e intentá de nuevo.");
  }

  await rehydrateSession();

  const controller = options?.signal ? null : createSessionAbortController();
  const signal = options?.signal || controller?.signal;
  const timeoutMs = options?.timeoutMs ?? 0;
  const timeout = timeoutMs > 0 && controller
    ? window.setTimeout(() => controller.abort("request_timeout"), timeoutMs)
    : null;

  try {
    const makeRequest = async () => {
      const headers: Record<string, string> = {};
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (data && !(data instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }
      return fetch(url, {
        method,
        headers,
        body: data ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
        signal,
      });
    };

    let res = await makeRequest();
    if (res.status === 401 && options?.skipAuthHandling !== true && options?.retryOnAuth !== false) {
      const refreshed = await requestSessionRefresh();
      if (refreshed) {
        res = await makeRequest();
      }
    }

    if (!res.ok) {
      const info = await parseApiError(res);
      if (!options?.skipAuthHandling && res.status === 401) {
        handleUnauthorizedCode(info.code);
      }
      throw new Error(info.message);
    }

    unauthorizedHandled = false;
    return res;
  } finally {
    if (timeout) window.clearTimeout(timeout);
    if (controller) unregisterSessionAbortController(controller);
  }
}
