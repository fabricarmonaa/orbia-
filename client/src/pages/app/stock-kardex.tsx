import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function StockKardexPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([apiRequest("GET", "/api/products"), apiRequest("GET", "/api/branches")]).then(async ([p, b]) => {
      const pj = await p.json();
      const bj = await b.json();
      setProducts(pj.data || []);
      setBranches(bj.data || []);
    });
  }, []);

  useEffect(() => {
    if (!productId) return;
    const params = new URLSearchParams({ product_id: productId });
    if (branchId !== "all") params.set("branch_id", branchId);
    apiRequest("GET", `/api/stock/kardex?${params.toString()}`).then((r) => r.json()).then((j) => setRows(j.data || []));
  }, [productId, branchId]);

  return (
    <Card>
      <CardHeader><CardTitle>Kardex de Stock</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Producto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th>Fecha</th><th>Tipo</th><th>Ref</th><th>Entrada</th><th>Salida</th><th>Stock</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const out = ["SALE", "ADJUSTMENT_OUT", "TRANSFER_OUT"].includes(r.movementType);
                return <tr key={r.id} className="border-b"><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.movementType}</td><td>{r.referenceId || "-"}</td><td>{out ? "-" : r.quantity}</td><td>{out ? r.quantity : "-"}</td><td>{r.stockAfter}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
