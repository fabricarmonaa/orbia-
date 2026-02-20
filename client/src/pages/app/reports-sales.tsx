import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function ReportsSalesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  async function load() { const r = await apiRequest("GET", `/api/reports/sales?${new URLSearchParams({ from, to, groupBy: "day" })}`); setRows((await r.json()).rows || []); }
  async function exp(format: "csv"|"pdf") { const r = await apiRequest("POST", "/api/reports/export", { type: "sales", format, params: { from, to } }); const d = await r.json(); window.open(d.url, "_blank"); }
  useEffect(() => { load().catch(() => setRows([])); }, [from, to]);
  return <div className="space-y-3"><div className="flex gap-2"><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="border rounded px-2 py-1"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="border rounded px-2 py-1"/><Button onClick={load}>Filtrar</Button><Button variant="outline" onClick={()=>exp("csv")}>Exportar CSV</Button><Button variant="outline" onClick={()=>exp("pdf")}>Exportar PDF</Button></div><table className="w-full text-sm"><thead><tr><th className="text-left">Grupo</th><th>Neto</th><th>Cant</th><th>Ticket</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{String(r.label)}</td><td className="text-right">${Number(r.net||0).toLocaleString("es-AR")}</td><td className="text-right">{r.count}</td><td className="text-right">${Number(r.avg_ticket||0).toLocaleString("es-AR")}</td></tr>)}</tbody></table></div>;
}
