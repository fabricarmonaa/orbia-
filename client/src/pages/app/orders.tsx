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
  ShoppingCart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppMessagePreview } from "@/components/messaging/WhatsAppMessagePreview";
import type { Order, OrderStatus, OrderComment, OrderStatusHistory, Branch } from "@shared/schema";
import { FileFieldInput } from "@/components/orders/FileFieldInput";
import { CustomerAutocomplete, type CustomerData } from "@/components/orders/CustomerAutocomplete";

type OrderPreset = { id: number; orderTypeId: number; code: string; label: string; isActive: boolean; sortOrder: number };

type OrderPresetField = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "FILE";
  required: boolean;
  sortOrder: number;
  isSystemDefault: boolean;
  visibleInTracking: boolean;
  config?: { allowedExtensions?: string[] };
};

type OrderCustomFieldValue = {
  fieldId: number;
  fieldKey?: string | null;
  label?: string | null;
  fieldType?: string | null;
  valueText?: string | null;
  valueNumber?: string | null;
  fileStorageKey?: string | null;
  visibleOverride?: boolean | null;
};

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
  const [statuses, setStatuses] = useState<(OrderStatus & { code?: string; label?: string })[]>([]);
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
  const [presets, setPresets] = useState<OrderPreset[]>([]);
  const [presetFields, setPresetFields] = useState<OrderPresetField[]>([]);
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<number, { valueText?: string; valueNumber?: string; fileStorageKey?: string; visibleOverride?: boolean | null }>>({});
  const [detailCustomFields, setDetailCustomFields] = useState<OrderCustomFieldValue[]>([]);

  const [newOrder, setNewOrder] = useState({
    type: "PEDIDO",
    orderPresetId: undefined as number | undefined,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    description: "",
    totalAmount: "",
    paidAmount: "",
    statusCode: "",
    requiresDelivery: false,
    deliveryAddress: "",
    deliveryCity: "",
    deliveryAddressNotes: "",
  });
  const [hasCashOpen, setHasCashOpen] = useState<boolean | null>(null);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "", email: "" });

  useEffect(() => {
    fetchData();
    void loadPresetsForType(newOrder.type || "PEDIDO");
    // Check if cash session is currently open
    apiRequest("GET", "/api/cash/sessions/current")
      .then((r) => r.json())
      .then((d) => setHasCashOpen(!!(d.data?.id)))
      .catch(() => setHasCashOpen(false));
    apiRequest("GET", "/api/addons/status")
      .then((r) => r.json())
      .then((d) => {
        const addons = d.data || {};
        setAddonStatus(addons);
        if (addons.messaging_whatsapp) {
          apiRequest("GET", "/api/message-templates")
            .then((r) => r.json())
            .then((tpl) => setMessageTemplates((tpl.data || []).filter((x: MessageTemplate) => x.isActive)))
            .catch(() => { });
        }
      })
      .catch(() => { });
  }, []);

  async function loadPresetsForType(typeCode: string) {
    try {
      const res = await apiRequest("GET", `/api/order-presets/types/${encodeURIComponent(typeCode)}/presets`);
      const json = await res.json();
      const list = json?.data || [];
      setPresets(list);
      if (list.length > 0) {
        const toSelect = list.find((p: any) => p.isActive) || list[0];
        setNewOrder((prev) => ({ ...prev, orderPresetId: toSelect.id }));
        await loadFieldsForPreset(toSelect.id);
      } else {
        setNewOrder((prev) => ({ ...prev, orderPresetId: undefined }));
        setPresetFields([]);
        setCustomFieldInputs({});
      }
    } catch {
      setPresets([]);
      setPresetFields([]);
      setCustomFieldInputs({});
    }
  }

  async function loadFieldsForPreset(presetId: number) {
    try {
      const res = await apiRequest("GET", `/api/order-presets/presets/${presetId}/fields`);
      const json = await res.json();
      const allFields: OrderPresetField[] = json?.data || [];
      const fields = allFields.filter((f) => !f.isSystemDefault);
      setPresetFields(fields);
      setCustomFieldInputs((prev) => {
        const next: Record<number, { valueText?: string; valueNumber?: string; fileStorageKey?: string; visibleOverride?: boolean | null }> = {};
        for (const f of fields) next[f.id] = prev[f.id] || { visibleOverride: null };
        return next;
      });
    } catch {
      setPresetFields([]);
      setCustomFieldInputs({});
    }
  }

  async function fetchData() {
    try {
      const [ordersRes, statusesRes, branchesRes] = await Promise.all([
        apiRequest("GET", "/api/orders"),
        apiRequest("GET", "/api/order-statuses?includeInactive=1"),
        apiRequest("GET", "/api/branches").catch(() => ({ json: () => ({ data: [] }) })),
      ]);
      const ordersData = await ordersRes.json();
      const statusesData = await statusesRes.json();
      const branchesData = await branchesRes.json();
      const nextOrders = ordersData.data || [];
      setOrders(nextOrders);
      if (selectedOrder) {
        const refreshedSelected = nextOrders.find((o: Order) => o.id === selectedOrder.id);
        if (refreshedSelected) setSelectedOrder(refreshedSelected);
      }
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
    // Cash warning: if paying something and no cash session open
    if (newOrder.paidAmount && parseFloat(newOrder.paidAmount) > 0 && hasCashOpen === false) {
      toast({
        title: "Caja cerrada",
        description: "Este pago no va a quedar registrado en la caja porque no hay una sesión abierta. Abrí la caja si querés registrar el movimiento.",
        variant: "destructive",
        duration: 7000,
      });
    }
    try {
      const customFields = presetFields.map((field) => {
        const raw = customFieldInputs[field.id] || {};
        return {
          fieldId: field.id,
          valueText: field.fieldType === "TEXT" ? (raw.valueText || "") : undefined,
          valueNumber: field.fieldType === "NUMBER" ? (raw.valueNumber || null) : undefined,
          fileStorageKey: field.fieldType === "FILE" ? (raw.fileStorageKey || null) : undefined,
          visibleOverride: raw.visibleOverride !== undefined ? raw.visibleOverride : null,
        };
      });

      const payload: any = {
        ...newOrder,
        orderTypeCode: newOrder.type,
        totalAmount: newOrder.totalAmount ? parseFloat(newOrder.totalAmount) : null,
        paidAmount: newOrder.paidAmount ? parseFloat(newOrder.paidAmount) : null,
        statusCode: newOrder.statusCode || null,
        requiresDelivery: newOrder.requiresDelivery,
        deliveryAddress: newOrder.requiresDelivery ? newOrder.deliveryAddress : null,
        deliveryCity: newOrder.requiresDelivery ? newOrder.deliveryCity : null,
        deliveryAddressNotes: newOrder.requiresDelivery ? newOrder.deliveryAddressNotes : null,
        customFields,
      };
      if (newOrder.orderPresetId) payload.orderPresetId = newOrder.orderPresetId;

      await apiRequest("POST", "/api/orders", payload);
      toast({ title: "Pedido creado" });
      setDialogOpen(false);
      setNewOrder({ type: "PEDIDO", orderPresetId: undefined, customerName: "", customerPhone: "", customerEmail: "", description: "", totalAmount: "", paidAmount: "", statusCode: "", requiresDelivery: false, deliveryAddress: "", deliveryCity: "", deliveryAddressNotes: "" });
      setCustomFieldInputs({});
      await loadPresetsForType("PEDIDO");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function openDetail(order: Order) {
    setSelectedOrder(order);
    setDetailOpen(true);
    try {
      const [commentsRes, historyRes, customRes] = await Promise.all([
        apiRequest("GET", `/api/orders/${order.id}/comments`),
        apiRequest("GET", `/api/orders/${order.id}/history`),
        apiRequest("GET", `/api/orders/${order.id}/custom-fields`).catch(() => ({ json: async () => ({ data: { customFields: [] } }) } as any)),
      ]);
      const commentsData = await commentsRes.json();
      const historyData = await historyRes.json();
      const customData = await customRes.json();
      setComments(commentsData.data || []);
      setHistory(historyData.data || []);
      setDetailCustomFields(customData?.data?.customFields || []);
    } catch { }
  }

  async function changeStatus(orderId: number, statusCode: string) {
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { statusCode });
      toast({ title: "Estado actualizado" });
      await fetchData();
      if (selectedOrder?.id === orderId) {
        const historyRes = await apiRequest("GET", `/api/orders/${orderId}/history`);
        const historyData = await historyRes.json();
        setHistory(historyData.data || []);
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
    const printWindow = window.open(printUrl, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast({ title: "No pudimos abrir el ticket", description: "Desbloqueá las ventanas emergentes para este sitio.", variant: "destructive" });
      return;
    }
    printWindow.focus();
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
    return s || { name: "Sin estado", color: "#6B7280", isActive: false };
  }

  function getStatusCodeById(statusId: number | null | undefined) {
    if (!statusId) return "";
    return statuses.find((st) => st.id === statusId)?.code || "";
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
            <DialogContent
              className="max-w-lg max-h-[90vh] overflow-y-auto"
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                // Allow interactions with shadcn portal elements (Select, Popover, etc.)
                const target = e.target as HTMLElement;
                if (target && document.querySelector('[data-radix-popper-content-wrapper]')?.contains(target)) {
                  return;
                }
                e.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>Crear Pedido</DialogTitle>
              </DialogHeader>
              <form onSubmit={createOrder} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={newOrder.type} onValueChange={(v) => { setNewOrder({ ...newOrder, type: v }); void loadPresetsForType(v); }}>
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
                  {presets.length > 0 && (
                    <div className="space-y-2">
                      <Label>Preset</Label>
                      <Select
                        value={newOrder.orderPresetId ? String(newOrder.orderPresetId) : ""}
                        onValueChange={(v) => {
                          const pid = parseInt(v);
                          setNewOrder({ ...newOrder, orderPresetId: pid });
                          void loadFieldsForPreset(pid);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar preset..." />
                        </SelectTrigger>
                        <SelectContent>
                          {presets.filter(p => p.isActive).map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={newOrder.statusCode} onValueChange={(v) => setNewOrder({ ...newOrder, statusCode: v })}>
                      <SelectTrigger data-testid="select-order-status">
                        <SelectValue placeholder="Estado inicial" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.filter((s) => (s as any).isActive !== false).map((s) => (
                          <SelectItem key={s.id} value={String(s.code || "")}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Cliente</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={() => setQuickAddCustomerOpen(true)}
                      title="Agregar cliente nuevo"
                    >
                      + Nuevo cliente
                    </button>
                  </div>
                  <CustomerAutocomplete
                    value={newOrder.customerName}
                    onChange={(val, customer) => {
                      setNewOrder({
                        ...newOrder,
                        customerName: val,
                        customerPhone: customer?.phone || newOrder.customerPhone,
                        customerEmail: customer?.email || newOrder.customerEmail,
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Buscá un cliente existente o ingresá uno nuevo.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Teléfono (Opcional)</Label>
                    <Input
                      placeholder="Ej: 11 1234-5678"
                      value={newOrder.customerPhone}
                      onChange={(e) => setNewOrder({ ...newOrder, customerPhone: e.target.value })}
                      data-testid="input-customer-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monto Total</Label>
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
                <div className="space-y-2 bg-primary/5 border border-primary/20 p-3 rounded-md">
                  <div className="flex items-center justify-between">
                    <Label>Seña / Monto pagado</Label>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {!newOrder.totalAmount || Number(newOrder.totalAmount) <= 0
                        ? "Sin monto"
                        : newOrder.paidAmount && Number(newOrder.paidAmount) >= Number(newOrder.totalAmount)
                          ? "Pago Completo ✓"
                          : newOrder.paidAmount && Number(newOrder.paidAmount) > 0
                            ? `$${newOrder.paidAmount} / $${newOrder.totalAmount}`
                            : "Impago"}
                    </span>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Dejar en 0 si no pagó nada"
                    value={newOrder.paidAmount}
                    min={0}
                    max={newOrder.totalAmount || undefined}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const tot = parseFloat(newOrder.totalAmount);
                      if (!isNaN(val) && !isNaN(tot) && val > tot) return;
                      setNewOrder({ ...newOrder, paidAmount: e.target.value });
                    }}
                    data-testid="input-paid-amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    placeholder="Ingrese descripción..."
                    value={newOrder.description}
                    onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
                    data-testid="input-description"
                  />
                </div>
                {presetFields.length > 0 && (
                  <div className="space-y-3 border rounded-md p-3">
                    <p className="text-sm font-medium">Campos adicionales</p>
                    {presetFields.map((field) => (
                      <div key={field.id} className="space-y-3 border-b border-muted pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <Label>{field.label}{field.required ? " *" : ""}</Label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={customFieldInputs[field.id]?.visibleOverride ?? field.visibleInTracking}
                              onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), visibleOverride: e.target.checked } }))}
                            />
                            Visible
                          </label>
                        </div>
                        {field.fieldType === "TEXT" ? (
                          <Input
                            value={customFieldInputs[field.id]?.valueText || ""}
                            onChange={(e) => setCustomFieldInputs((prev) => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
                          />
                        ) : field.fieldType === "NUMBER" ? (
                          <Input
                            type="number"
                            value={customFieldInputs[field.id]?.valueNumber || ""}
                            onChange={(e) => setCustomFieldInputs((prev) => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueNumber: e.target.value } }))}
                          />
                        ) : (
                          <FileFieldInput
                            orderId={"new"}
                            fieldDefinitionId={field.id}
                            allowedExtensions={field.config?.allowedExtensions || ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"]}
                            onUploadSuccess={() => { }}
                            onRemove={() => { }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                            placeholder="Ingrese calle"
                            value={newOrder.deliveryAddress}
                            onChange={(e) => setNewOrder({ ...newOrder, deliveryAddress: e.target.value })}
                            data-testid="input-delivery-address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ciudad</Label>
                          <Input
                            placeholder="Ciudad"
                            value={newOrder.deliveryCity}
                            onChange={(e) => setNewOrder({ ...newOrder, deliveryCity: e.target.value })}
                            data-testid="input-delivery-city"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Notas para el delivery</Label>
                          <Input
                            placeholder="Piso, Depto, Descripción"
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

          {/* Quick-add customer dialog */}
          <Dialog open={quickAddCustomerOpen} onOpenChange={setQuickAddCustomerOpen}>
            <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Agregar cliente rápido</DialogTitle>
                <DialogDescription>Completá los datos del nuevo cliente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nombre *</Label>
                  <Input
                    value={quickCustomer.name}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, name: e.target.value })}
                    placeholder="Nombre completo"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label>Teléfono (opcional)</Label>
                  <Input
                    value={quickCustomer.phone}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, phone: e.target.value })}
                    placeholder="Ej: 11 1234-5678"
                    type="tel"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email (opcional)</Label>
                  <Input
                    value={quickCustomer.email}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                    type="email"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setQuickAddCustomerOpen(false)}>Cancelar</Button>
                <Button
                  disabled={!quickCustomer.name.trim()}
                  onClick={async () => {
                    try {
                      await apiRequest("POST", "/api/customers", {
                        name: quickCustomer.name.trim(),
                        phone: quickCustomer.phone.trim() || null,
                        email: quickCustomer.email.trim() || null,
                      });
                      setNewOrder({
                        ...newOrder,
                        customerName: quickCustomer.name.trim(),
                        customerPhone: quickCustomer.phone.trim(),
                        customerEmail: quickCustomer.email.trim(),
                      });
                      setQuickCustomer({ name: "", phone: "", email: "" });
                      setQuickAddCustomerOpen(false);
                      toast({ title: "Cliente agregado" });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  Agregar
                </Button>
              </div>
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
            {statuses.filter((s) => (s as any).isActive !== false).map((s) => (
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
                        {status.name}{(status as any).isActive === false && status.name !== "Sin estado" ? " (inactivo)" : ""}
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
                      value={getStatusCodeById(selectedOrder.statusId)}
                      onValueChange={(v) => changeStatus(selectedOrder.id, v)}
                    >
                      <SelectTrigger className="w-40" data-testid="select-change-status">
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses
                          .filter((s) => (s as any).isActive !== false || s.id === selectedOrder.statusId)
                          .map((s) => (
                          <SelectItem key={s.id} value={String(s.code || "")}>
                            {(s as any).isActive === false ? `${s.name} (inactivo)` : s.name}
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
                    <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); printOrder(); }}>
                      <Printer className="w-4 h-4 mr-1" />
                      Imprimir Ticket Venta
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); startSaleFromOrder(selectedOrder); }}>
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      Iniciar Venta
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

                {detailCustomFields.length > 0 && (
                  <div className="space-y-4 border rounded-md p-3">
                    <p className="text-sm font-medium">Campos adicionales</p>
                    <div className="space-y-3">
                      {detailCustomFields.map((f) => (
                        <div key={`${f.fieldId}-${f.fieldKey || "x"}`} className="text-sm flex flex-col justify-between gap-1 border-b border-muted pb-3 last:border-0 last:pb-0">
                          <span className="text-muted-foreground font-medium">{f.label || f.fieldKey || `Campo ${f.fieldId}`}</span>
                          {f.fieldType === "FILE" ? (
                            <FileFieldInput
                              orderId={selectedOrder?.id || "new"}
                              fieldDefinitionId={f.fieldId}
                              currentAttachmentId={f.fileStorageKey}
                              allowedExtensions={(f as any).config?.allowedExtensions || ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"]}
                              onUploadSuccess={(attId) => {
                                if (selectedOrder) openDetail(selectedOrder);
                              }}
                              onRemove={async () => {
                                try {
                                  if (!f.fileStorageKey || !selectedOrder) return;
                                  const rawAttId = f.fileStorageKey.replace("att:", "");
                                  await apiRequest("DELETE", `/api/orders/${selectedOrder.id}/attachments/${rawAttId}`);
                                  openDetail(selectedOrder);
                                } catch (e: any) {
                                  // Handled by toast if needed, but the apiRequest throws if not OK
                                }
                              }}
                            />
                          ) : (
                            <span className="break-all">{f.valueText || f.valueNumber || "-"}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
