import type { NextFunction, Request, Response } from "express";
import { storage } from "../storage";

export function requireAddon(addonCode: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        return res.status(403).json({ error: "Acceso denegado", code: "TENANT_REQUIRED" });
      }

      const addon = await storage.getTenantAddon(tenantId, addonCode);
      if (!addon?.enabled) {
        return res.status(403).json({
          error: "Este addon no está habilitado para tu negocio",
          code: "ADDON_NOT_ENABLED",
          addon: addonCode,
        });
      }

      return next();
    } catch (err) {
      console.error("[addons] ADDON_GATE_ERROR", err);
      return res.status(500).json({ error: "No se pudo verificar addon", code: "ADDON_GATE_ERROR" });
    }
  };
}
