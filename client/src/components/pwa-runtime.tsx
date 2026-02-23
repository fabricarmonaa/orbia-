import { useEffect } from "react";
import { useLocation } from "wouter";
import { registerSW } from "virtual:pwa-register";

type PanelMeta = {
  manifestHref: string;
  themeColor: string;
  faviconHref: string;
  appleTouchHref: string;
  defaultTitle: string;
};

function getPanelMeta(path: string): PanelMeta {
  if (path.startsWith("/delivery")) {
    return {
      manifestHref: "/manifest-delivery.json",
      themeColor: "#0f172a",
      faviconHref: "/icons/tenant/favicon.ico?v=20260219",
      appleTouchHref: "/icons/delivery/icon-180.png",
      defaultTitle: "ORBIA - DELIVERY",
    };
  }

  if (path.startsWith("/owner") || path.startsWith("/super")) {
    return {
      manifestHref: "/manifest-owner.json",
      themeColor: "#111827",
      faviconHref: "/icons/tenant/favicon.ico?v=20260219",
      appleTouchHref: "/icons/admin/icon-180.png",
      defaultTitle: "ORBIA - ADMINISTRACIÓN",
    };
  }

  return {
    manifestHref: "/manifest-tenant.json",
    themeColor: "#0f172a",
    faviconHref: "/icons/tenant/favicon.ico?v=20260219",
    appleTouchHref: "/icons/tenant/icon-180.png",
    defaultTitle: "ORBIA - PANEL CENTRAL",
  };
}

function titleForPath(path: string): string {
  if (path.startsWith("/delivery")) return "ORBIA - DELIVERY";

  if (path.startsWith("/owner") || path.startsWith("/super")) {
    if (path.includes("security")) return "ORBIA - SEGURIDAD";
    if (path.includes("tenant") || path === "/owner") return "ORBIA - NEGOCIOS";
    return "ORBIA - ADMINISTRACIÓN";
  }

  if (!path.startsWith("/app")) return "ORBIA";

  if (path.includes("/settings")) return "ORBIA - CONFIGURACIÓN";
  if (path.includes("/products")) return "ORBIA - PRODUCTOS";
  if (path.includes("/orders")) return "ORBIA - PEDIDOS";
  if (path.includes("/cash")) return "ORBIA - CAJA";
  if (path.includes("/branches")) return "ORBIA - SUCURSALES";
  if (path.includes("/dashboard") || path === "/app") return "ORBIA - PANEL CENTRAL";

  return "ORBIA - PANEL CENTRAL";
}

function ensureLink(rel: string) {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function ensureMeta(name: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  return meta;
}

export function PwaRuntime() {
  const [location] = useLocation();

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onRegisterError(error: unknown) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Error al registrar Service Worker", error);
        }
      },
    });

    return () => {
      void updateSW(false);
    };
  }, []);

  useEffect(() => {
    const path = location || window.location.pathname;
    const panelMeta = getPanelMeta(path);

    const manifestLink = ensureLink("manifest");
    manifestLink.href = panelMeta.manifestHref;

    const iconLink = ensureLink("icon");
    iconLink.href = panelMeta.faviconHref;
    iconLink.type = "image/x-icon";

    const shortcutIconLink = ensureLink("shortcut icon");
    shortcutIconLink.href = panelMeta.faviconHref;
    shortcutIconLink.type = "image/x-icon";

    const appleTouch = ensureLink("apple-touch-icon");
    appleTouch.href = panelMeta.appleTouchHref;

    const themeMeta = ensureMeta("theme-color");
    themeMeta.content = panelMeta.themeColor;

    document.title = titleForPath(path) || panelMeta.defaultTitle;
  }, [location]);

  return null;
}
