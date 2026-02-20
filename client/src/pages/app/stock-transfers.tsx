import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  async function load() {
    const res = await apiRequest("GET", "/api/stock/transfers");
    const json = await res.json();
    setTransfers(json.data || []);
  }
  useEffect(() => { load(); }, []);

  async function createTransfer() {
    await apiRequest("POST", "/api/stock/transfers", {
      from_branch_id: fromBranch ? Number(fromBranch) : null,
      to_branch_id: toBranch ? Number(toBranch) : null,
      items: [{ product_id: Number(productId), quantity: Number(quantity) }],
    });
    await load();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Transferencias de Stock</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-5 gap-2">
          <div><Label>Desde sucursal</Label><Input value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} placeholder="id" /></div>
          <div><Label>Hacia sucursal</Label><Input value={toBranch} onChange={(e) => setToBranch(e.target.value)} placeholder="id" /></div>
          <div><Label>Producto</Label><Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="id" /></div>
          <div><Label>Cantidad</Label><Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min={0.001} step={0.001} /></div>
          <div className="flex items-end"><Button onClick={createTransfer}>Crear</Button></div>
        </div>

        <div className="space-y-2">
          {transfers.map((t) => (
            <div key={t.id} className="border rounded p-2 flex items-center justify-between">
              <div>
                <p className="font-medium">Transfer #{t.id}</p>
                <p className="text-xs text-muted-foreground">Estado: {t.status} · Origen: {t.fromBranchId ?? "Central"} · Destino: {t.toBranchId ?? "Central"}</p>
              </div>
              <div className="flex gap-2">
                {t.status === "PENDING" && <Button size="sm" variant="outline" onClick={async () => { await apiRequest("POST", `/api/stock/transfers/${t.id}/complete`, {}); load(); }}>Completar</Button>}
                {t.status === "PENDING" && <Button size="sm" variant="destructive" onClick={async () => { await apiRequest("POST", `/api/stock/transfers/${t.id}/cancel`, {}); load(); }}>Cancelar</Button>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
