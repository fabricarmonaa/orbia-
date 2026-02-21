import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function ReportsCashPage() {
  const [data, setData] = useState<any>({ daily: [] });
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  async function load() { const r = await apiRequest("GET", `/api/reports/cash?${new URLSearchParams({ from, to })}`); setData(await r.json()); }
  async function exp(format: "csv"|"pdf") { const r = await apiRequest("POST", "/api/reports/export", { type: "cash", format, params: { from, to } }); const d = await r.json(); window.open(d.url, "_blank"); }
  useEffect(() => { load().catch(() => setData({ daily: [] })); }, [from, to]);
  return <div className="space-y-3"><div className="flex gap-2"><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="border rounded px-2 py-1"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="border rounded px-2 py-1"/><Button onClick={load}>Filtrar</Button><Button variant="outline" onClick={()=>exp("csv")}>Exportar CSV</Button><Button variant="outline" onClick={()=>exp("pdf")}>Exportar PDF</Button></div><p className="text-sm">Cash In: ${Number(data.cashIn||0).toLocaleString("es-AR")} | Cash Out: ${Number(data.cashOut||0).toLocaleString("es-AR")} | Neto: ${Number(data.netCash||0).toLocaleString("es-AR")}</p><table className="w-full text-sm"><thead><tr><th className="text-left">Fecha</th><th>Ingresos</th><th>Egresos</th></tr></thead><tbody>{(data.daily||[]).map((r:any,i:number)=><tr key={i}><td>{new Date(r.date).toLocaleDateString()}</td><td className="text-right">${Number(r.cash_in||0).toLocaleString("es-AR")}</td><td className="text-right">${Number(r.cash_out||0).toLocaleString("es-AR")}</td></tr>)}</tbody></table></div>;
}
