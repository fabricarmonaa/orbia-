export type AuditSeverity = "info" | "warning" | "error";

export const auditCatalog: Record<string, { title: string; description: string; severity: AuditSeverity; category: string }> = {
  password_change_success: {
    title: "Contraseña actualizada",
    description: "El usuario cambió su contraseña.",
    severity: "info",
    category: "auth",
  },
  password_change_fail_policy: {
    title: "Cambio de contraseña rechazado",
    description: "La nueva contraseña no cumple la política de seguridad.",
    severity: "warning",
    category: "auth",
  },
  logout: {
    title: "Cierre de sesión",
    description: "La sesión se cerró correctamente.",
    severity: "info",
    category: "auth",
  },
  account_delete_success: {
    title: "Cuenta eliminada",
    description: "La cuenta se marcó como eliminada y se cerró la sesión.",
    severity: "warning",
    category: "account",
  },
};

export function resolveAuditEvent(action: string, entityType: string) {
  const key = String(action || "").toLowerCase();
  return auditCatalog[key] || {
    title: "Evento del sistema",
    description: "Se registró una acción en la auditoría.",
    severity: "info" as const,
    category: String(entityType || "general").toLowerCase(),
  };
}
