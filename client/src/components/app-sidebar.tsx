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
  ArrowRightLeft,
  BellDot,
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
  planCodes?: string[];
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "Pedidos", url: "/app/orders", icon: ClipboardList },
  { title: "Caja", url: "/app/cash", icon: Wallet },
  { title: "Productos", url: "/app/products", icon: Package, feature: "products" },
  { title: "Compras", url: "/app/purchases", icon: FileSpreadsheet, feature: "products", adminOnly: true },
  { title: "Clientes", url: "/app/customers", icon: Users, feature: "products", adminOnly: true },
  { title: "POS", url: "/app/pos", icon: ShoppingCart, feature: "products" },
  { title: "Ventas", url: "/app/sales", icon: ReceiptText, feature: "products" },
  { title: "Stock Kardex", url: "/app/stock/kardex", icon: BellDot, feature: "products", adminOnly: true },
  { title: "Transferencias", url: "/app/stock/transfers", icon: ArrowRightLeft, feature: "products", adminOnly: true },
  { title: "Cajeros", url: "/app/cashiers", icon: Users, adminOnly: true, planCodes: ["PROFESIONAL", "ESCALA"] },
  { title: "Sucursales", url: "/app/branches", icon: Building2, feature: "branches", adminOnly: true },
  { title: "Delivery", url: "/app/delivery", icon: Truck, addon: "delivery" },
  { title: "Mensajería", url: "/app/messaging", icon: MessageCircle, addon: "messaging_whatsapp" },
  { title: "Configuración", url: "/app/settings", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { plan, hasFeature } = usePlan();
  const { appBranding } = useBranding();
  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});
  const [lowStockAlerts, setLowStockAlerts] = useState(0);
  const isTenantAdmin = user?.role === "admin";
  const planCode = (plan?.planCode || "").toUpperCase();

  useEffect(() => {
    apiRequest("GET", "/api/addons/status")
      .then((r) => r.json())
      .then((d) => setAddonStatus(d.data || {}))
      .catch(() => {});
    apiRequest("GET", "/api/stock/alerts")
      .then((r) => r.json())
      .then((d) => setLowStockAlerts(Number(d.total || (d.data || []).length || 0)))
      .catch(() => {});
  }, []);

  function isActive(url: string) {
    if (url === "/app") return location === "/app";
    return location.startsWith(url);
  }

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "U";

  return (
    <Sidebar>
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
          <SidebarGroupLabel>Menú</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter((item) => !item.addon || addonStatus[item.addon])
                .filter((item) => !item.adminOnly || isTenantAdmin)
                .filter((item) => item.url !== "/app/branches" || planCode === "ESCALA")
                .filter((item) => !item.planCodes || item.planCodes.includes(planCode))
                                .filter((item) => user?.role !== "CASHIER" || ["/app/pos", "/app/sales"].includes(item.url))
                .map((item) => {
                const blocked = item.feature && !hasFeature(item.feature);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link
                        href={item.url}
                        data-testid={`nav-${item.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className={blocked ? "text-muted-foreground" : ""}>{item.title}</span>{item.url === "/app/stock/kardex" && lowStockAlerts > 0 ? <Badge variant="destructive" className="ml-auto text-[10px]">{lowStockAlerts}</Badge> : null}
                        {blocked && <Lock className="w-3 h-3 ml-auto text-muted-foreground" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
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
