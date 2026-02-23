import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

export interface TenantBrandingColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  trackingButton: string;
  trackingHeader: string;
  trackingBadge: string;
}

export interface TenantBrandingTexts {
  trackingHeader: string;
  trackingFooter: string;
}

export interface TenantBrandingLinks {
  instagram?: string;
  whatsapp?: string;
  web?: string;
}

export interface TenantBrandingPdfConfig {
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
}

export interface TenantBranding {
  logoUrl: string | null;
  displayName: string;
  colors: TenantBrandingColors;
  texts: TenantBrandingTexts;
  links: TenantBrandingLinks;
  pdfConfig: TenantBrandingPdfConfig;
}

export interface AppBranding {
  orbiaLogoUrl: string | null;
  orbiaName: string;
}

interface BrandingContextValue {
  tenantBranding: TenantBranding | null;
  appBranding: AppBranding;
  refreshBranding: () => Promise<void>;
  refreshTenantBranding: () => Promise<void>;
}

const defaultTenantBranding: TenantBranding = {
  logoUrl: null,
  displayName: "",
  colors: {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    accent: "#10b981",
    background: "#ffffff",
    text: "#111827",
    trackingButton: "#6366f1",
    trackingHeader: "#111827",
    trackingBadge: "#10b981",
  },
  texts: {
    trackingHeader: "Seguimiento de tu pedido",
    trackingFooter: "Gracias por tu compra",
  },
  links: {
    instagram: "",
    whatsapp: "",
    web: "",
  },
  pdfConfig: {
    headerText: "",
    footerText: "",
    showLogo: true,
  },
};

const defaultAppBranding: AppBranding = {
  orbiaLogoUrl: null,
  orbiaName: "Orbia",
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [appBranding, setAppBranding] = useState<AppBranding>(defaultAppBranding);

  const fetchAppBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/branding/app");
      const data = await res.json();
      if (data.data) {
        setAppBranding({
          orbiaLogoUrl: data.data.orbiaLogoUrl || null,
          orbiaName: data.data.orbiaName || "Orbia",
        });
      } else {
        setAppBranding(defaultAppBranding);
      }
    } catch {
      setAppBranding(defaultAppBranding);
    }
  }, []);

  const fetchTenantBranding = useCallback(async () => {
    if (!isAuthenticated || !user?.tenantId || user?.isSuperAdmin) {
      setTenantBranding(null);
      return;
    }
    try {
      const res = await fetch("/api/branding/tenant", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("orbia_token") || ""}`,
        },
      });
      const data = await res.json();
      if (data.data) {
        const payload = data.data;
        setTenantBranding({
          logoUrl: payload.logoUrl || null,
          displayName: payload.displayName || "",
          colors: {
            ...defaultTenantBranding.colors,
            ...(payload.colors || {}),
          },
          texts: {
            ...defaultTenantBranding.texts,
            ...(payload.texts || {}),
          },
          links: {
            ...defaultTenantBranding.links,
            ...(payload.links || {}),
          },
          pdfConfig: {
            ...defaultTenantBranding.pdfConfig,
            ...(payload.pdfConfig || {}),
          },
        });
      } else {
        setTenantBranding(defaultTenantBranding);
      }
    } catch {
      setTenantBranding(defaultTenantBranding);
    }
  }, [isAuthenticated, user?.tenantId, user?.isSuperAdmin]);

  const refreshBranding = useCallback(async () => {
    await Promise.all([fetchAppBranding(), fetchTenantBranding()]);
  }, [fetchAppBranding, fetchTenantBranding]);

  useEffect(() => {
    fetchAppBranding();
  }, [fetchAppBranding]);

  useEffect(() => {
    fetchTenantBranding();
  }, [fetchTenantBranding]);

  const value = useMemo(
    () => ({
      tenantBranding,
      appBranding,
      refreshBranding,
      refreshTenantBranding: fetchTenantBranding,
    }),
    [tenantBranding, appBranding, refreshBranding, fetchTenantBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return context;
}

export { defaultTenantBranding, defaultAppBranding };
