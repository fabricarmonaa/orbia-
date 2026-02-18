import { useState, useEffect, useRef } from "react";
import { useAuth, apiRequest, getToken } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Plus,
  Users,
  TrendingUp,
  LogOut,
  Shield,
  Search,
  Truck,
  Upload,
  CalendarDays,
  Lock,
  Unlock,
  Save,
  MoreVertical,
  Pencil,
  KeyRound,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranding } from "@/context/BrandingContext";
import { parseApiError } from "@/lib/api-errors";
import type { Tenant, Plan, TenantAddon } from "@shared/schema";

function getSubscriptionStatus(tenant: Tenant): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
} {
  if (tenant.deletedAt) {
    return { label: "Eliminado", variant: "destructive", className: "" };
  }
  if (tenant.isBlocked) {
    return { label: "Bloqueado", variant: "destructive", className: "" };
  }
  if (!tenant.isActive) {
    return { label: "Bloqueada", variant: "destructive", className: "" };
  }
  if (!tenant.subscriptionStartDate || !tenant.subscriptionEndDate) {
    return { label: "Sin suscripción", variant: "secondary", className: "" };
  }
  const now = new Date();
  const end = new Date(tenant.subscriptionEndDate);
  const diffMs = end.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < -3) {
    return { label: "Bloqueada", variant: "destructive", className: "" };
  }
  if (diffDays < 0) {
    return { label: "Período de gracia", variant: "outline", className: "border-orange-500 text-orange-600 dark:text-orange-400" };
  }
  if (diffDays <= 7) {
    return { label: "Por vencer", variant: "outline", className: "border-yellow-500 text-yellow-600 dark:text-yellow-400" };
  }
  return { label: "Activa", variant: "outline", className: "border-green-500 text-green-600 dark:text-green-400" };
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toInputDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export default function OwnerDashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [tenants, setTenants] = useState<(Tenant & { plan?: Plan })[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const { toast } = useToast();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { appBranding, refreshBranding } = useBranding();
  const [appBrandName, setAppBrandName] = useState("");
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [savingAppBranding, setSavingAppBranding] = useState(false);
  const [uploadingAppLogo, setUploadingAppLogo] = useState(false);
  const appLogoInputRef = useRef<HTMLInputElement>(null);

  const [addonStatus, setAddonStatus] = useState<Record<number, Record<string, boolean>>>({});
  const [togglingAddon, setTogglingAddon] = useState<string | null>(null);

  const [subscriptionDates, setSubscriptionDates] = useState<Record<number, { start: string; end: string }>>({});
  const [savingSubscription, setSavingSubscription] = useState<number | null>(null);
  const [togglingBlock, setTogglingBlock] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [actionTenant, setActionTenant] = useState<Tenant | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [processingTenantAction, setProcessingTenantAction] = useState(false);

  const [newTenant, setNewTenant] = useState({
    code: "",
    name: "",
    planId: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
  });
  const [ownerTab, setOwnerTab] = useState<"tenants" | "subscriptions" | "security">("tenants");

  const [securityEmail, setSecurityEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newSecurityEmail, setNewSecurityEmail] = useState("");
  const [newSecurityPassword, setNewSecurityPassword] = useState("");
  const [confirmSecurityPassword, setConfirmSecurityPassword] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState<string | null>(null);
  const [twoFactorOtpAuthUrl, setTwoFactorOtpAuthUrl] = useState<string | null>(null);
  const [twoFactorManualSecret, setTwoFactorManualSecret] = useState<string | null>(null);
  const [twoFactorToken, setTwoFactorToken] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !user?.isSuperAdmin) {
      setLocation("/owner/login");
      return;
    }
    fetchData();
    fetchConfig();
  }, [isAuthenticated, user]);

  useEffect(() => {
    setAppBrandName(appBranding.orbiaName || "Orbia");
    setAppLogoUrl(appBranding.orbiaLogoUrl || null);
  }, [appBranding]);


  useEffect(() => {
    if (typeof document === "undefined") return;
    if (ownerTab === "security") {
      document.title = "ORBIA - SEGURIDAD";
      return;
    }
    if (ownerTab === "tenants") {
      document.title = "ORBIA - NEGOCIOS";
      return;
    }
    document.title = "ORBIA - ADMINISTRACIÓN";
  }, [ownerTab]);

  async function fetchConfig() {
    try {
      const res = await apiRequest("GET", "/api/super/config");
      const data = await res.json();
      if (data.data?.avatarUrl) {
        setAvatarUrl(data.data.avatarUrl);
      }
      const secRes = await apiRequest("GET", "/api/super/security");
      const secData = await secRes.json();
      setSecurityEmail(secData.data?.email || "");
      setNewSecurityEmail(secData.data?.email || "");
      setTwoFactorEnabled(!!secData.data?.twoFactorEnabled);
    } catch {
    }
  }

  async function fetchData() {
    try {
      const [tenantsRes, plansRes] = await Promise.all([
        apiRequest("GET", "/api/super/tenants"),
        apiRequest("GET", "/api/super/plans"),
      ]);
      const tenantsData = await tenantsRes.json();
      const plansData = await plansRes.json();
      const tenantsList: (Tenant & { plan?: Plan })[] = tenantsData.data || [];
      setTenants(tenantsList);
      setPlans(plansData.data || []);

      const dates: Record<number, { start: string; end: string }> = {};
      tenantsList.forEach((t) => {
        dates[t.id] = {
          start: toInputDate(t.subscriptionStartDate),
          end: toInputDate(t.subscriptionEndDate),
        };
      });
      setSubscriptionDates(dates);

      const addonMap: Record<number, Record<string, boolean>> = {};
      await Promise.all(
        tenantsList.map(async (t) => {
          try {
            const addonsRes = await apiRequest("GET", `/api/super/tenants/${t.id}/addons`);
            const addonsData = await addonsRes.json();
            const map: Record<string, boolean> = {};
            (addonsData.data || []).forEach((a: TenantAddon) => {
              map[a.addonKey] = a.enabled;
            });
            addonMap[t.id] = map;
          } catch {
            addonMap[t.id] = {};
          }
        })
      );
      setAddonStatus(addonMap);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const token = getToken();
      const res = await fetch("/api/super/config/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const info = await parseApiError(res, { maxUploadBytes: 2000000 });
        throw new Error(info.message);
      }
      const data = await res.json();
      if (data.data?.avatarUrl) {
        setAvatarUrl(data.data.avatarUrl);
      }
      toast({ title: "Avatar actualizado" });
      setAvatarDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  }

  async function handleAppLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAppLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const token = getToken();
      const res = await fetch("/api/uploads/app-logo", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const info = await parseApiError(res, { maxUploadBytes: 1000000 });
        throw new Error(info.message);
      }
      const data = await res.json();
      if (data.url) {
        setAppLogoUrl(data.url);
      }
      await refreshBranding();
      toast({ title: "Logo global actualizado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAppLogo(false);
      if (appLogoInputRef.current) appLogoInputRef.current.value = "";
    }
  }

  async function saveAppBranding() {
    setSavingAppBranding(true);
    try {
      await apiRequest("PUT", "/api/branding/app", {
        orbiaName: appBrandName,
        orbiaLogoUrl: appLogoUrl,
      });
      await refreshBranding();
      toast({ title: "Branding global guardado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingAppBranding(false);
    }
  }

  async function toggleAddon(tenantId: number, addonKey: string, enabled: boolean) {
    const key = `${tenantId}-${addonKey}`;
    setTogglingAddon(key);
    try {
      await apiRequest("POST", `/api/super/tenants/${tenantId}/addons`, { addonKey, enabled });
      setAddonStatus((prev) => ({
        ...prev,
        [tenantId]: { ...prev[tenantId], [addonKey]: enabled },
      }));
      toast({ title: enabled ? "Addon activado" : "Addon desactivado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTogglingAddon(null);
    }
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/super/tenants", {
        ...newTenant,
        planId: parseInt(newTenant.planId),
      });
      toast({ title: "Tenant creado correctamente" });
      setDialogOpen(false);
      setNewTenant({ code: "", name: "", planId: "", adminEmail: "", adminPassword: "", adminName: "" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function changePlan(tenantId: number, planId: number) {
    try {
      await apiRequest("PATCH", `/api/super/tenants/${tenantId}/plan`, { planId });
      toast({ title: "Plan actualizado" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function saveSubscription(tenantId: number) {
    const dates = subscriptionDates[tenantId];
    if (!dates?.start || !dates?.end) {
      toast({ title: "Error", description: "Seleccioná ambas fechas", variant: "destructive" });
      return;
    }
    setSavingSubscription(tenantId);
    try {
      await apiRequest("PATCH", `/api/super/tenants/${tenantId}/subscription`, {
        startDate: new Date(dates.start).toISOString(),
        endDate: new Date(dates.end).toISOString(),
      });
      toast({ title: "Suscripción actualizada" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingSubscription(null);
    }
  }

  async function toggleBlock(tenantId: number, currentlyBlocked: boolean) {
    setTogglingBlock(tenantId);
    try {
      await apiRequest("PATCH", `/api/super/tenants/${tenantId}/block`, {
        blocked: !currentlyBlocked,
      });
      toast({ title: currentlyBlocked ? "Tenant desbloqueado" : "Tenant bloqueado" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTogglingBlock(null);
    }
  }

  function openRenameDialog(tenant: Tenant) {
    setActionTenant(tenant);
    setRenameValue(tenant.name);
    setRenameOpen(true);
  }

  function openResetPasswordDialog(tenant: Tenant) {
    setActionTenant(tenant);
    setTempPassword(null);
    setResetPasswordOpen(true);
  }

  function openSetPasswordDialog(tenant: Tenant) {
    setActionTenant(tenant);
    setNewPasswordValue("");
    setSetPasswordOpen(true);
  }

  function openDeleteDialog(tenant: Tenant) {
    setActionTenant(tenant);
    setDeleteConfirm("");
    setDeleteOpen(true);
  }

  async function submitRename() {
    if (!actionTenant) return;
    setProcessingTenantAction(true);
    try {
      await apiRequest("PATCH", `/api/super/tenants/${actionTenant.id}/rename`, { name: renameValue });
      toast({ title: "Nombre actualizado" });
      setRenameOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingTenantAction(false);
    }
  }

  async function submitResetPassword() {
    if (!actionTenant) return;
    setProcessingTenantAction(true);
    try {
      const res = await apiRequest("POST", `/api/super/tenants/${actionTenant.id}/admin/reset-password`);
      const data = await res.json();
      setTempPassword(data.tempPassword || null);
      toast({ title: "Contraseña reseteada" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingTenantAction(false);
    }
  }

  async function submitSetPassword() {
    if (!actionTenant) return;
    if (!newPasswordValue) {
      toast({ title: "Error", description: "Ingresá una contraseña", variant: "destructive" });
      return;
    }
    setProcessingTenantAction(true);
    try {
      await apiRequest("POST", `/api/super/tenants/${actionTenant.id}/admin/set-password`, {
        newPassword: newPasswordValue,
      });
      toast({ title: "Contraseña actualizada" });
      setSetPasswordOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingTenantAction(false);
    }
  }

  async function submitDeleteTenant() {
    if (!actionTenant) return;
    setProcessingTenantAction(true);
    try {
      await apiRequest("DELETE", `/api/super/tenants/${actionTenant.id}`, { confirmText: deleteConfirm });
      toast({ title: "Negocio eliminado" });
      setDeleteOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingTenantAction(false);
    }
  }

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase());
    const matchesDeleted = showDeleted ? true : !t.deletedAt;
    return matchesSearch && matchesDeleted;
  });

  const activeTenants = tenants.filter((t) => t.isActive).length;

  function handleLogout() {
    logout();
    setLocation("/owner/login");
  }

  if (!isAuthenticated || !user?.isSuperAdmin) return null;


  async function saveSuperCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast({ title: "Error", description: "Ingresá tu contraseña actual", variant: "destructive" });
      return;
    }
    if (newSecurityPassword && newSecurityPassword !== confirmSecurityPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    setSavingSecurity(true);
    try {
      await apiRequest("PUT", "/api/super/credentials", {
        currentPassword,
        newEmail: newSecurityEmail !== securityEmail ? newSecurityEmail : undefined,
        newPassword: newSecurityPassword || undefined,
      });
      toast({ title: "Seguridad actualizada" });
      setSecurityEmail(newSecurityEmail);
      setCurrentPassword("");
      setNewSecurityPassword("");
      setConfirmSecurityPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingSecurity(false);
    }
  }

  async function setupTwoFactor() {
    try {
      const res = await apiRequest("POST", "/api/super/2fa/setup", { accountLabel: securityEmail });
      const data = await res.json();
      setTwoFactorQrDataUrl(data.data?.qrDataUrl || null);
      setTwoFactorOtpAuthUrl(data.data?.otpauthUrl || null);
      setTwoFactorManualSecret(data.data?.manualSecret || null);
      toast({ title: "QR generado", description: "Escanealo con Google Authenticator y luego verificá el código." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function verifyTwoFactor() {
    try {
      await apiRequest("POST", "/api/super/2fa/verify", { token: twoFactorToken });
      setTwoFactorEnabled(true);
      setTwoFactorQrDataUrl(null);
      setTwoFactorOtpAuthUrl(null);
      setTwoFactorManualSecret(null);
      setTwoFactorToken("");
      toast({ title: "2FA habilitado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function disableTwoFactor() {
    if (!currentPassword) {
      toast({ title: "Error", description: "Ingresá tu contraseña actual", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/super/2fa/disable", { currentPassword, token: twoFactorToken });
      setTwoFactorEnabled(false);
      setTwoFactorToken("");
      toast({ title: "2FA desactivado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-14">
            <div className="flex items-center gap-3">
              <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    className="focus:outline-none cursor-pointer"
                    data-testid="button-avatar-trigger"
                  >
                    <Avatar className="h-8 w-8">
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt="Owner avatar" data-testid="img-owner-avatar" />
                      ) : null}
                      <AvatarFallback>
                        <Shield className="w-4 h-4 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Actualizar Avatar</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col items-center gap-4 py-4">
                    <Avatar className="h-20 w-20">
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt="Owner avatar" />
                      ) : null}
                      <AvatarFallback>
                        <Shield className="w-8 h-8 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2 w-full">
                      <Label htmlFor="avatar-upload">Seleccionar imagen</Label>
                      <Input
                        id="avatar-upload"
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        disabled={uploadingAvatar}
                        data-testid="input-avatar-upload"
                      />
                    </div>
                    {uploadingAvatar && (
                      <p className="text-sm text-muted-foreground">Subiendo...</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex items-center gap-2">
                {appLogoUrl ? (
                  <img
                    src={appLogoUrl}
                    alt={appBrandName}
                    className="w-6 h-6 rounded-md object-cover"
                  />
                ) : null}
                <span className="font-bold text-lg tracking-tight">{appBrandName || "ORBIA"}</span>
              </div>
              <Badge variant="secondary">Super Admin</Badge>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Tenants</p>
                  <p className="text-2xl font-bold" data-testid="text-total-tenants">{tenants.length}</p>
                </div>
                <div className="p-3 rounded-md bg-primary/10">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Activos</p>
                  <p className="text-2xl font-bold" data-testid="text-active-tenants">{activeTenants}</p>
                </div>
                <div className="p-3 rounded-md bg-chart-2/10">
                  <Users className="w-5 h-5 text-chart-2" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Planes</p>
                  <p className="text-2xl font-bold" data-testid="text-total-plans">{plans.length}</p>
                </div>
                <div className="p-3 rounded-md bg-chart-4/10">
                  <TrendingUp className="w-5 h-5 text-chart-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">Branding Global</h3>
              <p className="text-sm text-muted-foreground">Logo y nombre de Orbia</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Avatar className="h-16 w-16">
                {appLogoUrl ? (
                  <AvatarImage src={appLogoUrl} alt="Orbia logo" />
                ) : null}
                <AvatarFallback>
                  <Shield className="w-6 h-6 text-primary" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Label>Logo global</Label>
                <Input
                  ref={appLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAppLogoUpload}
                  disabled={uploadingAppLogo}
                  data-testid="input-app-logo"
                />
                {uploadingAppLogo && (
                  <p className="text-sm text-muted-foreground">Subiendo logo...</p>
                )}
              </div>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label>Nombre</Label>
              <Input
                value={appBrandName}
                onChange={(e) => setAppBrandName(e.target.value)}
                placeholder="Orbia"
                data-testid="input-app-brand-name"
              />
            </div>
            <Button onClick={saveAppBranding} disabled={savingAppBranding} data-testid="button-save-app-branding">
              <Save className="w-4 h-4 mr-2" />
              {savingAppBranding ? "Guardando..." : "Guardar branding"}
            </Button>
          </CardContent>
        </Card>

        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renombrar negocio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nuevo nombre</Label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Nombre del negocio"
                />
              </div>
              <Button onClick={submitRename} disabled={processingTenantAction}>
                <Save className="w-4 h-4 mr-2" />
                {processingTenantAction ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resetear contraseña admin</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Se generará una contraseña temporal que se mostrará una sola vez.
              </p>
              {tempPassword ? (
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Contraseña temporal</p>
                  <p className="font-mono text-sm">{tempPassword}</p>
                </div>
              ) : null}
              <Button onClick={submitResetPassword} disabled={processingTenantAction}>
                {processingTenantAction ? "Generando..." : "Generar contraseña"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={setPasswordOpen} onOpenChange={setSetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cambiar contraseña admin</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Nueva contraseña"
                />
              </div>
              <Button onClick={submitSetPassword} disabled={processingTenantAction}>
                {processingTenantAction ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar negocio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escribí el código o el nombre del negocio para confirmar el borrado.
              </p>
              <div className="space-y-2">
                <Label>Confirmación</Label>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Código o nombre"
                />
              </div>
              <Button variant="destructive" onClick={submitDeleteTenant} disabled={processingTenantAction}>
                <Trash2 className="w-4 h-4 mr-2" />
                {processingTenantAction ? "Eliminando..." : "Eliminar negocio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Tabs value={ownerTab} onValueChange={(value) => setOwnerTab(value as "tenants" | "subscriptions" | "security")} data-testid="tabs-owner">
          <TabsList>
            <TabsTrigger value="tenants" data-testid="tab-tenants">Negocios</TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">Suscripciones</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Seguridad</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-semibold">Negocios</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showDeleted}
                    onCheckedChange={(checked) => setShowDeleted(checked)}
                  />
                  <span className="text-sm text-muted-foreground">Ver eliminados</span>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar negocio..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-64"
                    data-testid="input-search-tenants"
                  />
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-tenant">
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Negocio
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Negocio</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={createTenant} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Código</Label>
                          <Input
                            placeholder="mi-negocio"
                            value={newTenant.code}
                            onChange={(e) => setNewTenant({ ...newTenant, code: e.target.value })}
                            required
                            data-testid="input-new-tenant-code"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Nombre</Label>
                          <Input
                            placeholder="Mi Negocio"
                            value={newTenant.name}
                            onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                            required
                            data-testid="input-new-tenant-name"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Plan</Label>
                        <Select
                          value={newTenant.planId}
                          onValueChange={(v) => setNewTenant({ ...newTenant, planId: v })}
                        >
                          <SelectTrigger data-testid="select-plan">
                            <SelectValue placeholder="Seleccionar plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Nombre del Admin</Label>
                        <Input
                          placeholder="Juan Pérez"
                          value={newTenant.adminName}
                          onChange={(e) => setNewTenant({ ...newTenant, adminName: e.target.value })}
                          required
                          data-testid="input-new-admin-name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Email Admin</Label>
                          <Input
                            type="email"
                            placeholder="admin@negocio.com"
                            value={newTenant.adminEmail}
                            onChange={(e) => setNewTenant({ ...newTenant, adminEmail: e.target.value })}
                            required
                            data-testid="input-new-admin-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contraseña Admin</Label>
                          <Input
                            type="password"
                            placeholder="Contraseña"
                            value={newTenant.adminPassword}
                            onChange={(e) => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
                            required
                            data-testid="input-new-admin-password"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" data-testid="button-submit-tenant">
                        Crear Negocio
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : filteredTenants.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    {search ? "No se encontraron negocios" : "No hay negocios registrados aún"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTenants.map((tenant) => {
                  const plan = plans.find((p) => p.id === tenant.planId);
                  const status = getSubscriptionStatus(tenant);
                  return (
                    <Card key={tenant.id} className="hover-elevate" data-testid={`card-tenant-${tenant.id}`}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium" data-testid={`text-tenant-name-${tenant.id}`}>
                                {tenant.name}
                              </p>
                              <p className="text-sm text-muted-foreground">{tenant.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant={status.variant} className={status.className}>
                              {status.label}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-muted-foreground" />
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">Delivery</Label>
                              <Switch
                                checked={!!addonStatus[tenant.id]?.delivery}
                                disabled={togglingAddon === `${tenant.id}-delivery`}
                                onCheckedChange={(checked) => toggleAddon(tenant.id, "delivery", checked)}
                                data-testid={`switch-delivery-addon-${tenant.id}`}
                              />
                            </div>
                            <Select
                              value={String(tenant.planId || "")}
                              onValueChange={(v) => changePlan(tenant.id, parseInt(v))}
                            >
                              <SelectTrigger className="w-40" data-testid={`select-tenant-plan-${tenant.id}`}>
                                <SelectValue placeholder="Plan">{plan?.name || "Sin plan"}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map((p) => (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-tenant-actions-${tenant.id}`}>
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => toggleBlock(tenant.id, tenant.isBlocked)}
                                  disabled={togglingBlock === tenant.id || !!tenant.deletedAt}
                                >
                                  {tenant.isBlocked ? (
                                    <>
                                      <Unlock className="w-4 h-4 mr-2" />
                                      Desbloquear
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-4 h-4 mr-2" />
                                      Bloquear
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openRenameDialog(tenant)} disabled={!!tenant.deletedAt}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Cambiar nombre
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openResetPasswordDialog(tenant)} disabled={!!tenant.deletedAt}>
                                  <KeyRound className="w-4 h-4 mr-2" />
                                  Resetear contraseña admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openSetPasswordDialog(tenant)} disabled={!!tenant.deletedAt}>
                                  <KeyRound className="w-4 h-4 mr-2" />
                                  Cambiar contraseña admin
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openDeleteDialog(tenant)} disabled={!!tenant.deletedAt}>
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Eliminar negocio
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <h2 className="text-xl font-semibold">Suscripciones</h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-md" />
                ))}
              </div>
            ) : tenants.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No hay negocios registrados</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tenants.map((tenant) => {
                  const status = getSubscriptionStatus(tenant);
                  const dates = subscriptionDates[tenant.id] || { start: "", end: "" };
                  return (
                    <Card key={tenant.id} data-testid={`card-subscription-${tenant.id}`}>
                      <CardContent className="py-4 space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium" data-testid={`text-sub-tenant-name-${tenant.id}`}>
                                {tenant.name}
                              </p>
                              <p className="text-sm text-muted-foreground">{tenant.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge
                              variant={status.variant}
                              className={status.className}
                              data-testid={`badge-subscription-status-${tenant.id}`}
                            >
                              {status.label}
                            </Badge>
                            {tenant.subscriptionStartDate && tenant.subscriptionEndDate && (
                              <span className="text-sm text-muted-foreground" data-testid={`text-subscription-dates-${tenant.id}`}>
                                {formatDate(tenant.subscriptionStartDate)} - {formatDate(tenant.subscriptionEndDate)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Inicio</Label>
                            <Input
                              type="date"
                              value={dates.start}
                              onChange={(e) =>
                                setSubscriptionDates((prev) => ({
                                  ...prev,
                                  [tenant.id]: { ...prev[tenant.id], start: e.target.value },
                                }))
                              }
                              data-testid={`input-sub-start-${tenant.id}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Fin</Label>
                            <Input
                              type="date"
                              value={dates.end}
                              onChange={(e) =>
                                setSubscriptionDates((prev) => ({
                                  ...prev,
                                  [tenant.id]: { ...prev[tenant.id], end: e.target.value },
                                }))
                              }
                              data-testid={`input-sub-end-${tenant.id}`}
                            />
                          </div>
                          <Button
                            onClick={() => saveSubscription(tenant.id)}
                            disabled={savingSubscription === tenant.id}
                            data-testid={`button-save-subscription-${tenant.id}`}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {savingSubscription === tenant.id ? "Guardando..." : "Guardar suscripción"}
                          </Button>
                          <Button
                            variant={tenant.isBlocked ? "default" : "destructive"}
                            onClick={() => toggleBlock(tenant.id, tenant.isBlocked)}
                            disabled={togglingBlock === tenant.id || !!tenant.deletedAt}
                            data-testid={`button-toggle-block-${tenant.id}`}
                          >
                            {tenant.isBlocked ? (
                              <>
                                <Unlock className="w-4 h-4 mr-2" />
                                Desbloquear
                              </>
                            ) : (
                              <>
                                <Lock className="w-4 h-4 mr-2" />
                                Bloquear
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <h2 className="text-xl font-semibold">Seguridad SuperAdmin</h2>
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Credenciales</h3>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveSuperCredentials} className="space-y-3 max-w-xl">
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input value={newSecurityEmail} onChange={(e) => setNewSecurityEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Contraseña actual</Label>
                    <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Nueva contraseña</Label>
                    <Input type="password" value={newSecurityPassword} onChange={(e) => setNewSecurityPassword(e.target.value)} placeholder="Mínimo 10, una mayúscula y un número" />
                  </div>
                  <div className="space-y-1">
                    <Label>Confirmar nueva contraseña</Label>
                    <Input type="password" value={confirmSecurityPassword} onChange={(e) => setConfirmSecurityPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={savingSecurity}>{savingSecurity ? "Guardando..." : "Guardar cambios"}</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-semibold">2FA (TOTP)</h3>
              </CardHeader>
              <CardContent className="space-y-3 max-w-xl">
                <p className="text-sm text-muted-foreground">Estado: {twoFactorEnabled ? "Habilitado" : "Deshabilitado"}</p>
                {!twoFactorEnabled ? (
                  <Button variant="outline" onClick={setupTwoFactor}>Configurar 2FA</Button>
                ) : null}
                {twoFactorQrDataUrl ? (
                  <div className="space-y-2">
                    <Label>Escaneá este QR con Google Authenticator</Label>
                    <div className="rounded-md border p-3 bg-white w-fit">
                      <img src={twoFactorQrDataUrl} alt="QR para Google Authenticator" className="h-44 w-44" />
                    </div>
                  </div>
                ) : null}
                {twoFactorManualSecret ? (
                  <div className="space-y-2">
                    <Label>Clave manual (fallback)</Label>
                    <Input value={twoFactorManualSecret} readOnly />
                  </div>
                ) : null}
                {twoFactorOtpAuthUrl ? (
                  <div className="space-y-2">
                    <Label>URI OTP (debug)</Label>
                    <Input value={twoFactorOtpAuthUrl} readOnly />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Código 2FA</Label>
                  <Input value={twoFactorToken} onChange={(e) => setTwoFactorToken(e.target.value)} placeholder="123456" />
                </div>
                {!twoFactorEnabled ? (
                  <Button onClick={verifyTwoFactor}>Verificar y habilitar</Button>
                ) : (
                  <Button variant="destructive" onClick={disableTwoFactor}>Desactivar 2FA</Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
