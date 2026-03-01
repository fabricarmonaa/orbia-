import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Receipt, FileText, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { generateMonthlySummary, type MonthlySummaryResponse } from "@/lib/reports";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import * as XLSX from "xlsx";

export function OperationsSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { plan } = usePlan();

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [summary, setSummary] = useState<MonthlySummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const monthOptions = [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  async function handleGenerateSummary(force = false) {
    setLoadingSummary(true);
    try {
      const data = await generateMonthlySummary({
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        force,
      });
      setSummary(data);
      toast({ title: "Resumen generado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingSummary(false);
    }
  }

  function downloadSummary() {
    if (!summary) return;
    const rows = [{
      "Año": summary.year,
      "Mes": summary.month,
      "Resultado neto": Number(summary.totalsJson.net.toFixed(2)),
      "Ingresos": Number(summary.totalsJson.income.toFixed(2)),
      "Egresos": Number(summary.totalsJson.expenses.toFixed(2)),
      "Costos fijos": Number(summary.totalsJson.fixedImpact.toFixed(2)),
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `resumen-${summary.year}-${String(summary.month).padStart(2, "0")}.xlsx`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Caja</h3>
          <p className="text-sm text-muted-foreground">Movimientos y sesiones de caja</p>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setLocation("/app/cash")}>
            <Wallet className="w-4 h-4 mr-2" />
            Ir a Caja
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Gastos</h3>
          <p className="text-sm text-muted-foreground">Configura gastos fijos y variables desde Caja</p>
        </CardHeader>
        <CardContent>
          {<Button variant="outline" onClick={() => setLocation("/app/cash")}>
            <Receipt className="w-4 h-4 mr-2" />
            Configurar gastos
          </Button>}
        </CardContent>
      </Card>
      {isAdmin && (
        <Card className="md:col-span-2">
          <CardHeader>
            <h3 className="font-semibold">Resumen mensual</h3>
            <p className="text-sm text-muted-foreground">Generá un snapshot del mes bajo demanda</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Mes</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Año</Label>
                <Input
                  type="number"
                  min="2000"
                  max="2100"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => handleGenerateSummary(false)} disabled={loadingSummary}>
                  <FileText className="w-4 h-4 mr-2" />
                  {loadingSummary ? "Generando..." : "Generar resumen"}
                </Button>
                <Button variant="outline" onClick={() => handleGenerateSummary(true)} disabled={loadingSummary}>
                  Recalcular
                </Button>
              </div>
            </div>

            {summary ? (
              <div className="border rounded-md p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    Resumen {summary.month}/{summary.year}
                  </p>
                  <Button variant="ghost" size="sm" onClick={downloadSummary}>
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Excel
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Ingresos</p>
                    <p className="font-medium">{summary.totalsJson.income.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Egresos</p>
                    <p className="font-medium">{summary.totalsJson.expenses.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fijos definidos</p>
                    <p className="font-medium">{summary.totalsJson.fixedImpact.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Neto</p>
                    <p className="font-medium">{summary.totalsJson.net.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no generaste un resumen para este mes.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
