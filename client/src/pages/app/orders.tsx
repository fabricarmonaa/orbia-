import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, getToken, useAuth } from "@/lib/auth";
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
import { MediaGroupFieldInput, type MediaGroupItem } from "@/components/orders/MediaGroupFieldInput";
import { CustomerAutocomplete, type CustomerData } from "@/components/orders/CustomerAutocomplete";
import {
  buildFileStorageKeyFromTokens,
  formatMoneyValue,
  parseFileStorageTokens,
  resolveFileFieldBehavior,
  resolveNativeOrderFieldKind,
  resolveOrderFieldDefinition,
} from "@shared/order-fields";
import { pickNextPresetForSelection, resolveOrderCreateLayout } from "./order-create-layout";
import { clearOrderDraft, getOrderDraftKey, loadOrderDraft, saveOrderDraft } from "./order-draft";

type OrderPreset = { id: number; orderTypeId: number; code: string; label: string; isActive: boolean; sortOrder: number };

type OrderPresetField = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME";
  required: boolean;
  sortOrder: number;
  isSystemDefault: boolean;
  visibleInTracking: boolean;
  isActive?: boolean;
  deletedAt?: string | null;
  config?: { allowedExtensions?: string[]; options?: string[]; placeholder?: string; defaultValue?: string | number | null; currencyCode?: string; visibleInForm?: boolean; showWhenEmpty?: boolean };
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

type CustomFieldInputState = {
  valueText?: string;
  valueNumber?: string;
  fileStorageKey?: string | null;
  fileItems?: MediaGroupItem[];
  visibleOverride?: boolean | null;
  attachmentName?: string | null;
  attachmentSizeBytes?: number | null;
  attachmentMimeType?: string | null;
};

type MessageTemplate = {
  id: number;
  name: string;
  body: string;
  isActive: boolean;
};

function emptyOrderDraft(type = "PEDIDO") {
  return {
    type,
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
  };
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { hasFeature } = usePlan();
  const [orders, setOrders] = useState<Array<Order & { statusCode?: string | null; statusName?: string; statusColor?: string }>>([]);
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
  const [customFieldInputs, setCustomFieldInputs] = useState<Record<number, CustomFieldInputState>>({});
  const [detailCustomFields, setDetailCustomFields] = useState<OrderCustomFieldValue[]>([]);
  const presetLoadSeqRef = useRef(0);

  const [newOrder, setNewOrder] = useState(emptyOrderDraft());
  const [hasCashOpen, setHasCashOpen] = useState<boolean | null>(null);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "", email: "" });
  const [draftRestored, setDraftRestored] = useState(false);

  const fieldLayout = useMemo(() => resolveOrderCreateLayout(presetFields), [presetFields]);
  const basePresetFields = fieldLayout.baseFields;
  const customPresetFields = fieldLayout.customFields;
  const customPresetSections = fieldLayout.customSections;
  const currentDraftKey = useMemo(
    () => getOrderDraftKey({ user, type: newOrder.type, presetId: newOrder.orderPresetId }),
    [newOrder.orderPresetId, newOrder.type, user]
  );

  useEffect(() => {
    fetchData();
    void loadPresetsForType(newOrder.type || "PEDIDO");
    // Check if cash session is currently open
    fetch("/api/cash/sessions/current", {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
      .then(async (r) => {
        if (r.status === 204) {
          setHasCashOpen(false);
          return;
        }
        if (!r.ok) throw new Error("No se pudo consultar caja");
        const d = await r.json().catch(() => ({ data: null }));
        setHasCashOpen(!!(d.data?.id));
      })
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

  useEffect(() => {
    if (!dialogOpen || draftRestored) return;
    try {
      const parsed = loadOrderDraft<typeof newOrder, typeof customFieldInputs>({
        user,
        type: newOrder.type,
        presetId: newOrder.orderPresetId,
      });
      if (!parsed) return;
      if (parsed.newOrder) setNewOrder((prev) => ({ ...prev, ...parsed.newOrder }));
      if (parsed.customFieldInputs) setCustomFieldInputs(parsed.customFieldInputs);
    } catch {
      // ignore invalid draft payload
    } finally {
      setDraftRestored(true);
    }
  }, [dialogOpen, draftRestored, newOrder.type, newOrder.orderPresetId, user]);

  useEffect(() => {
    if (!dialogOpen) return;
    try {
      saveOrderDraft(
        { user, type: newOrder.type, presetId: newOrder.orderPresetId },
        { newOrder, customFieldInputs }
      );
    } catch {
      // ignore storage failures
    }
  }, [dialogOpen, newOrder, customFieldInputs, user]);

  async function loadPresetsForType(typeCode: string) {
    const requestId = ++presetLoadSeqRef.current;
    try {
      const res = await apiRequest("GET", `/api/order-presets/types/${encodeURIComponent(typeCode)}/presets`);
      const json = await res.json();
      if (requestId !== presetLoadSeqRef.current) return;
      const list = (json?.data || []).filter((preset: OrderPreset) => preset.isActive);
      setPresets(list);
      const nextPreset = pickNextPresetForSelection(list, newOrder.orderPresetId);
      if (nextPreset) {
        setNewOrder((prev) => ({ ...emptyOrderDraft(typeCode), statusCode: prev.statusCode, orderPresetId: nextPreset.id }));
        await loadFieldsForPreset(nextPreset.id);
      } else {
        setNewOrder((prev) => ({ ...emptyOrderDraft(typeCode), statusCode: prev.statusCode }));
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
    if (!Number.isFinite(presetId) || presetId <= 0) {
      setPresetFields([]);
      setCustomFieldInputs({});
      return;
    }
    try {
      const res = await apiRequest("GET", `/api/order-presets/presets/${presetId}/fields`);
      const json = await res.json();
      const allFields: OrderPresetField[] = json?.data || [];
      setPresetFields(allFields);
      setCustomFieldInputs((prev) => {
        const next: Record<number, CustomFieldInputState> = {};
        for (const f of resolveOrderCreateLayout(allFields).customFields) {
          const resolved = resolveOrderFieldDefinition(f);
          const fileBehavior = resolveFileFieldBehavior(f.config);
          next[f.id] = prev[f.id] || {
            visibleOverride: null,
            valueText: typeof resolved.defaultValue === "string" ? resolved.defaultValue : undefined,
            valueNumber: typeof resolved.defaultValue === "number" ? String(resolved.defaultValue) : undefined,
            fileItems: fileBehavior.mediaMode === "single" ? undefined : [],
          };
        }
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
      const customFields = customPresetFields.map((field) => {
        const raw = customFieldInputs[field.id] || {};
        const fileBehavior = resolveFileFieldBehavior(field.config);
        const resolvedStorageKey = field.fieldType === "FILE"
          ? (
            fileBehavior.mediaMode === "single"
              ? (raw.fileStorageKey || null)
              : buildFileStorageKeyFromTokens((raw.fileItems || []).flatMap((item) => parseFileStorageTokens(item.storageKey)))
          )
          : undefined;
        return {
          fieldId: field.id,
          valueText: ["TEXT", "TEXT_LONG", "DATE", "TIME", "DATETIME", "CHECKBOX", "SELECT"].includes(field.fieldType) ? (raw.valueText || "") : undefined,
          valueNumber: ["NUMBER", "MONEY"].includes(field.fieldType) ? (raw.valueNumber || null) : undefined,
          fileStorageKey: resolvedStorageKey,
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
        draftKey: currentDraftKey,
      };
      if (newOrder.orderPresetId) payload.orderPresetId = newOrder.orderPresetId;

      await apiRequest("POST", "/api/orders", payload);
      toast({ title: "Pedido creado" });
      setDialogOpen(false);
      setNewOrder(emptyOrderDraft("PEDIDO"));
      setCustomFieldInputs({});
      clearOrderDraft({ user, type: newOrder.type, presetId: newOrder.orderPresetId });
      setDraftRestored(false);
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
      const trackingId = data?.data?.publicTrackingId;
      if (!trackingId) throw new Error("No se pudo generar el link de seguimiento");
      const link = data?.data?.publicUrl || `${window.location.origin}/tracking/${trackingId}`;
      try {
        await navigator.clipboard.writeText(link);
        toast({ title: "Link copiado al portapapeles" });
      } catch {
        toast({ title: "Link generado", description: link });
      }
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, publicTrackingId: trackingId } as any);
      }
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
    const matchStatus = filterStatus === "all" || String((o as any).statusCode || "") === filterStatus;
    return matchSearch && matchStatus;
  });

  function getBranchName(branchId: number | null) {
    if (!branchId || branches.length === 0) return null;
    return branches.find((b) => b.id === branchId)?.name || null;
  }

  function getStatusInfo(statusCode: string | null | undefined) {
    const code = String(statusCode || "").trim().toUpperCase();
    const s = statuses.find((st) => String((st as any).code || "").toUpperCase() === code);
    return s || { code, name: code || "Sin estado", label: code || "Sin estado", color: "#6B7280", isActive: false };
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
      const sendMode = data.sendMode || "wa_me_fallback";
      if (sendMode === "official_api_ready") {
        toast({ title: "Canal API activo", description: "Usando fallback wa.me en esta fase." });
      }
      openWhatsApp(data.normalizedPhone, text);
    } catch (err: any) {
      toast({ title: "Error enviando mensaje", description: err.message, variant: "destructive" });
    } finally {
      setRenderingTemplateId(null);
    }
  }

  function getCreateFieldSpanClass(field: OrderPresetField) {
    const kind = resolveNativeOrderFieldKind(field);
    if (kind === "customer" || kind === "description") return "md:col-span-2";
    if (field.fieldType === "TEXT_LONG" || field.fieldType === "FILE" || field.fieldType === "DATETIME") return "md:col-span-2";
    return "";
  }

  function buildOrderAttachmentUrl(orderId: number | string, storageKey: string) {
    const token = parseFileStorageTokens(storageKey).find((current) => current.kind === "att");
    if (!token || orderId === "new") return null;
    return `/api/orders/${orderId}/attachments/${token.id}`;
  }

  function getMediaItemsFromState(field: OrderPresetField, fieldState: CustomFieldInputState) {
    if (fieldState.fileItems && fieldState.fileItems.length > 0) return fieldState.fileItems;
    return parseFileStorageTokens(fieldState.fileStorageKey || null).map((token, index) => ({
      storageKey: token.kind === "att" ? `att:${token.id}` : `draftatt:${token.id}`,
      originalName: index === 0 ? fieldState.attachmentName || field.label : `${field.label} ${index + 1}`,
      mimeType: fieldState.attachmentMimeType || null,
      sizeBytes: fieldState.attachmentSizeBytes || null,
    }));
  }

  function renderPresetField(field: OrderPresetField) {
    const kind = resolveNativeOrderFieldKind(field);
    const resolved = resolveOrderFieldDefinition(field);
    const fileBehavior = resolveFileFieldBehavior(field.config);
    const moneyBadge = kind === "total"
      ? (!newOrder.totalAmount || Number(newOrder.totalAmount) <= 0
        ? "Sin monto"
        : newOrder.paidAmount && Number(newOrder.paidAmount) >= Number(newOrder.totalAmount)
          ? "Saldado ✓"
          : "Deuda")
      : null;

    if (kind === "customer") {
      return (
        <div key={field.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{field.label}{field.required ? " *" : ""}</Label>
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
      );
    }

    if (kind === "phone") {
      return (
        <div key={field.id} className="space-y-2">
          <Label>{field.label}{field.required ? " *" : ""}</Label>
          <Input
            placeholder={resolved.placeholder || "Ej: 11 1234-5678"}
            value={newOrder.customerPhone}
            onChange={(e) => setNewOrder({ ...newOrder, customerPhone: e.target.value })}
            data-testid="input-customer-phone"
          />
        </div>
      );
    }

    if (kind === "description") {
      return (
        <div key={field.id} className="space-y-2">
          <Label>{field.label}{field.required ? " *" : ""}</Label>
          <Textarea
            placeholder={resolved.placeholder || "Ingrese descripción..."}
            value={newOrder.description}
            onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
            data-testid="input-description"
          />
        </div>
      );
    }

    if (kind === "paid" || kind === "total") {
      const isPaid = kind === "paid";
      return (
        <div key={field.id} className="space-y-2 bg-primary/5 border border-primary/20 p-3 rounded-md">
          <div className="flex items-center justify-between">
            <Label>{field.label}{field.required ? " *" : ""}</Label>
            {moneyBadge ? <span className="text-[10px] font-medium opacity-70">{moneyBadge}</span> : null}
          </div>
          <Input
            type="number"
            step="0.01"
            placeholder={resolved.placeholder || (isPaid ? "Monto pagado" : "Monto total")}
            value={isPaid ? newOrder.paidAmount : newOrder.totalAmount}
            min={0}
            max={isPaid ? (newOrder.totalAmount || undefined) : undefined}
            onChange={(e) => {
              if (isPaid) {
                const val = parseFloat(e.target.value);
                const tot = parseFloat(newOrder.totalAmount);
                if (!isNaN(val) && !isNaN(tot) && val > tot) return;
                setNewOrder({ ...newOrder, paidAmount: e.target.value });
                return;
              }
              setNewOrder({ ...newOrder, totalAmount: e.target.value });
            }}
            data-testid={isPaid ? "input-paid-amount" : "input-total-amount"}
          />
          {resolved.normalizedType === "MONEY" && (resolved.currencyCode || "ARS") ? (
            <p className="text-xs text-muted-foreground">Moneda: {resolved.currencyCode || "ARS"}</p>
          ) : null}
        </div>
      );
    }

    const fieldState = customFieldInputs[field.id] || {};
    const mediaItems = getMediaItemsFromState(field, fieldState);
    return (
      <div key={field.id} className="space-y-3 border rounded-md p-3">
        <div className="flex items-center justify-between">
          <Label>{field.label}{field.required ? " *" : ""}</Label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={fieldState.visibleOverride ?? field.visibleInTracking}
              onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), visibleOverride: e.target.checked } }))}
            />
            Mostrar en tracking
          </label>
        </div>
        {field.fieldType === "TEXT" && (
          <Input
            placeholder={resolved.placeholder || undefined}
            value={fieldState.valueText || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
          />
        )}
        {field.fieldType === "TEXT_LONG" && (
          <Textarea
            placeholder={resolved.placeholder || undefined}
            value={fieldState.valueText || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
          />
        )}
        {(field.fieldType === "NUMBER" || field.fieldType === "MONEY") && (
          <Input
            type="number"
            step="0.01"
            placeholder={resolved.placeholder || undefined}
            value={fieldState.valueNumber || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueNumber: e.target.value } }))}
          />
        )}
        {field.fieldType === "DATE" && (
          <Input
            type="date"
            value={fieldState.valueText || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
          />
        )}
        {field.fieldType === "TIME" && (
          <Input
            type="time"
            value={fieldState.valueText || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
          />
        )}
        {field.fieldType === "DATETIME" && (
          <Input
            type="datetime-local"
            value={fieldState.valueText || ""}
            onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.value } }))}
          />
        )}
        {field.fieldType === "SELECT" && (
          <Select value={fieldState.valueText || ""} onValueChange={(value) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: value } }))}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              {((field.config?.options || []) as string[]).map((option) => (
                <SelectItem key={`${field.id}-${option}`} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {field.fieldType === "CHECKBOX" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fieldState.valueText === "true"}
              onChange={(e) => setCustomFieldInputs(prev => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), valueText: e.target.checked ? "true" : "false" } }))}
            />
            Seleccionado
          </label>
        )}
        {field.fieldType === "FILE" && fileBehavior.mediaMode !== "single" && (
          <MediaGroupFieldInput
            orderId="new"
            draftKey={currentDraftKey}
            fieldDefinitionId={field.id}
            allowedExtensions={field.config?.allowedExtensions || ["jpg", "png", "jpeg", "jfif"]}
            acceptMode={fileBehavior.acceptMode}
            maxFiles={fileBehavior.maxFiles}
            items={mediaItems}
            onChange={(items) => setCustomFieldInputs((prev) => ({
              ...prev,
              [field.id]: {
                ...(prev[field.id] || {}),
                fileItems: items,
                fileStorageKey: buildFileStorageKeyFromTokens(items.flatMap((item) => parseFileStorageTokens(item.storageKey))),
                attachmentName: items[0]?.originalName || null,
                attachmentMimeType: null,
                attachmentSizeBytes: null,
              },
            }))}
          />
        )}
        {field.fieldType === "FILE" && fileBehavior.mediaMode === "single" && (
          <FileFieldInput
            orderId="new"
            draftKey={currentDraftKey}
            fieldDefinitionId={field.id}
            allowedExtensions={field.config?.allowedExtensions || ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"]}
            currentAttachmentId={fieldState.fileStorageKey || null}
            currentAttachmentName={fieldState.attachmentName || null}
            onUploadSuccess={(result) => setCustomFieldInputs(prev => ({
              ...prev,
              [field.id]: {
                ...(prev[field.id] || {}),
                fileStorageKey: result.storageKey,
                attachmentName: result.originalName || null,
                attachmentMimeType: result.mimeType || null,
                attachmentSizeBytes: result.sizeBytes || null,
              },
            }))}
            onRemoveSuccess={() => setCustomFieldInputs(prev => ({
              ...prev,
              [field.id]: {
                ...(prev[field.id] || {}),
                fileStorageKey: null,
                attachmentName: null,
                attachmentMimeType: null,
                attachmentSizeBytes: null,
              },
            }))}
          />
        )}
      </div>
    );
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
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setDraftRestored(false);
            }}
          >
            <DialogTrigger asChild>
              <Button data-testid="button-create-order">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Pedido
              </Button>
            </DialogTrigger>
            <DialogContent
              className="w-[96vw] max-w-6xl max-h-[92vh] overflow-hidden p-0"
            >
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle>Crear Pedido</DialogTitle>
                <DialogDescription>Organizá los datos del sistema a la izquierda y la personalización del preset a la derecha.</DialogDescription>
              </DialogHeader>
              <form onSubmit={createOrder} className="flex h-full max-h-[calc(92vh-84px)] flex-col">
                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <div className="space-y-4" data-testid="order-create-system-column">
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold">Sistema</h3>
                            <p className="text-xs text-muted-foreground">Tipo, preset, estado y campos base activos del tipo seleccionado.</p>
                          </div>
                          <Badge variant="secondary">Base</Badge>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={newOrder.type} onValueChange={(v) => { setDraftRestored(false); setNewOrder((prev) => ({ ...emptyOrderDraft(v), statusCode: prev.statusCode })); setPresetFields([]); setCustomFieldInputs({}); void loadPresetsForType(v); }}>
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
                                  const pid = Number(v);
                                  if (!Number.isFinite(pid) || pid <= 0) {
                                    setNewOrder((prev) => ({ ...prev, orderPresetId: undefined }));
                                    setPresetFields([]);
                                    setCustomFieldInputs({});
                                    return;
                                  }
                                  setDraftRestored(false);
                                  setNewOrder((prev) => ({ ...emptyOrderDraft(prev.type), statusCode: prev.statusCode, orderPresetId: pid }));
                                  setCustomFieldInputs({});
                                  void loadFieldsForPreset(pid);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {presets.map((p) => (
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
                                    {(s as any).label || s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {basePresetFields.length > 0 ? (
                        <div className="rounded-xl border bg-card p-4 shadow-sm">
                          <div className="mb-4">
                            <h3 className="text-sm font-semibold">Campos base</h3>
                            <p className="text-xs text-muted-foreground">Solo se muestran campos nativos activos, no borrados y visibles en formulario.</p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {basePresetFields.map((field) => (
                              <div key={field.id} className={getCreateFieldSpanClass(field)}>
                                {renderPresetField(field)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {addonStatus.delivery && (
                        <div className="rounded-xl border bg-muted/40 p-4 shadow-sm">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <Label className="text-sm">Delivery</Label>
                                <p className="text-xs text-muted-foreground">Activá la entrega solo si corresponde a este pedido.</p>
                              </div>
                            </div>
                            <Switch
                              checked={newOrder.requiresDelivery}
                              onCheckedChange={(v) => setNewOrder({ ...newOrder, requiresDelivery: v })}
                              data-testid="switch-requires-delivery"
                            />
                          </div>
                          {newOrder.requiresDelivery && (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-2">
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
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4" data-testid="order-create-custom-column">
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold">Personalización del preset</h3>
                            <p className="text-xs text-muted-foreground">Campos custom activos del preset actual, agrupados por sección cuando exista configuración.</p>
                          </div>
                          <Badge variant="outline">{customPresetFields.length} campo{customPresetFields.length === 1 ? "" : "s"}</Badge>
                        </div>

                        {customPresetSections.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Este preset no agrega campos personalizados visibles en formulario.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {customPresetSections.map((section) => (
                              <section key={section.key} className="rounded-lg border bg-muted/20 p-4">
                                <div className="mb-3">
                                  <h4 className="text-sm font-semibold">{section.label}</h4>
                                  <p className="text-xs text-muted-foreground">Campos configurados específicamente para este preset.</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {section.fields.map((field) => (
                                    <div key={field.id} className={getCreateFieldSpanClass(field)}>
                                      {renderPresetField(field)}
                                    </div>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      El formulario respeta tipo, preset, orden, active/inactive, deletedAt y visibleInForm.
                    </p>
                    <Button type="submit" className="w-full sm:w-auto min-w-[220px]" data-testid="button-submit-order">
                      Crear Pedido
                    </Button>
                  </div>
                </div>
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
              <SelectItem key={s.id} value={String((s as any).code || "")}>
                {(s as any).label || s.name}
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
            const status = getStatusInfo((order as any).statusCode);
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
                        {((status as any).label || status.name)}
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
                      value={String((selectedOrder as any).statusCode || "")}
                      onValueChange={(v) => { void changeStatus(selectedOrder.id, v); }}
                    >
                      <SelectTrigger className="w-56" data-testid="select-change-status">
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses
                          .filter((s) => (s as any).isActive !== false)
                          .map((s) => (
                            <SelectItem key={s.id} value={String(s.code || "")}>
                              {(s as any).label || s.name}
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
                            parseFileStorageTokens(f.fileStorageKey || null).length > 1 ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {parseFileStorageTokens(f.fileStorageKey || null).map((token, index) => {
                                  const storageKey = `${token.kind}:${token.id}`;
                                  const downloadUrl = buildOrderAttachmentUrl(selectedOrder?.id || "new", storageKey);
                                  return (
                                    <a
                                      key={storageKey}
                                      href={downloadUrl || "#"}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                                    >
                                      {`${f.label || "Archivo"} ${index + 1}`}
                                    </a>
                                  );
                                })}
                              </div>
                            ) : (
                              <FileFieldInput
                                orderId={selectedOrder?.id || "new"}
                                fieldDefinitionId={f.fieldId}
                                currentAttachmentId={f.fileStorageKey}
                                currentAttachmentName={String((f as any).valueText || f.label || "Archivo adjunto")}
                                allowedExtensions={(f as any).config?.allowedExtensions || ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"]}
                                onUploadSuccess={() => {
                                  if (selectedOrder) openDetail(selectedOrder);
                                }}
                                onRemoveSuccess={async () => {
                                  try {
                                    if (selectedOrder) await openDetail(selectedOrder);
                                  } catch (e: any) {
                                    // refresh best-effort
                                  }
                                }}
                              />
                            )
                          ) : (
                            <span className="break-all">
                              {f.fieldType === "MONEY"
                                ? (f.valueNumber ? formatMoneyValue(f.valueNumber) : "-")
                                : (f.valueText || f.valueNumber || "-")}
                            </span>
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
                          const s = getStatusInfo((h as any).statusCode || (h as any).status_code || "");
                          return (
                            <div key={h.id} className="flex items-center gap-3 p-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: s.color || "#6B7280" }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{(s as any).label || s.name}</p>
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
