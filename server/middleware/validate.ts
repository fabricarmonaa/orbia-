import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";
import { ZodError } from "zod";

function formatError(err: ZodError) {
  return err.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeQueryInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) {
      const first = raw.find((it) => it !== undefined && it !== null && String(it).length > 0);
      normalized[key] = first ?? raw[0] ?? "";
      continue;
    }
    normalized[key] = raw;
  }
  return normalized;
}

function validatePart(schema: ZodTypeAny, source: "body" | "query" | "params") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = source === "query" ? normalizeQueryInput((req as any)[source]) : (req as any)[source];
      const parsed = schema.parse(input);
      if (source === "query" && isRecord(req.query) && isRecord(parsed)) {
        const queryRef = req.query;
        for (const key of Object.keys(queryRef)) {
          delete queryRef[key];
        }
        Object.assign(queryRef, parsed);
      } else if (source === "query" && (parsed === null || parsed === undefined)) {
        // Express 5 exposes req.query as getter-only in this stack; keep original ref untouched.
        // We only clear/assign when parsed is an object.
      } else {
        (req as any)[source] = parsed;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Datos inválidos",
          code: "VALIDATION_ERROR",
          source,
          details: formatError(err),
        });
      }
      next(err);
    }
  };
}

export const validateBody = (schema: ZodTypeAny) => validatePart(schema, "body");
export const validateQuery = (schema: ZodTypeAny) => validatePart(schema, "query");
export const validateParams = (schema: ZodTypeAny) => validatePart(schema, "params");
