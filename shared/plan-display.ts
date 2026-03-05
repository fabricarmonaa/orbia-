const PLAN_DISPLAY_NAMES: Record<string, string> = {
  ECONOMICO: "Económico",
  PROFESIONAL: "Profesional",
  ESCALA: "PyMe",
};

export function getPlanDisplayName(planCode?: string | null, fallbackName?: string | null) {
  const key = String(planCode || "").trim().toUpperCase();
  if (PLAN_DISPLAY_NAMES[key]) return PLAN_DISPLAY_NAMES[key];
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  return key || "Plan";
}

