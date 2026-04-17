import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isPublicRoute, stopSessionActivity } from "@/lib/auth";

export function SessionLifecycleManager() {
  const { toast } = useToast();

  useEffect(() => {
    const isPublicTracking = isPublicRoute(window.location.pathname);
    const storedMessage = sessionStorage.getItem("orbia_logout_message");
    if (storedMessage && !isPublicTracking) {
      toast({ title: storedMessage });
    }
    if (storedMessage) sessionStorage.removeItem("orbia_logout_message");

    const onLogout = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message && !isPublicRoute(window.location.pathname)) {
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
    };

    window.addEventListener("orbia:logout", onLogout as EventListener);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("orbia:logout", onLogout as EventListener);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [toast]);

  return null;
}
