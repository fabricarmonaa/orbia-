import { useEffect } from "react";
import { useLocation } from "wouter";
import { getToken, getUser, gracefulLogout } from "@/lib/auth";

export function AuthGuard() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const path = location || window.location.pathname;
    const isTenantPath = path.startsWith("/app");
    const isSuperPath = path.startsWith("/owner") || path.startsWith("/super");
    const isDeliveryPanel = path.startsWith("/delivery/panel");

    if (!isTenantPath && !isSuperPath && !isDeliveryPanel) return;

    if (isDeliveryPanel) {
      const deliveryToken = localStorage.getItem("delivery_token");
      const deliveryAgent = localStorage.getItem("delivery_agent");
      if (!deliveryToken || !deliveryAgent) {
        setLocation("/delivery/login");
        return;
      }

      let active = true;
      fetch("/api/delivery/me", {
        headers: { Authorization: `Bearer ${deliveryToken}` },
      })
        .then(async (res) => {
          if (!active) return;
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("delivery_token");
            localStorage.removeItem("delivery_agent");
            localStorage.removeItem("delivery_tenant_name");
            setLocation("/delivery/login");
          }
        })
        .catch(() => {
          // noop
        });

      return () => {
        active = false;
      };
    }

    const token = getToken();
    const user = getUser();
    if (!token) {
      void gracefulLogout("required");
      return;
    }

    if (isSuperPath && !user?.isSuperAdmin) {
      void gracefulLogout("invalid");
      return;
    }

    if (isTenantPath && user?.isSuperAdmin) {
      void gracefulLogout("invalid");
      return;
    }

    const validationEndpoint = isSuperPath ? "/api/super/security" : "/api/me";
    let active = true;
    fetch(validationEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          await gracefulLogout("invalid");
        }
      })
      .catch(() => {
        // noop
      });

    return () => {
      active = false;
    };
  }, [location, setLocation]);

  return null;
}
