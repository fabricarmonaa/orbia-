export type AiErrorCode = "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_BAD_RESPONSE";

export class AiClientError extends Error {
  code: AiErrorCode;
  details?: unknown;
  constructor(code: AiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AiClientError";
    this.code = code;
    this.details = details;
  }
}

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "").replace(/\/$/, "");
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || "30000");

export function getAiServiceUrl() {
  return AI_SERVICE_URL;
}

function extractAiErrorMessage(body: any, fallback: string) {
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.detail === "string") return body.detail;
  if (body?.detail && typeof body.detail === "object") {
    if (typeof body.detail.error === "string") return body.detail.error;
    if (typeof body.detail.message === "string") return body.detail.message;
  }
  return fallback;
}

async function fetchWithTimeout(path: string, init: RequestInit) {
  if (!AI_SERVICE_URL) {
    throw new AiClientError("AI_UNAVAILABLE", "AI_SERVICE_URL not configured");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, { ...init, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiClientError("AI_TIMEOUT", "AI service timeout");
    }
    throw new AiClientError("AI_UNAVAILABLE", "AI service unavailable", { message: err?.message });
  } finally {
    clearTimeout(timeout);
  }
}

export async function aiGetJson(path: string, headers?: Record<string, string>) {
  const res = await fetchWithTimeout(path, { method: "GET", headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AiClientError("AI_BAD_RESPONSE", extractAiErrorMessage(body, `AI GET ${path} failed`), { status: res.status, body });
  }
  return body;
}

export async function aiPostForm(path: string, form: FormData, headers?: Record<string, string>) {
  const res = await fetchWithTimeout(path, { method: "POST", body: form, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new AiClientError("AI_BAD_RESPONSE", extractAiErrorMessage(body, `AI POST ${path} failed`), { status: res.status, body });
  }
  return body;
}
