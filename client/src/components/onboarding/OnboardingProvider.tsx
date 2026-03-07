import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/plan";
import { useAuth } from "@/lib/auth";

export interface OnboardingStep {
  id: string;
  targetSelector?: string;
  route: string;
  title: string;
  emoji: string;
  content: string;
  tip?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  requiresFeature?: string;
}

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

interface OnboardingContextProps {
  startOnboarding: () => void;
  stopOnboarding: () => void;
  isActive: boolean;
}

const OnboardingContext = createContext<OnboardingContextProps | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

const ALL_STEPS: OnboardingStep[] = [
  {
    id: "bienvenida",
    route: "/app",
    title: "¡Bienvenido a Orbia!",
    emoji: "👋",
    content: "Acá gestionás todo tu negocio: pedidos, caja, stock y clientes. Te mostramos lo más importante en 2 minutos.",
    placement: "center",
  },
  {
    id: "sidebar",
    targetSelector: ".joyride-sidebar",
    route: "/app",
    title: "Menú principal",
    emoji: "🧭",
    content: "Desde acá entrás a todos los módulos.",
    placement: "right",
  },
  {
    id: "configuracion",
    targetSelector: "[data-testid='nav-configuracion']",
    route: "/app/settings",
    title: "Configurá tu negocio",
    emoji: "⚙️",
    content: "Completá nombre, logo y colores para que todo salga con tu marca.",
    tip: "Entrá a Configuración → Personalización.",
    placement: "right",
  },
  {
    id: "clientes",
    targetSelector: "[data-testid='nav-clientes']",
    route: "/app/customers",
    title: "Cargá clientes",
    emoji: "👥",
    content: "Guardá tus clientes para crear pedidos más rápido.",
    placement: "right",
  },
  {
    id: "productos",
    targetSelector: "[data-testid='nav-productos']",
    route: "/app/products",
    title: "Cargá productos",
    emoji: "📦",
    content: "Definí precio, costo y stock. Se descuenta automático cuando vendés.",
    placement: "right",
  },
  {
    id: "caja",
    targetSelector: "[data-testid='nav-caja']",
    route: "/app/cash",
    title: "Manejá la caja",
    emoji: "💰",
    content: "Abrí una caja y registrá ingresos y egresos del día.",
    tip: "Empezá con “Abrir caja”.",
    placement: "right",
  },
  {
    id: "pedidos",
    targetSelector: "[data-testid='nav-pedidos']",
    route: "/app/orders",
    title: "Creá pedidos",
    emoji: "📋",
    content: "Cada pedido tiene estado y link de seguimiento para tu cliente.",
    tip: "Probá con “Nuevo pedido”.",
    placement: "right",
  },
  {
    id: "ventas",
    targetSelector: "[data-testid='nav-ventas']",
    route: "/app/pos",
    title: "Ventas rápidas",
    emoji: "🏪",
    content: "En POS cobrás, emitís ticket y cerrás la venta al instante.",
    placement: "right",
  },
  {
    id: "compras",
    targetSelector: "[data-testid='nav-compras']",
    route: "/app/purchases",
    title: "Registrá compras",
    emoji: "🛒",
    content: "Cuando ingresa mercadería, registrala acá para actualizar stock y costos.",
    placement: "right",
  },
  {
    id: "tracking",
    route: "/app/settings",
    title: "Seguimiento de clientes",
    emoji: "📍",
    content: "Podés compartir links públicos para que cada cliente vea el estado de su pedido.",
    tip: "Lo configurás en Personalización.",
    placement: "center",
  },
  {
    id: "cajeros",
    targetSelector: "[data-testid='nav-caja']",
    route: "/app/cashiers",
    title: "Sumá cajeros",
    emoji: "👤",
    content: "Creá cajeros con PIN para que usen solo el POS.",
    requiresFeature: "cashiers",
    placement: "right",
  },
  {
    id: "cierre",
    route: "/app",
    title: "¡Listo para arrancar!",
    emoji: "🚀",
    content: "Ya tenés lo básico para empezar a vender y controlar tu negocio.",
    tip: "Podés reiniciar este recorrido desde Configuración → Cuenta.",
    placement: "center",
  },
];

const MOBILE_COPY: Record<string, { content?: string; tip?: string }> = {
  bienvenida: { content: "Te mostramos lo clave para arrancar rápido." },
  sidebar: { content: "Acá está el menú principal." },
  configuracion: { content: "Configurá nombre, logo y colores." },
  clientes: { content: "Acá cargás y buscás clientes." },
  productos: { content: "Acá cargás productos y stock." },
  caja: { content: "Acá controlás ingresos y egresos." },
  pedidos: { content: "Creá pedidos y seguí su estado." },
  ventas: { content: "Vendé rápido desde POS." },
  compras: { content: "Registrá compras para actualizar stock." },
  tracking: { content: "Compartí seguimiento con tus clientes." },
  cajeros: { content: "Creá cajeros con PIN para POS." },
  cierre: { content: "¡Ya podés empezar a usar Orbia!" },
};

function SpotlightOverlay({ rect, isMobile }: { rect: RectLike | null; isMobile: boolean }) {
  if (!rect) {
    return <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} />;
  }

  const pad = isMobile ? 8 : 12;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const left = Math.max(6, rect.left - pad);
  const top = Math.max(6, rect.top - pad);
  const w = Math.min(rect.width + pad * 2, width - left - 6);
  const h = Math.min(rect.height + pad * 2, height - top - 6);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none", background: "rgba(0,0,0,0.56)" }}>
      <motion.div
        initial={false}
        animate={{ left, top, width: w, height: h }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute rounded-xl border-2 border-primary/70"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.08)" }}
      />
    </div>
  );
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const { plan } = usePlan();
  const { isAuthenticated, user } = useAuth();

  const retriesRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSelectorRef = useRef<string | null>(null);

  const isMobile = viewport.width <= 768;

  const steps = useMemo(() => ALL_STEPS.filter((s) => {
    if (!s.requiresFeature) return true;
    if (!plan) return false;
    return plan.features[s.requiresFeature] === true;
  }), [plan]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.visualViewport?.width || window.innerWidth,
        height: window.visualViewport?.height || window.innerHeight,
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(() => {
    const completed = localStorage.getItem("onboarding_completed");
    if (!completed && isAuthenticated && user && !user.isSuperAdmin) {
      const timer = setTimeout(() => setIsActive(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, user]);

  const clearRetries = useCallback(() => {
    if (retriesRef.current) {
      clearTimeout(retriesRef.current);
      retriesRef.current = null;
    }
  }, []);

  const stopOnboarding = useCallback(() => {
    clearRetries();
    setIsActive(false);
    setTargetRect(null);
    setTargetMissing(false);
    localStorage.setItem("onboarding_completed", "true");
  }, [clearRetries]);

  const startOnboarding = useCallback(() => {
    clearRetries();
    setCurrentStep(0);
    setIsActive(true);
    setTargetRect(null);
    setTargetMissing(false);
    localStorage.removeItem("onboarding_completed");
  }, [clearRetries]);

  const goToStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= steps.length) {
      stopOnboarding();
      return;
    }
    setCurrentStep(idx);
  }, [steps.length, stopOnboarding]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) goToStep(currentStep + 1);
    else stopOnboarding();
  }, [currentStep, steps.length, goToStep, stopOnboarding]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  useEffect(() => {
    if (!isActive || steps.length === 0) return;
    const step = steps[currentStep];
    if (!step) return;

    clearRetries();
    setTargetRect(null);
    setTargetMissing(false);

    if (location !== step.route) {
      setLocation(step.route);
    }

    if (!step.targetSelector || step.placement === "center") {
      activeSelectorRef.current = null;
      return;
    }

    activeSelectorRef.current = step.targetSelector;

    let retries = 0;
    const maxRetries = isMobile ? 18 : 14;

    const tryResolveTarget = () => {
      const selector = activeSelectorRef.current;
      if (!selector) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el || el.offsetParent === null) {
        if (retries < maxRetries) {
          retries += 1;
          retriesRef.current = setTimeout(tryResolveTarget, 220);
          return;
        }
        setTargetMissing(true);
        setTargetRect(null);
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      window.setTimeout(() => {
        const fresh = document.querySelector(selector) as HTMLElement | null;
        if (!fresh || fresh.offsetParent === null) {
          setTargetMissing(true);
          setTargetRect(null);
          return;
        }
        const rect = fresh.getBoundingClientRect();
        const usable = rect.width > 6 && rect.height > 6;
        if (!usable) {
          setTargetMissing(true);
          setTargetRect(null);
          return;
        }
        setTargetMissing(false);
        setTargetRect({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
      }, isMobile ? 320 : 220);
    };

    retriesRef.current = setTimeout(tryResolveTarget, 280);

    const syncTargetRect = () => {
      const selector = activeSelectorRef.current;
      if (!selector) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el || el.offsetParent === null) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 6 || rect.height <= 6) return;
      setTargetRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    };

    window.addEventListener("resize", syncTargetRect);
    window.addEventListener("scroll", syncTargetRect, { passive: true });

    return () => {
      clearRetries();
      window.removeEventListener("resize", syncTargetRect);
      window.removeEventListener("scroll", syncTargetRect);
    };
  }, [isActive, currentStep, steps, location, setLocation, isMobile, clearRetries]);

  const step = steps[currentStep];
  const stepCopy = step ? (isMobile ? MOBILE_COPY[step.id] : undefined) : undefined;
  const content = stepCopy?.content || step?.content || "";
  const tip = stepCopy?.tip || step?.tip;

  const shouldCenter = !step?.targetSelector || step?.placement === "center" || targetMissing || !targetRect;
  const mobileFixedMode = isMobile;

  const getTooltipStyle = () => {
    const safeGap = isMobile ? 12 : 16;
    const cardWidth = isMobile ? Math.min(360, viewport.width - safeGap * 2) : Math.min(420, viewport.width - safeGap * 2);
    const maxH = Math.max(viewport.height - safeGap * 2, 100);

    if (isMobile) {
      return {
        position: "fixed" as const,
        left: "50%",
        bottom: safeGap,
        top: "auto",
        x: "-50%",
        y: "0%",
        width: cardWidth,
        maxHeight: maxH,
      };
    }

    // ALWAYS CENTERED FOR PC
    return {
      position: "fixed" as const,
      top: "50%",
      left: "50%",
      bottom: "auto",
      x: "-50%",
      y: "-50%",
      width: cardWidth,
      maxHeight: maxH,
    };
  };

  return (
    <OnboardingContext.Provider value={{ startOnboarding, stopOnboarding, isActive }}>
      {children}

      <AnimatePresence>
        {isActive && step && (
          <motion.div
            key="onboarding-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999]"
            style={{ pointerEvents: "none" }}
          >
            <div className="absolute inset-0">
              <SpotlightOverlay rect={mobileFixedMode || shouldCenter ? null : targetRect} isMobile={isMobile} />
            </div>

            <motion.div
              initial={false}
              animate={getTooltipStyle() as any}
              exit={{ opacity: 0 }}
              transition={isMobile ? { type: "spring", stiffness: 300, damping: 30 } : { duration: 0 }}
              className="bg-background border-2 border-primary/30 shadow-2xl rounded-2xl flex flex-col"
              style={{ pointerEvents: "auto", overflow: "hidden" }}
            >
              <div className="h-1.5 w-full bg-gradient-to-r from-primary to-primary/60 shrink-0" />

              <div className={`flex flex-col gap-3 overflow-y-auto ${isMobile ? "p-4" : "p-6"}`}>
                <div className="flex items-start gap-3 shrink-0">
                  <span className={`${isMobile ? "text-2xl" : "text-3xl"} leading-none`}>{step.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className={`${isMobile ? "text-base" : "text-lg"} font-bold leading-snug`}>{step.title}</h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {steps.map((_, i) => (
                        <motion.div
                          key={i}
                          layout
                          className={`rounded-full transition-colors ${i === currentStep ? "bg-primary" : i < currentStep ? "bg-primary/40" : "bg-muted"}`}
                          style={{ width: i === currentStep ? 20 : 8, height: 8 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={stopOnboarding}
                    className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted -mt-1 -mr-1 flex-shrink-0"
                    aria-label="Cerrar tutorial"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <motion.div
                  key={`copy-${step.id}-${isMobile ? "m" : "d"}`}
                  initial={{ opacity: 0.2 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`${isMobile ? "text-sm" : "text-base"} text-foreground leading-relaxed shrink-0`}
                >
                  {content}
                </motion.div>

                {tip && (
                  <div className="rounded-lg bg-primary/8 border border-primary/25 px-3 py-2 shrink-0">
                    <p className="text-sm text-primary font-medium">💡 {tip}</p>
                  </div>
                )}

                {targetMissing && step.targetSelector ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 shrink-0">
                    <p className="text-xs text-amber-700">No encontramos ese bloque en esta vista, seguimos con el próximo paso.</p>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2 pt-3 border-t shrink-0">
                  <span className="text-xs sm:text-sm text-muted-foreground font-medium">
                    {currentStep + 1} de {steps.length}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={stopOnboarding}>{isMobile ? "Salir" : "Saltar"}</Button>
                    {currentStep > 0 && (
                      <Button variant="outline" size="sm" onClick={prevStep}>Atrás</Button>
                    )}
                    <Button size="sm" onClick={nextStep} className="px-4">
                      {currentStep === steps.length - 1 ? "Finalizar" : "Siguiente"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingContext.Provider>
  );
}
