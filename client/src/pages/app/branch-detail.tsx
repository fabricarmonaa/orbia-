import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { apiRequest, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  ClipboardList,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Plus,
  KeyRound,
  UserCheck,
  UserX,
  Copy,
  MoreVertical,
  Trash2,
  Settings,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Branch, Order, CashMovement } from "@shared/schema";

interface BranchUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
  scope: string;
  branchId: number | null;
  isActive: boolean;
  phone?: string | null;
}

export default function BranchDetailPage() {
  const params = useParams<{ branchId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const branchId = params?.branchId;
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [branchUsers, setBranchUsers] = useState<BranchUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const [showAddUser, setShowAddUser] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: "", email: "", password: "", phone: "" });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showDeleteBranch, setShowDeleteBranch] = useState(false);
  const [deleteBranchName, setDeleteBranchName] = useState("");
  const [deletingBranch, setDeletingBranch] = useState(false);
  const [showDeleteUser, setShowDeleteUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<BranchUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<BranchUser | null>(null);
  const [editUserForm, setEditUserForm] = useState({ fullName: "", branchId: "" });
  const { toast } = useToast();

  useEffect(() => {
    if (user?.role !== "admin") {
      setLocation("/app");
      return;
    }
    if (branchId) fetchData();
  }, [branchId, setLocation, user?.role]);

  async function fetchData() {
    try {
      const [branchesRes, ordersRes, movementsRes, usersRes] = await Promise.all([
        apiRequest("GET", "/api/branches"),
        apiRequest("GET", `/api/branches/${branchId}/orders`),
        apiRequest("GET", `/api/branches/${branchId}/cash/movements`),
        apiRequest("GET", `/api/branch-users?branchId=${branchId}`),
      ]);
      const branchesData = await branchesRes.json();
      const ordersData = await ordersRes.json();
      const movementsData = await movementsRes.json();
      const usersData = await usersRes.json();

      const branchList = branchesData.data || [];
      setBranches(branchList);
      const found = branchList.find(
        (b: Branch) => b.id === parseInt(branchId!)
      );
      setBranch(found || null);
      setOrders(ordersData.data || []);
      setMovements(movementsData.data || []);
      setBranchUsers(usersData.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUser() {
    if (!newUser.fullName || !newUser.email || !newUser.password) return;
    setAddingUser(true);
    try {
      const res = await apiRequest("POST", "/api/branch-users", {
        branchId: parseInt(branchId!),
        fullName: newUser.fullName,
        email: newUser.email,
        password: newUser.password,
        phone: newUser.phone || undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBranchUsers((prev) => [...prev, data.data]);
      setNewUser({ fullName: "", email: "", password: "", phone: "" });
      setShowAddUser(false);
      toast({ title: "Usuario creado", description: `${data.data.fullName} puede iniciar sesión con su email y contraseña` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingUser(false);
    }
  }

  async function handleToggleUser(userId: number, currentActive: boolean) {
    try {
      const res = await apiRequest("PATCH", `/api/branch-users/${userId}`, { isActive: !currentActive });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBranchUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: !currentActive } : u)));
      toast({ title: !currentActive ? "Usuario activado" : "Usuario desactivado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleResetPassword(userId: number, userName: string) {
    try {
      const res = await apiRequest("POST", `/api/branch-users/${userId}/reset-password`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTempPassword(data.data.temporaryPassword);
      toast({ title: "Contraseña restablecida", description: `Nueva contraseña temporal para ${userName}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleDeleteBranch() {
    if (!branch) return;
    setDeletingBranch(true);
    try {
      const res = await apiRequest("DELETE", `/api/branches/${branch.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Sucursal eliminada" });
      setLocation("/app/branches");
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message, variant: "destructive" });
    } finally {
      setDeletingBranch(false);
      setShowDeleteBranch(false);
      setDeleteBranchName("");
    }
  }

  function openEditUser(userData: BranchUser) {
    setEditingUser(userData);
    setEditUserForm({
      fullName: userData.fullName,
      branchId: userData.branchId ? String(userData.branchId) : "",
    });
    setShowEditUser(true);
  }

  async function handleEditUser() {
    if (!editingUser) return;
    try {
      const payload: { fullName?: string; branchId?: number } = {};
      if (editUserForm.fullName.trim()) payload.fullName = editUserForm.fullName.trim();
      if (editUserForm.branchId) payload.branchId = parseInt(editUserForm.branchId);
      const res = await apiRequest("PATCH", `/api/branch-users/${editingUser.id}`, payload);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = data.data;
      setBranchUsers((prev) => {
        if (updated.branchId && branchId && updated.branchId !== parseInt(branchId)) {
          return prev.filter((u) => u.id !== updated.id);
        }
        return prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
      });
      toast({ title: "Usuario actualizado" });
      setShowEditUser(false);
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleDeleteUser() {
    if (!selectedUser) return;
    setDeletingUser(true);
    try {
      const res = await apiRequest("DELETE", `/api/branch-users/${selectedUser.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBranchUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
      toast({ title: "Usuario eliminado" });
      setShowDeleteUser(false);
      setSelectedUser(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingUser(false);
    }
  }

  function formatDate(d: string | Date | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (user?.role !== "admin") {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/app/branches")} data-testid="button-back-branches">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Sucursal no encontrada</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalIncome = movements
    .filter((m) => m.type === "ingreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);
  const totalExpense = movements
    .filter((m) => m.type === "egreso")
    .reduce((acc, m) => acc + parseFloat(m.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" onClick={() => setLocation("/app/branches")} data-testid="button-back-branches">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-md bg-primary/10">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-branch-name">
              {branch.name}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {branch.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {branch.address}
                </span>
              )}
              {branch.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {branch.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteBranch(true)}
          data-testid="button-delete-branch"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Eliminar sucursal
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Pedidos</p>
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-branch-orders-count">{orders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Ingresos</p>
              <ArrowUpRight className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600" data-testid="text-branch-income">
              ${totalIncome.toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Egresos</p>
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600" data-testid="text-branch-expense">
              ${totalExpense.toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-branch-orders">
            Pedidos ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="cash" data-testid="tab-branch-cash">
            Movimientos ({movements.length})
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-branch-users">
            Usuarios ({branchUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          {orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Sin pedidos en esta sucursal</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`card-branch-order-${order.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{order.customerName}</p>
                          <Badge variant="outline">{order.type}</Badge>
                          <span className="text-xs text-muted-foreground">#{order.orderNumber}</span>
                        </div>
                        {order.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {order.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold">
                          ${order.totalAmount ? parseFloat(order.totalAmount).toLocaleString("es-AR") : "0"}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cash" className="mt-4">
          {movements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wallet className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Sin movimientos en esta sucursal</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {movements.map((mov) => (
                <Card key={mov.id} data-testid={`card-branch-movement-${mov.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        {mov.type === "ingreso" ? (
                          <ArrowUpRight className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <ArrowDownRight className="w-5 h-5 text-red-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium capitalize">{mov.type}</p>
                            {mov.category && <Badge variant="secondary">{mov.category}</Badge>}
                            {mov.method && (
                              <span className="text-xs text-muted-foreground capitalize">{mov.method}</span>
                            )}
                          </div>
                          {mov.description && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">{mov.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${mov.type === "ingreso" ? "text-green-600" : "text-red-600"}`}>
                          {mov.type === "ingreso" ? "+" : "-"}${parseFloat(mov.amount).toLocaleString("es-AR")}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(mov.createdAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <p className="text-sm text-muted-foreground">
              Usuarios con acceso restringido a esta sucursal
            </p>
            <Button onClick={() => setShowAddUser(true)} data-testid="button-add-branch-user">
              <Plus className="w-4 h-4 mr-2" />
              Agregar usuario
            </Button>
          </div>

          {branchUsers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Sin usuarios asignados a esta sucursal</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Los usuarios de sucursal solo pueden ver y operar datos de su sucursal
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {branchUsers.map((user) => (
                <Card key={user.id} data-testid={`card-branch-user-${user.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium" data-testid={`text-user-name-${user.id}`}>{user.fullName}</p>
                          <Badge variant={user.isActive ? "default" : "secondary"}>
                            {user.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1" data-testid={`text-user-email-${user.id}`}>
                          {user.email}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" data-testid={`button-user-actions-${user.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditUser(user)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Editar permisos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(user.id, user.fullName)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Resetear contraseña
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleUser(user.id, user.isActive)}>
                            {user.isActive ? (
                              <>
                                <UserX className="w-4 h-4 mr-2" />
                                Desactivar usuario
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-4 h-4 mr-2" />
                                Activar usuario
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setShowDeleteUser(true);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar usuario
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar usuario de sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Nombre completo</Label>
              <Input
                id="user-name"
                value={newUser.fullName}
                onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Ej: Martín Gómez"
                data-testid="input-user-fullname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="ejemplo@negocio.com"
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Contraseña</Label>
              <Input
                id="user-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                placeholder="Mínimo 4 caracteres (Ej: 1234)"
                data-testid="input-user-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-phone">Teléfono (opcional)</Label>
              <Input
                id="user-phone"
                value={newUser.phone}
                onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Ej: 11 1234-5678"
                data-testid="input-user-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUser(false)} data-testid="button-cancel-add-user">
              Cancelar
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={addingUser || !newUser.fullName || !newUser.email || !newUser.password}
              data-testid="button-confirm-add-user"
            >
              {addingUser ? "Creando..." : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditUser} onOpenChange={setShowEditUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar permisos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={editUserForm.fullName}
                onChange={(e) => setEditUserForm((prev) => ({ ...prev, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <select
                className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
                value={editUserForm.branchId}
                onChange={(e) => setEditUserForm((prev) => ({ ...prev, branchId: e.target.value }))}
              >
                <option value="">Seleccionar sucursal</option>
                {branches.map((branchOption) => (
                  <option key={branchOption.id} value={branchOption.id}>
                    {branchOption.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditUser(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditUser} disabled={!editingUser}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteUser} onOpenChange={setShowDeleteUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción desactivará el usuario y lo removerá de la sucursal. Podés volver a crearlo más adelante.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteUser(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deletingUser}>
              {deletingUser ? "Eliminando..." : "Eliminar usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contraseña temporal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Compartí esta contraseña temporal con el usuario. Deberá usarla para iniciar sesión.
            </p>
            <div className="flex items-center gap-2">
              <Input value={tempPassword || ""} readOnly data-testid="input-temp-password" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword || "");
                  toast({ title: "Copiado" });
                }}
                data-testid="button-copy-password"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)} data-testid="button-close-temp-password">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteBranch} onOpenChange={setShowDeleteBranch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta acción es irreversible. Para confirmar escribí el nombre de la sucursal.
            </p>
            <Input
              value={deleteBranchName}
              onChange={(e) => setDeleteBranchName(e.target.value)}
              placeholder={branch?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteBranch(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBranch}
              disabled={deletingBranch || deleteBranchName.trim() !== branch?.name}
            >
              {deletingBranch ? "Eliminando..." : "Eliminar sucursal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
