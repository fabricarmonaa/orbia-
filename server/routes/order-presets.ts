import type { Express, Response } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import { orderPresetsStorage, ORDER_PRESET_ALLOWED_FILE_EXTENSIONS } from "../storage/order-presets";
import { HttpError } from "../lib/http-errors";

// ─────────────────────────────────────────────
// Params/body schemas
// ─────────────────────────────────────────────
const codeParamSchema = z.object({ code: z.string().min(1).max(50) });
const fieldIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const presetIdParamSchema = z.object({ presetId: z.coerce.number().int().positive() });
const presetIdAndCodeSchema = z.object({
  code: z.string().min(1).max(50),
  presetId: z.coerce.number().int().positive(),
});

const createPresetSchema = z.object({
  label: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(80).optional(),
});

const patchPresetSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Debe enviar al menos un campo" });

const createFieldSchema = z.object({
  label: z.string().trim().min(1).max(160),
  fieldType: z.enum(["TEXT", "NUMBER", "FILE"]),
  required: z.boolean().optional(),
  fieldKey: z.string().trim().min(1).max(80).optional(),
  config: z.record(z.any()).optional(),
  visibleInTracking: z.boolean().optional(),
});

const patchFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    required: z.boolean().optional(),
    config: z.record(z.any()).optional(),
    isActive: z.boolean().optional(),
    visibleInTracking: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Debe enviar al menos un campo" });

const reorderSchema = z.object({
  orderedFieldIds: z.array(z.coerce.number().int().positive()).min(1),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function sendApiError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.extra || {}) },
    });
  }
  if (process.env.DEBUG_API === "1") {
    console.error("[order-presets] unexpected", err);
  }
  return res
    .status(500)
    .json({ error: { code: "ORDER_PRESET_INTERNAL_ERROR", message: "Error inesperado" } });
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
export function registerOrderPresetRoutes(app: Express) {
  // ── Types ──────────────────────────────────────────────────────────────
  app.get("/api/order-presets/types", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const data = await orderPresetsStorage.listOrderTypes(req.auth!.tenantId!);
      return res.json({ data });
    } catch (err) {
      return sendApiError(res, err);
    }
  });

  // ── Presets by type ─────────────────────────────────────────────────────
  app.get(
    "/api/order-presets/types/:code/presets",
    tenantAuth,
    requireTenantAdmin,
    validateParams(codeParamSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.listPresetsByType(
          req.auth!.tenantId!,
          firstParam(req.params.code)
        );
        return res.json({ data: result.presets, type: result.type });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/types/:code/presets",
    tenantAuth,
    requireTenantAdmin,
    validateParams(codeParamSchema),
    validateBody(createPresetSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.createPreset(
          req.auth!.tenantId!,
          firstParam(req.params.code),
          req.body
        );
        return res.status(201).json({ data: result.preset, type: result.type });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.patch(
    "/api/order-presets/presets/:presetId",
    tenantAuth,
    requireTenantAdmin,
    validateParams(presetIdParamSchema),
    validateBody(patchPresetSchema),
    async (req, res) => {
      try {
        const saved = await orderPresetsStorage.updatePreset(
          req.auth!.tenantId!,
          Number(req.params.presetId),
          req.body
        );
        return res.json({ data: saved });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  // ── Fields by preset ────────────────────────────────────────────────────
  app.get(
    "/api/order-presets/presets/:presetId/fields",
    tenantAuth,
    requireTenantAdmin,
    validateParams(presetIdParamSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.listFieldsByPreset(
          req.auth!.tenantId!,
          Number(req.params.presetId)
        );
        return res.json({ data: result.fields, preset: result.preset });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/presets/:presetId/fields",
    tenantAuth,
    requireTenantAdmin,
    validateParams(presetIdParamSchema),
    validateBody(createFieldSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.createField(
          req.auth!.tenantId!,
          Number(req.params.presetId),
          req.body
        );
        return res.status(201).json({
          data: result.field,
          preset: result.preset,
          meta: { allowedFileExtensions: ORDER_PRESET_ALLOWED_FILE_EXTENSIONS },
        });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/presets/:presetId/fields/reorder",
    tenantAuth,
    requireTenantAdmin,
    validateParams(presetIdParamSchema),
    validateBody(reorderSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.reorderFields(
          req.auth!.tenantId!,
          Number(req.params.presetId),
          req.body.orderedFieldIds
        );
        return res.json({ data: result.fields, preset: result.preset });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  // ── Fields CRUD (existing, now with visibleInTracking support) ───────────
  app.patch(
    "/api/order-presets/fields/:id",
    tenantAuth,
    requireTenantAdmin,
    validateParams(fieldIdParamSchema),
    validateBody(patchFieldSchema),
    async (req, res) => {
      try {
        const saved = await orderPresetsStorage.updateField(
          req.auth!.tenantId!,
          Number(req.params.id),
          req.body
        );
        return res.json({ data: saved });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/fields/:id/deactivate",
    tenantAuth,
    requireTenantAdmin,
    validateParams(fieldIdParamSchema),
    async (req, res) => {
      try {
        const saved = await orderPresetsStorage.deactivateField(
          req.auth!.tenantId!,
          Number(req.params.id)
        );
        return res.json({ data: saved });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  // ── Legacy endpoints (backwards compat – keep for existing UI until migrated) ──
  app.get(
    "/api/order-presets/types/:code/fields",
    tenantAuth,
    requireTenantAdmin,
    validateParams(codeParamSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.listFieldsByType(
          req.auth!.tenantId!,
          firstParam(req.params.code)
        );
        return res.json({ data: result.fields, type: result.type, defaultPresetId: result.defaultPresetId });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/types/:code/fields",
    tenantAuth,
    requireTenantAdmin,
    validateParams(codeParamSchema),
    validateBody(createFieldSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.createFieldByTypeCode(
          req.auth!.tenantId!,
          firstParam(req.params.code),
          req.body
        );
        return res.status(201).json({
          data: result.field,
          preset: result.preset,
          meta: { allowedFileExtensions: ORDER_PRESET_ALLOWED_FILE_EXTENSIONS },
        });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );

  app.post(
    "/api/order-presets/types/:code/fields/reorder",
    tenantAuth,
    requireTenantAdmin,
    validateParams(codeParamSchema),
    validateBody(reorderSchema),
    async (req, res) => {
      try {
        const result = await orderPresetsStorage.reorderFieldsByTypeCode(
          req.auth!.tenantId!,
          firstParam(req.params.code),
          req.body.orderedFieldIds
        );
        return res.json({ data: result.fields });
      } catch (err) {
        return sendApiError(res, err);
      }
    }
  );
}
