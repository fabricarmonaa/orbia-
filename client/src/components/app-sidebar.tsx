import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Package,
  Building2,
  Settings,
  LogOut,
  Lock,
  Truck,
  MessageCircle,
  ShoppingCart,
  ReceiptText,
  Users,
  FileSpreadsheet,
  CalendarDays,
  NotebookPen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { useBranding } from "@/context/BrandingContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/branding/BrandLogo";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  feature?: string;
  addon?: string;
  adminOnly?: boolean;
  section: "operacion" | "productividad" | "configuracion";
  highlight?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, section: "operacion" },
  { title: "Pedidos", url: "/app/orders", icon: ClipboardList, section: "operacion" },
  { title: "Caja", url: "/app/cash", icon: Wallet, section: "operacion" },
  { title: "Productos", url: "/app/products", icon: Package, feature: "products", section: "operacion" },
  { title: "Compras", url: "/app/purchases", icon: FileSpreadsheet, feature: "purchases", adminOnly: true, section: "operacion" },
  { title: "Clientes", url: "/app/customers", icon: Users, feature: "customers", adminOnly: true, section: "operacion" },
  { title: "Ventas", url: "/app/pos", icon: ShoppingCart, feature: "pos", section: "operacion" },
  { title: "Historial ventas", url: "/app/sales", icon: ReceiptText, feature: "sales_history", section: "operacion" },
  { title: "Cajeros", url: "/app/cashiers", icon: Users, feature: "cashiers", adminOnly: true, section: "operacion" },
  { title: "Sucursales", url: "/app/branches", icon: Building2, feature: "branches", adminOnly: true, section: "operacion" },
  { title: "Delivery", url: "/app/delivery", icon: Truck, addon: "delivery", section: "operacion" },
  { title: "Mensajería", url: "/app/messaging", icon: MessageCircle, addon: "messaging_whatsapp", section: "operacion" },
  { title: "Agenda", url: "/app/agenda", icon: CalendarDays, feature: "agenda", section: "productividad" },
  { title: "Notas", url: "/app/notes", icon: NotebookPen, feature: "notes", section: "productividad" },
  { title: "Configuración", url: "/app/settings", icon: Settings, adminOnly: true, section: "configuracion" },
];

const sectionLabels: Record<MenuItem["section"], string> = {
  operacion: "Operación",
  productividad: "Productividad",
  configuracion: "Configuración",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { plan, hasFeature } = usePlan();
  const { appBranding } = useBranding();
  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});
  const [lowStockAlerts, setLowStockAlerts] = useState(0);
  const isTenantAdmin = user?.role === "admin";

  useEffect(() => {
    apiRequest("GET", "/api/addons/status")
      .then((r) => r.json())
      .then((d) => setAddonStatus(d.data || {}))
      .catch(() => { });
    apiRequest("GET", "/api/stock/alerts")
      .then((r) => r.json())
      .then((d) => setLowStockAlerts(Number(d.total || (d.data || []).length || 0)))
      .catch(() => { });
  }, []);

  function isActive(url: string) {
    if (url === "/app") return location === "/app";
    return location.startsWith(url);
  }

  function handleLogout() {
    logout("manual");
  }

  const visibleItems = menuItems
    .filter((item) => !item.addon || addonStatus[item.addon])
    .filter((item) => !item.adminOnly || isTenantAdmin)
    .filter((item) => user?.role !== "CASHIER" || ["/app/pos", "/app/sales"].includes(item.url));

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "U";

  return (
    <Sidebar className="joyride-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <BrandLogo
            src={appBranding.orbiaLogoUrl}
            alt={appBranding.orbiaName || "ORBIA"}
            brandName={appBranding.orbiaName || "ORBIA"}
            variant="sidebar"
          />
          <div className="min-w-0">
            <p className="font-bold text-sm tracking-tight truncate">
              {appBranding.orbiaName || "ORBIA"}
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground truncate">{user?.role === "admin" ? "Administrador" : "Staff"}</p>
              {plan && (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-plan-name">
                  {plan.name}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 py-2">
            <SidebarMenu>
              {visibleItems.map((item) => {
                const blocked = item.feature && !hasFeature(item.feature);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link
                        href={item.url}
                        data-testid={`nav-${item.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className={blocked ? "text-muted-foreground" : ""}>{item.title}</span>
                        {item.highlight && <Badge className="ml-auto text-[10px]" variant="outline">Nuevo</Badge>}
                        {item.url === "/app/stock/kardex" && lowStockAlerts > 0 ? <Badge variant="destructive" className="ml-auto text-[10px]">{lowStockAlerts}</Badge> : null}
                        {blocked && <Lock className="w-3 h-3 ml-auto text-muted-foreground" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 joyride-user-profile">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={user?.avatarUrl || undefined} alt={user?.fullName || "Usuario"} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
