import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin,
  Camera,
  CheckCircle,
  Package,
  LogOut,
  Route,
  History,
  Plus,
  X,
  Navigation,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { parseApiError } from "@/lib/api-errors";

interface DeliveryAgentInfo {
  id: number;
  firstName: string;
  lastName: string;
  dni: string;
  tenantId: number;
}

function deliveryApiRequest(method: string, url: string, data?: unknown, isFormData?: boolean): Promise<Response> {
  const token = localStorage.getItem("delivery_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (data && !isFormData) headers["Content-Type"] = "application/json";

  return fetch(url, {
    method,
    headers,
    body: isFormData ? (data as FormData) : data ? JSON.stringify(data) : undefined,
  }).then(async (res) => {
    if (!res.ok) {
      const info = await parseApiError(res);
      throw new Error(info.message);
    }
    return res;
  });
}

function buildGoogleMapsUrl(order: any): string | null {
  if (!order?.deliveryAddress) return null;
  const parts = [order.deliveryAddress];
  if (order.deliveryCity) parts.push(order.deliveryCity);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

export default function DeliveryPanel() {
  const [, setLocation] = useLocation();
  const [agent, setAgent] = useState<DeliveryAgentInfo | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [orbiaLogoUrl, setOrbiaLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [activeRoute, setActiveRoute] = useState<any>(null);
  const [routeHistory, setRouteHistory] = useState<any[]>([]);
  const [actionStates, setActionStates] = useState<any[]>([]);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [currentStop, setCurrentStop] = useState<any>(null);
  const [selectedAction, setSelectedAction] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionPhoto, setActionPhoto] = useState<File | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("delivery_token");
    const agentStr = localStorage.getItem("delivery_agent");
    const tenant = localStorage.getItem("delivery_tenant_name") || "";
    if (!token || !agentStr) {
      setLocation("/delivery/login");
      return;
    }
    try {
      setAgent(JSON.parse(agentStr));
      setTenantName(tenant);
    } catch {
      setLocation("/delivery/login");
      return;
    }

    fetch("/api/branding/app")
      .then((res) => res.json())
      .then((data) => setOrbiaLogoUrl(data?.data?.orbiaLogoUrl || null))
      .catch(() => setOrbiaLogoUrl(null));

    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [availRes, activeRes, historyRes, statesRes] = await Promise.all([
        deliveryApiRequest("GET", "/api/delivery/orders/available"),
        deliveryApiRequest("GET", "/api/delivery/routes/active"),
        deliveryApiRequest("GET", "/api/delivery/routes/history"),
        deliveryApiRequest("GET", "/api/delivery/agent/action-states"),
      ]);
      setAvailableOrders((await availRes.json()).data || []);
      setActiveRoute((await activeRes.json()).data);
      setRouteHistory((await historyRes.json()).data || []);
      setActionStates((await statesRes.json()).data || []);
    } catch (err: any) {
      if (err.message.includes("401") || err.message.includes("403")) {
        handleLogout();
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("delivery_token");
    localStorage.removeItem("delivery_agent");
    localStorage.removeItem("delivery_tenant_name");
    setLocation("/delivery/login");
  }

  function toggleOrderSelection(orderId: number) {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  }

  async function createRoute() {
    if (selectedOrderIds.length === 0) {
      toast({ title: "Seleccioná al menos un pedido", variant: "destructive" });
      return;
    }
    setCreatingRoute(true);
    try {
      await deliveryApiRequest("POST", "/api/delivery/routes", { orderIds: selectedOrderIds });
      toast({ title: "Ruta creada" });
      setSelectedOrderIds([]);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingRoute(false);
    }
  }

  function openActionDialog(stop: any) {
    setCurrentStop(stop);
    setSelectedAction("");
    setActionNotes("");
    setActionPhoto(null);
    setActionDialogOpen(true);
  }

  async function submitAction() {
    if (!currentStop || !selectedAction || !activeRoute) return;
    const actionState = actionStates.find((s: any) => s.code === selectedAction);
    if (actionState?.requiresPhoto && !actionPhoto) {
      toast({ title: "Esta acción requiere una foto", variant: "destructive" });
      return;
    }
    setSubmittingAction(true);
    try {
      const formData = new FormData();
      formData.append("actionCode", selectedAction);
      if (actionNotes) formData.append("notes", actionNotes);
      if (actionPhoto) formData.append("photo", actionPhoto);

      await deliveryApiRequest(
        "POST",
        `/api/delivery/routes/${activeRoute.id}/stops/${currentStop.id}/action`,
        formData,
        true
      );
      toast({ title: "Acción registrada" });
      setActionDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingAction(false);
    }
  }

  async function completeRoute() {
    if (!activeRoute) return;
    try {
      await deliveryApiRequest("POST", `/api/delivery/routes/${activeRoute.id}/complete`);
      toast({ title: "Ruta completada" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function formatDate(d: string | Date | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between gap-4 h-14">
            <div className="flex items-center gap-3">
              <img
                src={orbiaLogoUrl || "/icons/tenant/icon-180.png"}
                alt="Orbia"
                className="w-7 h-7 rounded object-cover bg-muted"
              />
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{agent.firstName} {agent.lastName}</p>
                <p className="text-xs text-muted-foreground truncate">{tenantName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-delivery-logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
          </div>
        ) : (
          <Tabs defaultValue={activeRoute ? "route" : "orders"}>
            <TabsList className="w-full">
              <TabsTrigger value="orders" className="flex-1" data-testid="tab-available-orders">
                <Package className="w-4 h-4 mr-1" />
                Pedidos
              </TabsTrigger>
              <TabsTrigger value="route" className="flex-1" data-testid="tab-active-route">
                <Route className="w-4 h-4 mr-1" />
                Ruta Activa
                {activeRoute && (
                  <Badge variant="secondary" className="ml-1">{activeRoute.stops?.length || 0}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1" data-testid="tab-route-history">
                <History className="w-4 h-4 mr-1" />
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-4 space-y-4">
              {activeRoute && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-3">
                    <p className="text-sm font-medium">Ya tenés una ruta activa con {activeRoute.stops?.length || 0} paradas. Completala antes de crear otra.</p>
                  </CardContent>
                </Card>
              )}

              {availableOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No hay pedidos disponibles</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Seleccioná los pedidos para armar tu ruta
                  </p>
                  <div className="space-y-2">
                    {availableOrders.map((order: any) => {
                      const selected = selectedOrderIds.includes(order.id);
                      return (
                        <Card
                          key={order.id}
                          className={`cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "hover-elevate"}`}
                          onClick={() => !activeRoute && toggleOrderSelection(order.id)}
                          data-testid={`card-available-order-${order.id}`}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                  selected ? "bg-primary text-primary-foreground" : "bg-muted"
                                }`}>
                                  <span className="text-xs font-bold">#{order.orderNumber}</span>
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{order.customerName || "Sin nombre"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {order.deliveryAddress
                                      ? `${order.deliveryAddress}${order.deliveryCity ? `, ${order.deliveryCity}` : ""}`
                                      : order.customerPhone || "Sin dirección"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {order.branchName && (
                                  <Badge variant="outline" className="text-xs">{order.branchName}</Badge>
                                )}
                                {buildGoogleMapsUrl(order) && (
                                  <a
                                    href={buildGoogleMapsUrl(order)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`link-maps-order-${order.id}`}
                                  >
                                    <Button size="icon" variant="ghost" type="button">
                                      <Navigation className="w-4 h-4" />
                                    </Button>
                                  </a>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {!activeRoute && selectedOrderIds.length > 0 && (
                    <Button
                      className="w-full"
                      onClick={createRoute}
                      disabled={creatingRoute}
                      data-testid="button-create-route"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {creatingRoute ? "Creando ruta..." : `Crear Ruta (${selectedOrderIds.length} pedidos)`}
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="route" className="mt-4 space-y-4">
              {!activeRoute ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Route className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No tenés una ruta activa</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Seleccioná pedidos en la pestaña anterior para crear una ruta
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="font-semibold">Ruta #{activeRoute.id}</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(activeRoute.startedAt)}</p>
                    </div>
                    <Badge>{activeRoute.stops?.length || 0} paradas</Badge>
                  </div>

                  <div className="space-y-2">
                    {(activeRoute.stops || []).map((stop: any, idx: number) => {
                      const done = !!stop.actionStateId;
                      const order = stop.order;
                      return (
                        <Card
                          key={stop.id}
                          className={done ? "opacity-60" : ""}
                          data-testid={`card-stop-${stop.id}`}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  done ? "bg-chart-2/20 text-chart-2" : "bg-muted"
                                }`}>
                                  {done ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <span className="text-xs font-bold">{idx + 1}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    #{order?.orderNumber} - {order?.customerName || "Sin nombre"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {order?.deliveryAddress
                                      ? `${order.deliveryAddress}${order.deliveryCity ? `, ${order.deliveryCity}` : ""}`
                                      : order?.customerPhone || "Sin dirección"}
                                  </p>
                                  {order?.deliveryAddressNotes && (
                                    <p className="text-xs text-muted-foreground/70 italic">{order.deliveryAddressNotes}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {buildGoogleMapsUrl(order) && (
                                  <a
                                    href={buildGoogleMapsUrl(order)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid={`link-maps-stop-${stop.id}`}
                                  >
                                    <Button size="icon" variant="ghost" type="button">
                                      <Navigation className="w-4 h-4" />
                                    </Button>
                                  </a>
                                )}
                                {!done ? (
                                  <Button
                                    size="sm"
                                    onClick={() => openActionDialog(stop)}
                                    data-testid={`button-action-stop-${stop.id}`}
                                  >
                                    Marcar
                                  </Button>
                                ) : (
                                  <Badge variant="secondary">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Completado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {activeRoute.stops?.every((s: any) => s.actionStateId) && (
                    <Button
                      className="w-full"
                      onClick={completeRoute}
                      data-testid="button-complete-route"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Finalizar Ruta
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-4">
              {routeHistory.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <History className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No hay rutas completadas</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {routeHistory.map((route: any) => (
                    <Card key={route.id} data-testid={`card-history-route-${route.id}`}>
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="font-medium text-sm">Ruta #{route.id}</p>
                            <p className="text-xs text-muted-foreground">
                              Completada: {formatDate(route.completedAt)}
                            </p>
                          </div>
                          <Badge variant="secondary">Completada</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar Acción - Pedido #{currentStop?.order?.orderNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Acción</Label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger data-testid="select-action-code">
                  <SelectValue placeholder="Seleccionar acción" />
                </SelectTrigger>
                <SelectContent>
                  {actionStates.map((state: any) => (
                    <SelectItem key={state.id} value={state.code}>{state.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAction && actionStates.find((s: any) => s.code === selectedAction)?.requiresPhoto && (
              <div className="space-y-2">
                <Label>Foto de prueba</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                    data-testid="button-select-photo"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {actionPhoto ? actionPhoto.name : "Seleccionar foto"}
                  </Button>
                  {actionPhoto && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setActionPhoto(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setActionPhoto(f);
                  }}
                  data-testid="input-photo-file"
                />
              </div>
            )}

            {selectedAction && actionStates.find((s: any) => s.code === selectedAction)?.requiresComment && (
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  placeholder="Detalles adicionales..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  data-testid="input-action-notes"
                />
              </div>
            )}

            <Textarea
              placeholder="Notas opcionales..."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              className={
                selectedAction && actionStates.find((s: any) => s.code === selectedAction)?.requiresComment
                  ? "hidden"
                  : ""
              }
              data-testid="input-optional-notes"
            />

            <Button
              className="w-full"
              onClick={submitAction}
              disabled={!selectedAction || submittingAction}
              data-testid="button-submit-action"
            >
              {submittingAction ? "Registrando..." : "Confirmar Acción"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
