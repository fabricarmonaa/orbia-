import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface PreviewData {
  detectedHeaders: string[];
  suggestedMapping: Record<string, string>;
  extraColumns: string[];
  rowsPreview: Array<{ raw: Record<string, string>; normalized: Record<string, string | number | null>; errors: string[] }>;
  warnings: string[];
}

const fields = [
  { key: "name", label: "Nombre" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Email" },
  { key: "doc", label: "Documento" },
  { key: "address", label: "Dirección" },
  { key: "notes", label: "Notas" },
];

export default function CustomersPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [includeExtra, setIncludeExtra] = useState(false);
  const [selectedExtra, setSelectedExtra] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const canCommit = useMemo(() => Boolean(file && preview), [file, preview]);

  async function loadPreview() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiRequest("POST", "/api/customers/import/preview", fd);
      const data = await resp.json();
      setPreview(data);
      setMapping(data.suggestedMapping || {});
      setSelectedExtra(data.extraColumns || []);
    } catch {
      toast({ title: "Error", description: "No se pudo generar preview", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("includeExtraColumns", String(includeExtra));
      fd.append("selectedExtraColumns", JSON.stringify(selectedExtra));
      const resp = await apiRequest("POST", "/api/customers/import/commit", fd);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "No se pudo importar");
      setSummary(data);
      toast({ title: "Importación completada" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Importar Clientes desde Excel</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Archivo .xlsx</Label>
            <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={loadPreview} disabled={!file || loading}>Generar preview</Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle>Mapeo de columnas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label>{field.label}</Label>
                  <select
                    className="w-full border rounded px-2 h-9 bg-background"
                    value={mapping[field.key] || ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">Sin mapear</option>
                    {preview.detectedHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeExtra} onCheckedChange={(v) => setIncludeExtra(Boolean(v))} />
              <span className="text-sm">Cargar también campos extra detectados</span>
            </div>
            {preview.warnings?.length > 0 && <p className="text-sm text-amber-600">{preview.warnings.join(" • ")}</p>}
            <div className="overflow-auto border rounded max-h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2">Fila</th>
                    <th className="text-left p-2">Normalizado</th>
                    <th className="text-left p-2">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rowsPreview.map((row, idx) => (
                    <tr key={idx} className="border-b align-top">
                      <td className="p-2">{idx + 2}</td>
                      <td className="p-2 whitespace-pre-wrap">{JSON.stringify(row.normalized)}</td>
                      <td className="p-2 text-red-600">{row.errors.join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={commitImport} disabled={!canCommit || loading}>Confirmar importación</Button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(summary, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
