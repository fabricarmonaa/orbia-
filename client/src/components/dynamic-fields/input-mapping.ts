export function mapFieldTypeToInputKind(type: string) {
  const normalized = String(type || "").toUpperCase();
  if (["TEXT", "TEXTAREA", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT", "MONEY", "FILE"].includes(normalized)) {
    return normalized;
  }
  return "TEXT";
}
