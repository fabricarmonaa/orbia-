import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { usePlan } from "@/lib/plan";
import { VoiceCommand } from "@/components/voice-command";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  ClipboardList,
  MessageSquare,
  History,
  Link2,
  Copy,
  ExternalLink,
  Send,
  X,
  Mic,
  Truck,
  MapPin,
  Camera,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppMessagePreview } from "@/components/messaging/WhatsAppMessagePreview";
import type { Order, OrderStatus, OrderComment, OrderStatusHistory, Branch } from "@shared/schema";

type MessageTemplate = {
  id: number;
  name: string;
  body: string;
  isActive: boolean;
};

export default function OrdersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { hasFeature } = usePlan();
  const [orders, setOrders] = useState<(Order & { statusName?: string; statusColor?: string })[]>([]);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [comments, setComments] = useState<OrderComment[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPublicComment, setIsPublicComment] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const { toast } = useToast();

  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [whatsDialogOpen, setWhatsDialogOpen] = useState(false);
  const [renderedMessage, setRenderedMessage] = useState("");
  const [renderingTemplateId, setRenderingTemplateId] = useState<number | null>(null);
  const [newOrder, setNewOrder] = useState({
    type: "PEDIDO",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    description: "",
    totalAmount: "",
    statusId: "",
    requiresDelivery: false,
    deliveryAddress: "",
    deliveryCity: "",
    deliveryAddressNotes: "",
  });

  useEffect(() => {
    fetchData();
    apiRequest("GET", "/api/addons/status")
      .then((r) => r.json())
      .then((d) => {
        const addons = d.data || {};
        setAddonStatus(addons);
        if (addons.messaging_whatsapp) {
          apiRequest("GET", "/api/message-templates")
            .then((r) => r.json())
            .then((tpl) => setMessageTemplates((tpl.data || []).filter((x: MessageTemplate) => x.isActive)))
            .catch(() => {});
        }
      })
      .catch(() => { });
  }, []);

  async function fetchData() {
    try {
      const [ordersRes, statusesRes, branchesRes] = await Promise.all([
        apiRequest("GET", "/api/orders"),
        apiRequest("GET", "/api/order-statuses"),
        apiRequest("GET", "/api/branches").catch(() => ({ json: () => ({ data: [] }) })),
      ]);
      const ordersData = await ordersRes.json();
      const statusesData = await statusesRes.json();
      const branchesData = await branchesRes.json();
      setOrders(ordersData.data || []);
      setStatuses(statusesData.data || []);
      setBranches(branchesData.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/orders", {
        ...newOrder,
        totalAmount: newOrder.totalAmount ? parseFloat(newOrder.totalAmount) : null,
        statusId: newOrder.statusId ? parseInt(newOrder.statusId) : null,
        requiresDelivery: newOrder.requiresDelivery,
        deliveryAddress: newOrder.requiresDelivery ? newOrder.deliveryAddress : null,
        deliveryCity: newOrder.requiresDelivery ? newOrder.deliveryCity : null,
        deliveryAddressNotes: newOrder.requiresDelivery ? newOrder.deliveryAddressNotes : null,
      });
      toast({ title: "Pedido creado" });
      setDialogOpen(false);
      setNewOrder({ type: "PEDIDO", customerName: "", customerPhone: "", customerEmail: "", description: "", totalAmount: "", statusId: "", requiresDelivery: false, deliveryAddress: "", deliveryCity: "", deliveryAddressNotes: "" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function openDetail(order: Order) {
    setSelectedOrder(order);
    setDetailOpen(true);
    try {
      const [commentsRes, historyRes] = await Promise.all([
        apiRequest("GET", `/api/orders/${order.id}/comments`),
        apiRequest("GET", `/api/orders/${order.id}/history`),
      ]);
      const commentsData = await commentsRes.json();
      const historyData = await historyRes.json();
      setComments(commentsData.data || []);
      setHistory(historyData.data || []);
    } catch { }
  }

  async function changeStatus(orderId: number, statusId: number) {
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { statusId });
      toast({ title: "Estado actualizado" });
      fetchData();
      if (selectedOrder?.id === orderId) {
        const res = await apiRequest("GET", `/api/orders/${orderId}/history`);
        const data = await res.json();
        setHistory(data.data || []);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function addComment() {
    if (!selectedOrder || !newComment.trim()) return;
    try {
      await apiRequest("POST", `/api/orders/${selectedOrder.id}/comments`, {
        content: newComment,
        isPublic: isPublicComment,
      });
      setNewComment("");
      const res = await apiRequest("GET", `/api/orders/${selectedOrder.id}/comments`);
      const data = await res.json();
      setComments(data.data || []);
      toast({ title: "Comentario agregado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }


  async function printOrder() {
    if (!selectedOrder || !(selectedOrder as any).saleId) return;
    const printUrl = `${window.location.origin}/app/print/sale/${(selectedOrder as any).saleId}`;
    const win = window.open(printUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = printUrl;
    }
  }


  function startSaleFromOrder(order: Order) {
    const payload = {
      orderId: order.id,
      customerId: null,
      customerDni: null,
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      requiresDelivery: Boolean(order.requiresDelivery),
      branchId: order.branchId || null,
    };
    sessionStorage.setItem("pendingSaleFromOrder", JSON.stringify(payload));
    setLocation("/app/pos");
  }

  async function generateTrackingLink(orderId: number) {
    try {
      const res = await apiRequest("POST", `/api/orders/${orderId}/tracking-link`);
      const data = await res.json();
      const link = `${window.location.origin}/tracking/${data.data.publicTrackingId}`;
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiado al portapapeles" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const filteredOrders = orders.filter((o) => {
    const matchSearch =
      (o.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
      String(o.orderNumber).includes(search) ||
      (o.description || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || String(o.statusId) === filterStatus;
    return matchSearch && matchStatus;
  });

  function getBranchName(branchId: number | null) {
    if (!branchId || branches.length === 0) return null;
    return branches.find((b) => b.id === branchId)?.name || null;
  }

  function getStatusInfo(statusId: number | null) {
    const s = statuses.find((st) => st.id === statusId);
    return s || { name: "Sin estado", color: "#6B7280" };
  }

  function handleVoiceResult() {
    setShowVoice(false);
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  }

  function formatDate(d: string | Date | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openWhatsApp(phone: string, text: string) {
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "");
    const encoded = encodeURIComponent(text);
    const url = isMobile
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      toast({ title: "El navegador bloqueó la ventana emergente.", variant: "destructive" });
    }
  }

  async function sendTemplateMessage(template: MessageTemplate) {
    if (!selectedOrder) return;
    setRenderingTemplateId(template.id);
    try {
      const res = await apiRequest("POST", "/api/message-templates/render", {
        templateBody: template.body,
        orderId: selectedOrder.id,
      });
      const data = await res.json();
      if (!data.normalizedPhone) {
        toast({ title: "Teléfono inválido. Editá el cliente.", variant: "destructive" });
        return;
      }
      const text = data.renderedText || "";
      setRenderedMessage(text);
      openWhatsApp(data.normalizedPhone, text);
    } catch (err: any) {
      toast({ title: "Error enviando mensaje", description: err.message, variant: "destructive" });
    } finally {
      setRenderingTemplateId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground">Gestión de pedidos y servicios</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasFeature("stt") && !showVoice && (
            <Button variant="outline" onClick={() => setShowVoice(true)} data-testid="button-voice-order">
              <Mic className="w-4 h-4 mr-2" />
              Dictar
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-order">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Pedido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crear Pedido</DialogTitle>
              </DialogHeader>
              <form onSubmit={createOrder} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={newOrder.type} onValueChange={(v) => setNewOrder({ ...newOrder, type: v })}>
                      <SelectTrigger data-testid="select-order-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEDIDO">Pedido</SelectItem>
                        <SelectItem value="ENCARGO">Encargo</SelectItem>
                        <SelectItem value="TURNO">Turno</SelectItem>
                        <SelectItem value="SERVICIO">Servicio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={newOrder.statusId} onValueChange={(v) => setNewOrder({ ...newOrder, statusId: v })}>
                      <SelectTrigger data-testid="select-order-status">
                        <SelectValue placeholder="Estado inicial" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Input
                    placeholder="Ej: Consumidor Final / Empresa S.A."
                    value={newOrder.customerName}
                    onChange={(e) => setNewOrder({ ...newOrder, customerName: e.target.value })}
                    data-testid="input-customer-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      placeholder="Ej: 11 1234-5678"
                      value={newOrder.customerPhone}
                      onChange={(e) => setNewOrder({ ...newOrder, customerPhone: e.target.value })}
                      data-testid="input-customer-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newOrder.totalAmount}
                      onChange={(e) => setNewOrder({ ...newOrder, totalAmount: e.target.value })}
                      data-testid="input-total-amount"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    placeholder="Ej: 2x Hamburguesas completas sin pepino"
                    value={newOrder.description}
                    onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
                    data-testid="input-description"
                  />
                </div>
                {addonStatus.delivery && (
                  <div className="space-y-3 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-sm">Requiere delivery</Label>
                      </div>
                      <Switch
                        checked={newOrder.requiresDelivery}
                        onCheckedChange={(v) => setNewOrder({ ...newOrder, requiresDelivery: v })}
                        data-testid="switch-requires-delivery"
                      />
                    </div>
                    {newOrder.requiresDelivery && (
                      <>
                        <div className="space-y-2">
                          <Label>Calle y número</Label>
                          <Input
                            placeholder="Ej: Av. San Martín 1234"
                            value={newOrder.deliveryAddress}
                            onChange={(e) => setNewOrder({ ...newOrder, deliveryAddress: e.target.value })}
                            data-testid="input-delivery-address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ciudad</Label>
                          <Input
                            placeholder="Ej: Buenos Aires"
                            value={newOrder.deliveryCity}
                            onChange={(e) => setNewOrder({ ...newOrder, deliveryCity: e.target.value })}
                            data-testid="input-delivery-city"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Notas para el delivery</Label>
                          <Input
                            placeholder="Piso 2 Depto B, Timbre 'Gómez'"
                            value={newOrder.deliveryAddressNotes}
                            onChange={(e) => setNewOrder({ ...newOrder, deliveryAddressNotes: e.target.value })}
                            data-testid="input-delivery-notes"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" data-testid="button-submit-order">
                  Crear Pedido
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showVoice && (
        <VoiceCommand
          context="orders"
          onResult={handleVoiceResult}
          onCancel={() => setShowVoice(false)}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, n° o detalle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-orders"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40" data-testid="select-filter-status">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No hay pedidos</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "Probá con otra búsqueda" : "Creá tu primer pedido"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((order) => {
            const status = getStatusInfo(order.statusId);
            return (
              <Card
                key={order.id}
                className="hover-elevate cursor-pointer"
                onClick={() => openDetail(order)}
                data-testid={`card-order-${order.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">
                          #{order.orderNumber}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">
                          {order.customerName || "Sin cliente"}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {order.description || order.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(order as any).createdByScope === "BRANCH" && (
                        <Badge variant="secondary" data-testid={`badge-scope-${order.id}`}>
                          Sucursal
                        </Badge>
                      )}
                      {getBranchName(order.branchId) && (
                        <Badge variant="outline" data-testid={`badge-branch-${order.id}`}>
                          {getBranchName(order.branchId)}
                        </Badge>
                      )}
                      {order.totalAmount && (
                        <span className="text-sm font-medium">
                          ${parseFloat(order.totalAmount).toLocaleString("es-AR")}
                        </span>
                      )}
                      <Badge
                        style={{ backgroundColor: status.color || "#6B7280", color: "#fff" }}
                        data-testid={`badge-status-${order.id}`}
                      >
                        {status.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedOrder && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Pedido #{selectedOrder.orderNumber}
                  <Badge variant="outline">{selectedOrder.type}</Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Label className="text-muted-foreground">Estado</Label>
                    <Select
                      value={String(selectedOrder.statusId || "")}
                      onValueChange={(v) => changeStatus(selectedOrder.id, parseInt(v))}
                    >
                      <SelectTrigger className="w-40" data-testid="select-change-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground">Cliente</Label>
                    <span className="text-sm font-medium">{selectedOrder.customerName || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground">Teléfono</Label>
                    <span className="text-sm">{selectedOrder.customerPhone || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground">Monto</Label>
                    <span className="text-sm font-medium">
                      {selectedOrder.totalAmount
                        ? `$${parseFloat(selectedOrder.totalAmount).toLocaleString("es-AR")}`
                        : "-"}
                    </span>
                  </div>
                  {selectedOrder.description && (
                    <div>
                      <Label className="text-muted-foreground">Descripción</Label>
                      <p className="text-sm mt-1">{selectedOrder.description}</p>
                    </div>
                  )}
                  {((selectedOrder as any).createdByScope || getBranchName((selectedOrder as any).createdByBranchId)) && (
                    <div className="flex items-center justify-between">
                      <Label className="text-muted-foreground">Creado desde</Label>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" data-testid="badge-detail-scope">
                          {(selectedOrder as any).createdByScope === "BRANCH" ? "Sucursal" : "Central"}
                        </Badge>
                        {getBranchName((selectedOrder as any).createdByBranchId) && (
                          <span className="text-sm text-muted-foreground">
                            {getBranchName((selectedOrder as any).createdByBranchId)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedOrder.requiresDelivery && (
                    <div className="space-y-2 p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-primary" />
                        <Label className="font-medium">Delivery</Label>
                        {selectedOrder.deliveryStatus && (
                          <Badge variant="secondary">{selectedOrder.deliveryStatus}</Badge>
                        )}
                      </div>
                      {selectedOrder.deliveryAddress && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3 h-3 mt-1 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">
                            {selectedOrder.deliveryAddress}
                            {(selectedOrder as any).deliveryCity && `, ${(selectedOrder as any).deliveryCity}`}
                          </span>
                        </div>
                      )}
                      {selectedOrder.deliveryAddressNotes && (
                        <p className="text-sm text-muted-foreground">{selectedOrder.deliveryAddressNotes}</p>
                      )}
                      {selectedOrder.deliveryAddress && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${selectedOrder.deliveryAddress}${(selectedOrder as any).deliveryCity ? `, ${(selectedOrder as any).deliveryCity}` : ""}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="link-google-maps"
                        >
                          <Button variant="outline" size="sm" type="button" className="w-full mt-1">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Ver en Google Maps
                          </Button>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateTrackingLink(selectedOrder.id)}
                    data-testid="button-generate-tracking"
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    Generar Link
                  </Button>
                  {selectedOrder.publicTrackingId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = `${window.location.origin}/tracking/${selectedOrder.publicTrackingId}`;
                        navigator.clipboard.writeText(link);
                        toast({ title: "Link copiado" });
                      }}
                      data-testid="button-copy-tracking"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar Link
                    </Button>
                  )}
                  {(selectedOrder as any).saleId ? (
                    <Button variant="outline" size="sm" onClick={() => printOrder()}>
                      <Printer className="w-4 h-4 mr-1" />
                      Ticket cliente
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => startSaleFromOrder(selectedOrder)}>
                      VENTA
                    </Button>
                  )}
                  {addonStatus.messaging_whatsapp && !!selectedOrder.customerPhone && messageTemplates.length > 0 && (
                    <Dialog open={whatsDialogOpen} onOpenChange={setWhatsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-send-whatsapp-message">
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Enviar mensaje
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Enviar mensaje</DialogTitle>
                          <DialogDescription>Elegí una plantilla activa para este pedido.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 max-h-72 overflow-auto">
                          {messageTemplates.map((tpl) => (
                            <button
                              key={tpl.id}
                              type="button"
                              className="w-full text-left border rounded-md p-3 hover:bg-muted/40"
                              onClick={() => sendTemplateMessage(tpl)}
                              disabled={renderingTemplateId === tpl.id}
                            >
                              <p className="font-medium">{tpl.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{tpl.body}</p>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(renderedMessage || "");
                              toast({ title: "Mensaje copiado" });
                            }}
                            disabled={!renderedMessage}
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            Copiar mensaje
                          </Button>
                        </div>
                        {renderedMessage && <WhatsAppMessagePreview text={renderedMessage} />}
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                <Tabs defaultValue="comments">
                  <TabsList className="w-full">
                    <TabsTrigger value="comments" className="flex-1" data-testid="tab-comments">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      Comentarios
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex-1" data-testid="tab-history">
                      <History className="w-4 h-4 mr-1" />
                      Historial
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="mt-4 space-y-4">
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Sin comentarios
                        </p>
                      ) : (
                        comments.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-md bg-muted/50 space-y-1"
                            data-testid={`comment-${c.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {c.isPublic ? "Público" : "Interno"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(c.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm">{c.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Nota interna o mensaje para el cliente..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              addComment();
                            }
                          }}
                          data-testid="input-comment"
                        />
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isPublicComment}
                            onChange={(e) => setIsPublicComment(e.target.checked)}
                            className="rounded"
                          />
                          Visible para el cliente
                        </label>
                      </div>
                      <Button
                        size="icon"
                        onClick={addComment}
                        disabled={!newComment.trim()}
                        data-testid="button-send-comment"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {history.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Sin historial de cambios
                        </p>
                      ) : (
                        history.map((h) => {
                          const s = getStatusInfo(h.statusId);
                          return (
                            <div key={h.id} className="flex items-center gap-3 p-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: s.color || "#6B7280" }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{s.name}</p>
                                {h.note && (
                                  <p className="text-xs text-muted-foreground">{h.note}</p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatDate(h.createdAt)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
