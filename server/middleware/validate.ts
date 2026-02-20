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

function validatePart(schema: ZodTypeAny, source: "body" | "query" | "params") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      (req as any)[source] = schema.parse((req as any)[source]);
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
