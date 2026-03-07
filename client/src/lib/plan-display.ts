export function getPlanDisplayName(planCode?: string | null, fallbackName?: string | null) {
  const code = String(planCode || "").toUpperCase();
  if (code === "ECONOMICO") return "Económico";
  if (code === "PROFESIONAL") return "Profesional";
  if (code === "ESCALA") return "PyMe";
  return fallbackName || code || "Plan";
}
