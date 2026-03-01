import { useEffect } from "react";
import { useLocation } from "wouter";
import { getToken, gracefulLogout } from "@/lib/auth";

export function AuthGuard() {
  const [location] = useLocation();

  useEffect(() => {
    const hasTenantAppPath = location.startsWith("/app");
    if (!hasTenantAppPath) return;

    const token = getToken();
    if (!token) {
      void gracefulLogout("required");
      return;
    }

    let active = true;
    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          await gracefulLogout("invalid");
        }
      })
      .catch(() => {
        // noop
      });

    return () => {
      active = false;
    };
  }, [location]);

  return null;
}
