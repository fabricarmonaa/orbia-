import { useEffect, useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { downloadPriceListPdf, type PriceListExportPayload } from "@/lib/pdfs";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Filter, MoreHorizontal, Plus, Search, SlidersHorizontal, Download, Pencil, Power, Trash2, Warehouse } from "lucide-react";

type StockMode = "global" | "by_branch";

type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  categoryId: number | null;
  price: string;
  cost: string | null;
  stock: number | null;
  stockTotal: number;
  branchStock?: Array<{ branchId: number; branchName: string; stock: number }>;
  isActive: boolean;
};

type Category = { id: number; name: string };

type ProductFilters = {
  q: string;
  categoryId: string;
  status: "all" | "active" | "inactive";
  minPrice: string;
  maxPrice: string;
  stock: "all" | "in" | "out" | "low";
  lowStockThreshold: string;
  sort: "createdAt" | "name" | "price" | "stock";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

const defaultFilters: ProductFilters = {
  q: "",
  categoryId: "all",
  status: "all",
  minPrice: "",
  maxPrice: "",
  stock: "all",
  lowStockThreshold: "5",
  sort: "createdAt",
  dir: "desc",
  page: 1,
  pageSize: 20,
};

const emptyProduct = {
  name: "",
  description: "",
  price: "",
  sku: "",
  categoryId: "",
  cost: "",
  stock: "",
};

export default function ProductsPage() {
  const { hasFeature, loading: planLoading } = usePlan();
  const { user } = useAuth();
  const { toast } = useToast();

  const canAccess = hasFeature("products");
  const isTenantAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(defaultFilters);
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 20, totalPages: 1, stockMode: "global" as StockMode });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [productDialog, setProductDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [catDialog, setCatDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState(false);
  const [stockByBranch, setStockByBranch] = useState<Array<{ branchId: number; branchName: string; stock: number }>>([]);
  const [stockProduct, setStockProduct] = useState<ProductRow | null>(null);
  const [newCat, setNewCat] = useState("");
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState(emptyProduct);

  const selectionStorageKey = `orbia:products:selected:${user?.tenantId ?? "anon"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(selectionStorageKey);
      if (raw) setSelectedIds(new Set(JSON.parse(raw) as number[]));
    } catch {
      setSelectedIds(new Set());
    }
  }, [selectionStorageKey]);

  useEffect(() => {
    localStorage.setItem(selectionStorageKey, JSON.stringify(Array.from(selectedIds)));
  }, [selectedIds, selectionStorageKey]);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void fetchCategories();
  }, [canAccess]);

  useEffect(() => {
    if (canAccess) void fetchProducts(filters);
  }, [filters, canAccess]);

  function buildQuery(current: ProductFilters) {
    const params = new URLSearchParams();
    if (current.q.trim()) params.set("q", current.q.trim());
    if (current.categoryId !== "all") params.set("categoryId", current.categoryId);
    params.set("status", current.status);
    if (current.minPrice) params.set("minPrice", current.minPrice);
    if (current.maxPrice) params.set("maxPrice", current.maxPrice);
    params.set("stock", current.stock);
    if (current.stock === "low") params.set("lowStockThreshold", current.lowStockThreshold || "5");
    params.set("sort", current.sort);
    params.set("dir", current.dir);
    params.set("page", String(current.page));
    params.set("pageSize", String(current.pageSize));
    return params.toString();
  }

  async function fetchCategories() {
    try {
      const [categoriesRes] = await Promise.all([apiRequest("GET", "/api/product-categories")]);
      const data = await categoriesRes.json();
      setCategories(data.data || []);
    } catch (err: any) {
      toast({ title: "No se pudieron cargar categorías", description: err.message, variant: "destructive" });
    }
  }

  async function fetchProducts(current: ProductFilters) {
    setLoading(true);
    try {
      const res = await apiRequest("GET", `/api/products?${buildQuery(current)}`);
      const data = await res.json();
      setRows(data.data || []);
      setMeta(data.meta || { total: 0, page: current.page, pageSize: current.pageSize, totalPages: 1, stockMode: "global" });
    } catch (err: any) {
      toast({ title: "No se pudieron cargar productos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/product-categories", { name: newCat });
      toast({ title: "Categoría creada" });
      setCatDialog(false);
      setNewCat("");
      await fetchCategories();
    } catch (err: any) {
      toast({ title: "No se pudo crear categoría", description: err.message, variant: "destructive" });
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/products", {
        name: newProduct.name,
        description: newProduct.description || null,
        price: Number(newProduct.price),
        sku: newProduct.sku || null,
        categoryId: newProduct.categoryId ? Number(newProduct.categoryId) : null,
        cost: newProduct.cost ? Number(newProduct.cost) : null,
        stock: meta.stockMode === "global" ? (newProduct.stock ? Number(newProduct.stock) : 0) : null,
      });
      toast({ title: "Producto creado" });
      setNewProduct(emptyProduct);
      setProductDialog(false);
      await fetchProducts(filters);
    } catch (err: any) {
      toast({ title: "No se pudo crear el producto", description: err.message, variant: "destructive" });
    }
  }

  function openEdit(product: ProductRow) {
    setEditProduct(product);
    setEditForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price || ""),
      sku: product.sku || "",
      categoryId: product.categoryId ? String(product.categoryId) : "",
      cost: product.cost || "",
      stock: product.stock != null ? String(product.stock) : "",
    });
    setEditDialog(true);
  }

  async function updateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    try {
      await apiRequest("PUT", `/api/products/${editProduct.id}`, {
        name: editForm.name,
        description: editForm.description || null,
        price: Number(editForm.price),
        sku: editForm.sku || null,
        categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
        cost: editForm.cost ? Number(editForm.cost) : null,
        stock: meta.stockMode === "global" ? (editForm.stock ? Number(editForm.stock) : 0) : null,
      });
      toast({ title: "Producto actualizado" });
      setEditDialog(false);
      setEditProduct(null);
      await fetchProducts(filters);
    } catch (err: any) {
      toast({ title: "No se pudo actualizar", description: err.message, variant: "destructive" });
    }
  }

  async function toggleActive(product: ProductRow) {
    try {
      await apiRequest("PATCH", `/api/products/${product.id}/toggle`);
      toast({ title: product.isActive ? "Producto desactivado" : "Producto activado" });
      await fetchProducts(filters);
    } catch (err: any) {
      toast({ title: "No se pudo actualizar estado", description: err.message, variant: "destructive" });
    }
  }

  async function deleteProduct(product: ProductRow) {
    const confirmed = window.confirm(`¿Eliminar ${product.name}?`);
    if (!confirmed) return;
    try {
      await apiRequest("DELETE", `/api/products/${product.id}`);
      toast({ title: "Producto eliminado" });
      await fetchProducts(filters);
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message, variant: "destructive" });
    }
  }

  async function openStockDialog(product: ProductRow) {
    setStockDialog(true);
    setStockProduct(product);
    try {
      const res = await apiRequest("GET", `/api/products/${product.id}/stock`);
      const data = await res.json();
      setStockByBranch(data.data?.stockByBranch || []);
    } catch {
      setStockByBranch([]);
    }
  }

  async function selectAllFiltered() {
    try {
      const ids: number[] = [];
      const firstRes = await apiRequest("GET", `/api/products?${buildQuery({ ...filters, page: 1, pageSize: 100 })}`);
      const firstData = await firstRes.json();
      ids.push(...(firstData.data || []).map((row: ProductRow) => row.id));
      const totalPages = firstData.meta?.totalPages || 1;
      for (let page = 2; page <= totalPages; page++) {
        const res = await apiRequest("GET", `/api/products?${buildQuery({ ...filters, page, pageSize: 100 })}`);
        const data = await res.json();
        ids.push(...(data.data || []).map((row: ProductRow) => row.id));
      }
      setSelectedIds(new Set(ids));
      toast({ title: "Selección actualizada", description: `${ids.length} productos seleccionados` });
    } catch (err: any) {
      toast({ title: "No se pudo seleccionar", description: err.message, variant: "destructive" });
    }
  }

  function toExportPayload(mode: "filtered" | "selected"): PriceListExportPayload {
    return {
      mode,
      filters: {
        q: filters.q || undefined,
        categoryId: filters.categoryId === "all" ? undefined : Number(filters.categoryId),
        status: filters.status,
        minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
        maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
        stock: filters.stock,
        lowStockThreshold: filters.stock === "low" ? Number(filters.lowStockThreshold || 5) : undefined,
        sort: filters.sort,
        dir: filters.dir,
      },
      selectedIds: Array.from(selectedIds),
    };
  }

  async function exportPdf(mode: "filtered" | "selected") {
    if (mode === "filtered" && meta.total === 0) {
      toast({ title: "No hay productos para exportar", variant: "destructive" });
      return;
    }
    if (mode === "selected" && selectedIds.size === 0) {
      toast({ title: "Seleccioná productos primero", variant: "destructive" });
      return;
    }
    try {
      await downloadPriceListPdf(toExportPayload(mode));
      toast({ title: "PDF generado" });
    } catch (err: any) {
      toast({
        title: "No se pudo generar PDF",
        description: err.message?.includes("demasiados") ? "Demasiados productos. Refiná los filtros e intentá de nuevo." : err.message,
        variant: "destructive",
      });
    }
  }

  const isPageSelected = useMemo(() => rows.length > 0 && rows.every((row) => selectedIds.has(row.id)), [rows, selectedIds]);

  const activeFiltersCount = [
    filters.q,
    filters.categoryId !== "all",
    filters.status !== "all",
    filters.minPrice,
    filters.maxPrice,
    filters.stock !== "all",
    filters.sort !== "createdAt" || filters.dir !== "desc",
  ].filter(Boolean).length;

  if (planLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!canAccess) {
    return <UpgradePrompt feature="products" title="Productos" description="Catálogo de productos y servicios" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
        <Button variant="outline" className="md:hidden" onClick={() => setFiltersOpenMobile((v) => !v)}>
          <SlidersHorizontal className="h-4 w-4 mr-2" /> Filtros
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 items-start">
        <Card className={`${filtersOpenMobile ? "block" : "hidden"} md:block md:sticky md:top-20`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" />Filtros</CardTitle>
            <p className="text-xs text-muted-foreground">{activeFiltersCount} filtros activos</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-2.5" />
                <Input className="pl-8" placeholder="Buscar por producto, código o detalle..." value={draftFilters.q} onChange={(e) => setDraftFilters((p) => ({ ...p, q: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={draftFilters.categoryId} onValueChange={(value) => setDraftFilters((p) => ({ ...p, categoryId: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <div className="flex flex-wrap gap-2">
                {(["all", "active", "inactive"] as const).map((status) => (
                  <Button key={status} type="button" size="sm" variant={draftFilters.status === status ? "default" : "outline"} onClick={() => setDraftFilters((p) => ({ ...p, status }))}>
                    {status === "all" ? "Todos" : status === "active" ? "Activos" : "Inactivos"}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Precio</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Precio mín." value={draftFilters.minPrice} onChange={(e) => setDraftFilters((p) => ({ ...p, minPrice: e.target.value }))} />
                <Input type="number" placeholder="Precio máx." value={draftFilters.maxPrice} onChange={(e) => setDraftFilters((p) => ({ ...p, maxPrice: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Stock</Label>
              <div className="flex flex-wrap gap-2">
                {(["all", "in", "out", "low"] as const).map((stock) => (
                  <Button key={stock} size="sm" variant={draftFilters.stock === stock ? "default" : "outline"} onClick={() => setDraftFilters((p) => ({ ...p, stock }))}>
                    {stock === "all" ? "Todos" : stock === "in" ? "Con stock" : stock === "out" ? "Sin stock" : "Bajo"}
                  </Button>
                ))}
              </div>
              {draftFilters.stock === "low" && (
                <Input type="number" min={0} value={draftFilters.lowStockThreshold} onChange={(e) => setDraftFilters((p) => ({ ...p, lowStockThreshold: e.target.value }))} placeholder="Alerta stock bajo" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Orden</Label>
              <Select
                value={`${draftFilters.sort}:${draftFilters.dir}`}
                onValueChange={(value) => {
                  const [sort, dir] = value.split(":") as [ProductFilters["sort"], ProductFilters["dir"]];
                  setDraftFilters((p) => ({ ...p, sort, dir }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt:desc">Más nuevos</SelectItem>
                  <SelectItem value="createdAt:asc">Más viejos</SelectItem>
                  <SelectItem value="name:asc">Nombre A-Z</SelectItem>
                  <SelectItem value="name:desc">Nombre Z-A</SelectItem>
                  <SelectItem value="price:asc">Precio ↑</SelectItem>
                  <SelectItem value="price:desc">Precio ↓</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-2">
              <Button className="w-full" onClick={() => setFilters({ ...draftFilters, page: 1 })}>Aplicar</Button>
              <Button className="w-full" variant="outline" onClick={() => { setDraftFilters(defaultFilters); setFilters(defaultFilters); }}>Limpiar</Button>
              <Button className="w-full" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpiar selección</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Mostrando {rows.length} de {meta.total}</Badge>
                <Badge variant="outline">Seleccionados: {selectedIds.size}</Badge>
                {selectedIds.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpiar</Button>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline"><Download className="h-4 w-4 mr-2" />Exportar</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportPdf("filtered")}>PDF con filtrados</DropdownMenuItem>
                    <DropdownMenuItem disabled={selectedIds.size === 0} onClick={() => exportPdf("selected")}>PDF con seleccionados</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={selectAllFiltered}>Seleccionar todo (filtrado)</Button>
                {isTenantAdmin && (
                  <>
                    <Dialog open={catDialog} onOpenChange={setCatDialog}>
                      <DialogTrigger asChild><Button variant="outline">Categoría</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
                        <form className="space-y-3" onSubmit={createCategory}>
                          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nombre" required />
                          <Button type="submit" className="w-full">Guardar</Button>
                        </form>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={productDialog} onOpenChange={setProductDialog}>
                      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nuevo producto</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
                        <ProductForm
                          value={newProduct}
                          onChange={setNewProduct}
                          categories={categories}
                          stockMode={meta.stockMode}
                          onSubmit={createProduct}
                          submitText="Crear producto"
                        />
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left p-2 w-10">
                      <Checkbox
                        checked={isPageSelected}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds);
                          if (checked) rows.forEach((row) => next.add(row.id));
                          else rows.forEach((row) => next.delete(row.id));
                          setSelectedIds(next);
                        }}
                      />
                    </th>
                    <th className="text-left p-2">Nombre</th>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-left p-2">Categoría</th>
                    <th className="text-right p-2">Precio</th>
                    <th className="text-left p-2">Stock</th>
                    <th className="text-left p-2">Estado</th>
                    <th className="text-right p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="p-4"><Skeleton className="h-10 w-full" /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No hay productos con estos filtros.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds);
                            if (checked) next.add(row.id); else next.delete(row.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <p className="font-medium">{row.name}</p>
                        {row.description && <p className="text-xs text-muted-foreground truncate max-w-[240px]">{row.description}</p>}
                      </td>
                      <td className="p-2 text-muted-foreground">{row.sku || "-"}</td>
                      <td className="p-2 text-muted-foreground">{categories.find((c) => c.id === row.categoryId)?.name || "Sin categoría"}</td>
                      <td className="p-2 text-right">${Number(row.price).toLocaleString("es-AR")}</td>
                      <td className="p-2">
                        {meta.stockMode === "global" ? (
                          <div className="flex items-center gap-2">
                            <span>{row.stockTotal}</span>
                            {row.stockTotal <= Number(filters.lowStockThreshold || 5) && <Badge variant="outline">Bajo</Badge>}
                          </div>
                        ) : (
                          <button className="text-left hover:underline" onClick={() => openStockDialog(row)}>
                            <span className="inline-flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" /> {row.stockTotal}</span>
                          </button>
                        )}
                      </td>
                      <td className="p-2"><Badge variant={row.isActive ? "default" : "secondary"}>{row.isActive ? "Activo" : "Inactivo"}</Badge></td>
                      <td className="p-2 text-right">
                        {isTenantAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="icon" variant="outline"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleActive(row)}><Power className="h-4 w-4 mr-2" />{row.isActive ? "Desactivar" : "Activar"}</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteProduct(row)}><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Página {meta.page} de {meta.totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={meta.page <= 1} onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}>Anterior</Button>
                <Button variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}>Siguiente</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar producto</DialogTitle></DialogHeader>
          <ProductForm
            value={editForm}
            onChange={setEditForm}
            categories={categories}
            stockMode={meta.stockMode}
            onSubmit={updateProduct}
            submitText="Guardar cambios"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={stockDialog} onOpenChange={setStockDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stock por sucursal {stockProduct ? `- ${stockProduct.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {stockByBranch.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin detalle disponible.</p>
            ) : stockByBranch.map((entry) => (
              <div key={entry.branchId} className="flex items-center justify-between border rounded-md p-2">
                <span>{entry.branchName}</span>
                <Badge variant="outline">{entry.stock}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ProductFormProps = {
  value: typeof emptyProduct;
  onChange: (next: typeof emptyProduct) => void;
  categories: Category[];
  stockMode: StockMode;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  submitText: string;
};

function ProductForm({ value, onChange, categories, stockMode, onSubmit, submitText }: ProductFormProps) {
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input required value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Ej: Remera Talle M / Servicio de Limpieza" />
      </div>
      <div className="space-y-2">
        <Label>Descripción</Label>
        <Textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={3} placeholder="Detalles del producto o servicio" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label>Precio</Label>
          <Input type="number" min={0} step="0.01" required value={value.price} onChange={(e) => onChange({ ...value, price: e.target.value })} placeholder="0.00" />
        </div>
        <div className="space-y-2">
          <Label>SKU</Label>
          <Input value={value.sku} onChange={(e) => onChange({ ...value, sku: e.target.value })} placeholder="COD-123" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label>Categoría</Label>
          <Select value={value.categoryId || "none"} onValueChange={(v) => onChange({ ...value, categoryId: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Costo</Label>
          <Input type="number" min={0} step="0.01" value={value.cost} onChange={(e) => onChange({ ...value, cost: e.target.value })} placeholder="0.00" />
        </div>
      </div>
      {stockMode === "global" ? (
        <div className="space-y-2">
          <Label>Stock</Label>
          <Input type="number" min={0} value={value.stock} onChange={(e) => onChange({ ...value, stock: e.target.value })} placeholder="0" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">El stock se gestiona por sucursal.</p>
      )}
      <Button type="submit" className="w-full">{submitText}</Button>
    </form>
  );
}
