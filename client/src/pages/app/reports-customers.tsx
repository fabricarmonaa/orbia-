import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function ReportsCustomersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  async function load() { const r = await apiRequest("GET", `/api/reports/customers?${new URLSearchParams({ from, to })}`); setRows((await r.json()).rows || []); }
  async function exp(format: "csv"|"pdf") { const r = await apiRequest("POST", "/api/reports/export", { type: "customers", format, params: { from, to } }); const d = await r.json(); window.open(d.url, "_blank"); }
  useEffect(() => { load().catch(() => setRows([])); }, [from, to]);
  return <div className="space-y-3"><div className="flex gap-2"><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="border rounded px-2 py-1"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="border rounded px-2 py-1"/><Button onClick={load}>Filtrar</Button><Button variant="outline" onClick={()=>exp("csv")}>Exportar CSV</Button><Button variant="outline" onClick={()=>exp("pdf")}>Exportar PDF</Button></div><table className="w-full text-sm"><thead><tr><th className="text-left">Cliente</th><th>Compras</th><th>Revenue</th><th>Última compra</th></tr></thead><tbody>{rows.map((r)=><tr key={r.customerId}><td>{r.name}</td><td className="text-right">{r.purchasesCount}</td><td className="text-right">${Number(r.revenue||0).toLocaleString("es-AR")}</td><td className="text-right">{r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString() : '-'}</td></tr>)}</tbody></table></div>;
}
