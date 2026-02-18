import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { parseApiError } from "@/lib/api-errors";
import { getToken, handleUnauthorizedCode } from "@/lib/auth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const info = await parseApiError(res);
    if (res.status === 401) {
      handleUnauthorizedCode(info.code);
    }
    throw new Error(info.message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      headers,
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      const info = await parseApiError(res);
      handleUnauthorizedCode(info.code);
      return null as any;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error: any) => {
        if ((error?.message || "").toLowerCase().includes("sesión")) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
