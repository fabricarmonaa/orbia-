import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Truck,
  Plus,
  Users,
  Settings,
  UserCheck,
  UserX,
  Pencil,
  Trash2,
  MapPin,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DeliveryAgent, DeliveryActionState, OrderStatus, DeliveryRoute, DeliveryRouteStop, Order } from "@shared/schema";

export default function DeliveryPage() {
  const [addonEnabled, setAddonEnabled] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Omit<DeliveryAgent, "pinHash">[]>([]);
  const [actionStates, setActionStates] = useState<DeliveryActionState[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<OrderStatus[]>([]);
  const [routes, setRoutes] = useState<(DeliveryRoute & { stops: DeliveryRouteStop[] })[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [stateDialogOpen, setStateDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Omit<DeliveryAgent, "pinHash"> | null>(null);
  const [editingState, setEditingState] = useState<DeliveryActionState | null>(null);
  const { toast } = useToast();

  const [newAgent, setNewAgent] = useState({ dni: "", firstName: "", lastName: "", phone: "", pin: "" });
  const [newState, setNewState] = useState({
    code: "", label: "", requiresPhoto: true, requiresComment: false,
    nextOrderStatusId: "", sortOrder: "0",
  });

  useEffect(() => { checkAddon(); }, []);

  async function checkAddon() {
    try {
      const res = await apiRequest("GET", "/api/addons/status");
      const data = await res.json();
      const enabled = !!(data.data?.delivery);
      setAddonEnabled(enabled);
      if (enabled) fetchAll();
      else setLoading(false);
    } catch {
      setAddonEnabled(false);
      setLoading(false);
    }
  }

  async function fetchAll() {
    try {
      const [agentsRes, statesRes, statusesRes, routesRes, ordersRes] = await Promise.all([
        apiRequest("GET", "/api/delivery/agents"),
        apiRequest("GET", "/api/delivery/action-states"),
        apiRequest("GET", "/api/order-statuses"),
        apiRequest("GET", "/api/delivery/routes"),
        apiRequest("GET", "/api/delivery/orders"),
      ]);
      setAgents((await agentsRes.json()).data || []);
      setActionStates((await statesRes.json()).data || []);
      setOrderStatuses((await statusesRes.json()).data || []);
      setRoutes((await routesRes.json()).data || []);
      setDeliveryOrders((await ordersRes.json()).data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/delivery/agents", newAgent);
      toast({ title: "Delivery creado" });
      setAgentDialogOpen(false);
      setNewAgent({ dni: "", firstName: "", lastName: "", phone: "", pin: "" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function updateAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAgent) return;
    try {
      const updates: any = {
        firstName: editingAgent.firstName,
        lastName: editingAgent.lastName,
        phone: editingAgent.phone,
      };
      await apiRequest("PATCH", `/api/delivery/agents/${editingAgent.id}`, updates);
      toast({ title: "Delivery actualizado" });
      setEditingAgent(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function toggleAgent(id: number) {
    try {
      await apiRequest("PATCH", `/api/delivery/agents/${id}/toggle`, {});
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function createState(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/delivery/action-states", {
        ...newState,
        sortOrder: parseInt(newState.sortOrder) || 0,
        nextOrderStatusId: newState.nextOrderStatusId ? parseInt(newState.nextOrderStatusId) : null,
      });
      toast({ title: "Estado de acción creado" });
      setStateDialogOpen(false);
      setNewState({ code: "", label: "", requiresPhoto: true, requiresComment: false, nextOrderStatusId: "", sortOrder: "0" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function deleteState(id: number) {
    try {
      await apiRequest("DELETE", `/api/delivery/action-states/${id}`);
      toast({ title: "Estado eliminado" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function formatDate(d: string | Date | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  if (addonEnabled === null || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!addonEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Truck className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Delivery no habilitado</h2>
        <p className="text-muted-foreground text-center max-w-md">
          El módulo de delivery no está activado para tu negocio. Contactá al administrador de la plataforma para habilitarlo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6" />
          Delivery
        </h1>
        <p className="text-muted-foreground">Gestión de repartidores, rutas y configuración de delivery</p>
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents" data-testid="tab-delivery-agents">
            <Users className="w-4 h-4 mr-1" />
            Repartidores
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-delivery-config">
            <Settings className="w-4 h-4 mr-1" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="routes" data-testid="tab-delivery-routes">
            <MapPin className="w-4 h-4 mr-1" />
            Rutas
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-delivery-orders">
            <Truck className="w-4 h-4 mr-1" />
            Pedidos Delivery
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="font-semibold">Repartidores ({agents.length})</h3>
            <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-agent">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Repartidor
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Repartidor</DialogTitle>
                </DialogHeader>
                <form onSubmit={createAgent} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>DNI</Label>
                      <Input
                        placeholder="12345678"
                        value={newAgent.dni}
                        onChange={(e) => setNewAgent({ ...newAgent, dni: e.target.value })}
                        required
                        data-testid="input-agent-dni"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PIN (4 dígitos)</Label>
                      <Input
                        type="password"
                        maxLength={4}
                        placeholder="1234"
                        value={newAgent.pin}
                        onChange={(e) => setNewAgent({ ...newAgent, pin: e.target.value })}
                        required
                        data-testid="input-agent-pin"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre</Label>
                      <Input
                        placeholder="Juan"
                        value={newAgent.firstName}
                        onChange={(e) => setNewAgent({ ...newAgent, firstName: e.target.value })}
                        required
                        data-testid="input-agent-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Apellido</Label>
                      <Input
                        placeholder="Pérez"
                        value={newAgent.lastName}
                        onChange={(e) => setNewAgent({ ...newAgent, lastName: e.target.value })}
                        required
                        data-testid="input-agent-lastname"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      placeholder="+54 11 1234-5678"
                      value={newAgent.phone}
                      onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
                      required
                      data-testid="input-agent-phone"
                    />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-submit-agent">
                    Crear Repartidor
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {agents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No hay repartidores registrados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {agent.isActive ? (
                            <UserCheck className="w-5 h-5 text-primary" />
                          ) : (
                            <UserX className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{agent.firstName} {agent.lastName}</p>
                          <p className="text-sm text-muted-foreground">DNI: {agent.dni} - Tel: {agent.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={agent.isActive ? "default" : "secondary"}>
                          {agent.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingAgent(agent)}
                          data-testid={`button-edit-agent-${agent.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Switch
                          checked={agent.isActive}
                          onCheckedChange={() => toggleAgent(agent.id)}
                          data-testid={`switch-agent-active-${agent.id}`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Repartidor</DialogTitle>
              </DialogHeader>
              {editingAgent && (
                <form onSubmit={updateAgent} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre</Label>
                      <Input
                        value={editingAgent.firstName}
                        onChange={(e) => setEditingAgent({ ...editingAgent, firstName: e.target.value })}
                        data-testid="input-edit-agent-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Apellido</Label>
                      <Input
                        value={editingAgent.lastName}
                        onChange={(e) => setEditingAgent({ ...editingAgent, lastName: e.target.value })}
                        data-testid="input-edit-agent-lastname"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      value={editingAgent.phone}
                      onChange={(e) => setEditingAgent({ ...editingAgent, phone: e.target.value })}
                      data-testid="input-edit-agent-phone"
                    />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-submit-edit-agent">
                    Guardar Cambios
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold">Estados de Acción</h3>
              <p className="text-sm text-muted-foreground">
                Configurá las acciones que los repartidores pueden realizar en cada parada
              </p>
            </div>
            <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-action-state">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Estado
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Estado de Acción</DialogTitle>
                </DialogHeader>
                <form onSubmit={createState} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Código</Label>
                      <Input
                        placeholder="ENTREGADO"
                        value={newState.code}
                        onChange={(e) => setNewState({ ...newState, code: e.target.value.toUpperCase() })}
                        required
                        data-testid="input-state-code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Etiqueta</Label>
                      <Input
                        placeholder="Entregado"
                        value={newState.label}
                        onChange={(e) => setNewState({ ...newState, label: e.target.value })}
                        required
                        data-testid="input-state-label"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newState.requiresPhoto}
                        onCheckedChange={(v) => setNewState({ ...newState, requiresPhoto: v })}
                        data-testid="switch-requires-photo"
                      />
                      <Label className="text-sm">Requiere foto</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newState.requiresComment}
                        onCheckedChange={(v) => setNewState({ ...newState, requiresComment: v })}
                        data-testid="switch-requires-comment"
                      />
                      <Label className="text-sm">Requiere comentario</Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cambiar estado de pedido a</Label>
                      <Select
                        value={newState.nextOrderStatusId}
                        onValueChange={(v) => setNewState({ ...newState, nextOrderStatusId: v })}
                      >
                        <SelectTrigger data-testid="select-next-status">
                          <SelectValue placeholder="Sin cambio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin cambio</SelectItem>
                          {orderStatuses.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Orden</Label>
                      <Input
                        type="number"
                        value={newState.sortOrder}
                        onChange={(e) => setNewState({ ...newState, sortOrder: e.target.value })}
                        data-testid="input-sort-order"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-submit-state">
                    Crear Estado
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {actionStates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No hay estados de acción configurados</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Los estados definen las acciones que los repartidores pueden marcar (ej: Entregado, No encontrado)
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {actionStates.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((state) => (
                <Card key={state.id} data-testid={`card-action-state-${state.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-medium">{state.label}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline">{state.code}</Badge>
                          {state.requiresPhoto && <Badge variant="secondary">Foto</Badge>}
                          {state.requiresComment && <Badge variant="secondary">Comentario</Badge>}
                          {state.nextOrderStatusId && (
                            <Badge variant="secondary">
                              Cambia estado pedido
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteState(state.id)}
                        data-testid={`button-delete-state-${state.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="routes" className="mt-4 space-y-4">
          <h3 className="font-semibold">Rutas ({routes.length})</h3>
          {routes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No hay rutas registradas</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Los repartidores crean rutas desde su panel
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {routes.map((route) => {
                const agent = agents.find((a) => a.id === route.agentId);
                return (
                  <Card key={route.id} data-testid={`card-route-${route.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <p className="font-medium">
                            Ruta #{route.id} - {agent ? `${agent.firstName} ${agent.lastName}` : "Desconocido"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {route.stops?.length || 0} paradas - {formatDate(route.startedAt)}
                          </p>
                        </div>
                        <Badge variant={route.status === "active" ? "default" : "secondary"}>
                          {route.status === "active" ? "Activa" : "Completada"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <h3 className="font-semibold">Pedidos con Delivery ({deliveryOrders.length})</h3>
          {deliveryOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No hay pedidos con delivery</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {deliveryOrders.map((order) => {
                const agent = agents.find((a) => a.id === order.assignedAgentId);
                return (
                  <Card key={order.id} data-testid={`card-delivery-order-${order.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary">#{order.orderNumber}</span>
                          </div>
                          <div>
                            <p className="font-medium">{order.customerName || "Sin cliente"}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.deliveryAddress
                                ? `${order.deliveryAddress}${(order as any).deliveryCity ? `, ${(order as any).deliveryCity}` : ""}`
                                : "Sin dirección"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {agent && (
                            <Badge variant="outline">
                              <UserCheck className="w-3 h-3 mr-1" />
                              {agent.firstName} {agent.lastName}
                            </Badge>
                          )}
                          <Badge variant={
                            order.deliveryStatus === "delivered" ? "default" :
                            order.deliveryStatus === "in_transit" ? "secondary" : "outline"
                          }>
                            {order.deliveryStatus || "pending"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
