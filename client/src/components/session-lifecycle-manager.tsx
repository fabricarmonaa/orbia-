import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getToken, gracefulLogout, stopSessionActivity } from "@/lib/auth";

export function SessionLifecycleManager() {
  const { toast } = useToast();

  useEffect(() => {
    const storedMessage = sessionStorage.getItem("orbia_logout_message");
    if (storedMessage) {
      toast({ title: storedMessage });
      sessionStorage.removeItem("orbia_logout_message");
    }

    const onLogout = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        toast({ title: detail.message });
      }
    };

    const onOffline = () => {
      queryClient.cancelQueries();
      toast({
        title: "Sin conexión",
        description: "Pausamos las solicitudes hasta que vuelva internet.",
        variant: "destructive",
      });
    };

    const onOnline = () => {
      queryClient.invalidateQueries({ refetchType: "active" });
      toast({ title: "Conexión restablecida" });
    };

    const onBeforeUnload = () => {
      stopSessionActivity();
      const token = getToken();
      if (token && navigator.sendBeacon) {
        navigator.sendBeacon("/api/auth/logout", new Blob([], { type: "application/json" }));
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopSessionActivity();
      }
    };

    window.addEventListener("orbia:logout", onLogout as EventListener);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("orbia:logout", onLogout as EventListener);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [toast]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (navigator.onLine === false) {
      void gracefulLogout("offline");
    }
  }, []);

  return null;
}
