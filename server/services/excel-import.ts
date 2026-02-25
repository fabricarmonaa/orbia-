import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type ImportEntity = "purchases" | "customers";

export interface PreviewRow {
  raw: Record<string, string>;
  normalized: Record<string, string | number | null>;
  errors: string[];
}

export interface PreviewResult {
  detectedHeaders: string[];
  suggestedMapping: Record<string, string>;
  extraColumns: string[];
  rowsPreview: PreviewRow[];
  warnings: string[];
}

const purchaseAliases: Record<string, string[]> = {
  code: ["codigo", "code", "sku", "id", "cod_producto"],
  name: ["nombre", "producto", "descripcion", "name", "nombre_producto", "nombreproducto", "articulo"],
  quantity: ["cantidad", "qty", "cant", "unidades"],
  unit_price: ["precio", "precio_unit", "unit_price", "costo", "cost", "precio_por_unidad"],
  currency: ["moneda", "currency", "divisa"],
  supplier_name: ["proveedor", "supplier", "vendedor", "distribuidor"],
  notes: ["notas", "observaciones", "detalle"],
};

const customerAliases: Record<string, string[]> = {
  name: ["nombre", "razon_social", "cliente"],
  phone: ["telefono", "celular", "whatsapp"],
  email: ["mail", "email", "correo"],
  doc: ["dni", "cuit", "documento"],
  address: ["direccion", "domicilio"],
  notes: ["nota", "observacion"],
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseSharedStrings(xml: string): string[] {
  const entries = xml.match(/<si[\s\S]*?<\/si>/g) || [];
  return entries.map((entry) => {
    const textNodes = entry.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
    const text = textNodes
      .map((node) => node.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, ""))
      .join("");
    return decodeXmlEntities(text);
  });
}

function colToIndex(ref: string): number {
  const letters = ref.replace(/\d/g, "");
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(n - 1, 0);
}

function extractCellValue(cellXml: string, sharedStrings: string[]): string {
  const tMatch = cellXml.match(/\st="([^"]+)"/);
  const type = tMatch?.[1] || "n";
  if (type === "inlineStr") {
    const t = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "";
    return decodeXmlEntities(t);
  }
  const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
  if (type === "s") {
    return sharedStrings[Number(value)] || "";
  }
  return decodeXmlEntities(value);
}

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows = xml.match(/<row[\s\S]*?<\/row>/g) || [];
  const matrix: string[][] = [];
  for (const rowXml of rows) {
    const cells = rowXml.match(/<c[\s\S]*?<\/c>/g) || [];
    const row: string[] = [];
    for (const cellXml of cells) {
      const ref = cellXml.match(/\sr="([A-Z]+\d+)"/)?.[1] || "A1";
      row[colToIndex(ref)] = extractCellValue(cellXml, sharedStrings);
    }
    matrix.push(row.map((x) => (x ?? "").trim()));
  }
  return matrix;
}

function unzipEntry(filePath: string, entryPath: string): string {
  return execFileSync("unzip", ["-p", filePath, entryPath], { encoding: "utf8" });
}

function findFirstSheetPath(filePath: string): string {
  const entries = execFileSync("unzip", ["-Z1", filePath], { encoding: "utf8" })
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const sheet = entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry));
  if (!sheet) throw new Error("IMPORT_XLSX_INVALID");
  return sheet;
}

function safeText(value: unknown, max: number): string {
  const cleaned = sanitizeLongText(String(value || ""), max);
  const trimmed = cleaned.trim();
  if (!trimmed) return "";
  const first = trimmed[0];
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `'${trimmed}`;
  }
  return trimmed;
}

function pickSuggestedMapping(headers: string[], aliases: Record<string, string[]>) {
  const mapping: Record<string, string> = {};
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    const hit = headers.find((h) => fieldAliases.includes(h));
    if (hit) mapping[field] = hit;
  }
  return mapping;
}

function normalizePurchaseRow(raw: Record<string, string>, mapping: Record<string, string>) {
  const quantityRaw = raw[mapping.quantity || ""] || "";
  const priceRaw = raw[mapping.unit_price || ""] || "";
  const quantity = Number(quantityRaw);
  const unitPrice = Number(priceRaw);
  const normalized = {
    code: safeText(raw[mapping.code || ""] || "", 120),
    name: safeText(raw[mapping.name || ""] || "", 200),
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
    currency: safeText(raw[mapping.currency || ""] || "", 10).toUpperCase(),
    supplier_name: safeText(raw[mapping.supplier_name || ""] || "", 200),
    notes: safeText(raw[mapping.notes || ""] || "", 2000),
  } as Record<string, string | number | null>;
  const errors: string[] = [];
  if (!normalized.code && !normalized.name) errors.push("Falta código o nombre");
  const normalizedQty = normalized.quantity as number | null;
  const normalizedPrice = normalized.unit_price as number | null;
  if (normalizedQty === null || normalizedQty <= 0 || normalizedQty > 1e6) errors.push("Cantidad inválida");
  if (normalizedPrice === null || normalizedPrice < 0 || normalizedPrice > 1e9) errors.push("Precio unitario inválido");
  return { normalized, errors };
}

function normalizeCustomerRow(raw: Record<string, string>, mapping: Record<string, string>) {
  const normalized = {
    name: safeText(raw[mapping.name || ""] || "", 200),
    phone: sanitizeShortText(safeText(raw[mapping.phone || ""] || "", 50), 50),
    email: safeText(raw[mapping.email || ""] || "", 255).toLowerCase(),
    doc: sanitizeShortText(safeText(raw[mapping.doc || ""] || "", 50), 50),
    address: safeText(raw[mapping.address || ""] || "", 250),
    notes: safeText(raw[mapping.notes || ""] || "", 500),
  } as Record<string, string | number | null>;
  const errors: string[] = [];
  if (!normalized.name) errors.push("Falta nombre");
  if (normalized.email && !String(normalized.email).includes("@")) errors.push("Email inválido");
  return { normalized, errors };
}

export function parseXlsxRows(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".xlsx") throw new Error("IMPORT_INVALID_EXTENSION");
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMPORT_FILE_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");

  const sharedStringsXml = unzipEntry(filePath, "xl/sharedStrings.xml");
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const sheetPath = findFirstSheetPath(filePath);
  const sheetXml = unzipEntry(filePath, sheetPath);
  const matrix = parseSheet(sheetXml, sharedStrings);
  if (!matrix.length) throw new Error("IMPORT_EMPTY_FILE");

  const headersRaw = matrix[0].map((h) => String(h || "").trim());
  const headers = headersRaw.map(normalizeHeader);
  const rows = matrix.slice(1).filter((row) => row.some((v) => String(v || "").trim() !== ""));

  const parsedRows = rows.map((row) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      raw[h] = String(row[idx] ?? "").trim();
    });
    return raw;
  });

  return { headers: headers.filter(Boolean), rows: parsedRows };
}

export function buildPreview(entity: ImportEntity, filePath: string): PreviewResult {
  const { headers, rows } = parseXlsxRows(filePath);
  const aliases = entity === "purchases" ? purchaseAliases : customerAliases;
  const mapping = pickSuggestedMapping(headers, aliases);
  const requiredFields = entity === "purchases" ? ["name", "quantity", "unit_price"] : ["name"];
  const warnings: string[] = [];
  const missingRequired = requiredFields.filter((f) => !mapping[f]);
  if (missingRequired.length) {
    warnings.push(`Faltan columnas críticas: ${missingRequired.join(", ")}`);
  }

  const usedHeaders = new Set(Object.values(mapping));
  const extraColumns = headers.filter((h) => !usedHeaders.has(h));
  const previewRows = rows.slice(0, 25).map((raw) => {
    const normalized = entity === "purchases"
      ? normalizePurchaseRow(raw, mapping).normalized
      : normalizeCustomerRow(raw, mapping).normalized;
    const errors = entity === "purchases"
      ? normalizePurchaseRow(raw, mapping).errors
      : normalizeCustomerRow(raw, mapping).errors;
    return { raw, normalized, errors };
  });

  return {
    detectedHeaders: headers,
    suggestedMapping: mapping,
    extraColumns,
    rowsPreview: previewRows,
    warnings,
  };
}

export function normalizeRowsForCommit(entity: ImportEntity, filePath: string, mapping: Record<string, string>) {
  const requiredFields = entity === "purchases" ? ["name", "quantity", "unit_price"] : ["name"];
  const missingRequired = requiredFields.filter((f) => !mapping[f]);
  if (missingRequired.length) {
    const labels: Record<string, string> = { name: "Nombre producto", quantity: "Cantidad", unit_price: "Precio" };
    const missingLabels = missingRequired.map(f => labels[f] || f);
    throw new Error(`EXCEL_IMPORT_MISSING_COLUMNS|Debe mapear la columna '${missingLabels.join(", ")}' antes de continuar.`);
  }

  const { rows } = parseXlsxRows(filePath);
  return rows.map((raw, idx) => {
    const normalizedPack = entity === "purchases"
      ? normalizePurchaseRow(raw, mapping)
      : normalizeCustomerRow(raw, mapping);
    return {
      rowNumber: idx + 2,
      raw,
      normalized: normalizedPack.normalized,
      errors: normalizedPack.errors,
    };
  });
}
