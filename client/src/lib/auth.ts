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
}

type LogoutReason = "manual" | "expired" | "invalid" | "required" | "offline" | "forced";

let currentUser: AuthUser | null = null;
let currentToken: string | null = null;
const listeners = new Set<() => void>();
const sessionCleanupHandlers = new Set<() => void>();
const activeAbortControllers = new Set<AbortController>();
let logoutPromise: Promise<void> | null = null;
let unauthorizedHandled = false;

function notifyListeners() {
  listeners.forEach((l) => l());
}

function loadFromStorage() {
  const token = localStorage.getItem("orbia_token");
  const userStr = localStorage.getItem("orbia_user");
  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      currentToken = token;
    } catch {
      currentUser = null;
      currentToken = null;
    }
  }
}

function clearAuthState() {
  localStorage.removeItem("orbia_token");
  localStorage.removeItem("orbia_user");
  currentUser = null;
  currentToken = null;
  notifyListeners();
}

function normalizeLogoutReason(reason?: string): LogoutReason {
  if (reason === "expired" || reason === "invalid" || reason === "required" || reason === "offline" || reason === "forced") {
    return reason;
  }
  return "manual";
}

function reasonMessage(reason: LogoutReason) {
  if (reason === "expired") return "Sesión expirada. Iniciá sesión nuevamente.";
  if (reason === "invalid") return "Tu sesión no es válida. Iniciá sesión nuevamente.";
  if (reason === "offline") return "Se perdió la conexión. Volvé a iniciar sesión cuando recuperes internet.";
  return "Sesión finalizada.";
}

loadFromStorage();

export function login(token: string, user: AuthUser) {
  localStorage.setItem("orbia_token", token);
  localStorage.setItem("orbia_user", JSON.stringify(user));
  currentUser = user;
  currentToken = token;
  unauthorizedHandled = false;
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

export async function gracefulLogout(reason: LogoutReason = "manual") {
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    const token = currentToken;
    stopSessionActivity();

    try {
      if (token && navigator.onLine) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
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

    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.assign("/login");
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
  if (unauthorizedHandled) return;
  const normalizedCode = (code || "").toUpperCase();
  if (!["AUTH_EXPIRED", "AUTH_INVALID", "AUTH_REQUIRED", "TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_REQUIRED"].includes(normalizedCode)) return;
  unauthorizedHandled = true;
  const reason = (normalizedCode === "AUTH_EXPIRED" || normalizedCode === "TOKEN_EXPIRED")
    ? "expired"
    : (normalizedCode === "AUTH_INVALID" || normalizedCode === "TOKEN_INVALID")
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

export function updateCurrentUser(partial: Partial<AuthUser>) {
  if (!currentUser) return;
  currentUser = { ...currentUser, ...partial };
  localStorage.setItem("orbia_user", JSON.stringify(currentUser));
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
        isAuthenticated: !!currentToken && !!currentUser,
      });
    });
    return unsub;
  }, [subscribe]);

  return { ...state, login, logout };
}

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number; skipAuthHandling?: boolean }
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Sin conexión a internet. Revisá tu red e intentá de nuevo.");
  }

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const controller = options?.signal ? null : createSessionAbortController();
  const signal = options?.signal || controller?.signal;
  const timeoutMs = options?.timeoutMs ?? 0;
  const timeout = timeoutMs > 0 && controller
    ? window.setTimeout(() => controller.abort("request_timeout"), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });

    if (!res.ok) {
      const info = await parseApiError(res);
      if (!options?.skipAuthHandling && res.status === 401) {
        handleUnauthorizedCode(info.code);
      }
      throw new Error(info.message);
    }

    return res;
  } finally {
    if (timeout) window.clearTimeout(timeout);
    if (controller) unregisterSessionAbortController(controller);
  }
}
