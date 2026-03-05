import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
        content: "Acá vas a gestionar todo tu negocio: pedidos, caja, stock, clientes y más. Este recorrido tarda 2 minutos y te deja listo para arrancar.",
        placement: "center",
    },
    {
        id: "sidebar",
        targetSelector: ".joyride-sidebar",
        route: "/app",
        title: "El menú principal",
        emoji: "🧭",
        content: "Desde la barra lateral accedés a todos los módulos. Todo está a un click: pedidos, caja, productos, clientes y compras.",
        placement: "right",
    },
    {
        id: "configuracion",
        targetSelector: "[data-testid='nav-configuracion']",
        route: "/app/settings",
        title: "Primero: configurá tu negocio",
        emoji: "⚙️",
        content: "Antes de arrancar, completá el nombre, logo y colores de tu marca. También podés personalizar cómo se ven los pedidos de tus clientes.",
        tip: "Ir a Configuración → Personalización",
        placement: "right",
    },
    {
        id: "clientes",
        targetSelector: "[data-testid='nav-clientes']",
        route: "/app/customers",
        title: "Cargá tus clientes",
        emoji: "👥",
        content: "Acá guardás tu base de clientes. Podés agregarlos a mano o importarlos desde Excel. Al crear un pedido, se autocompletarán sus datos.",
        placement: "right",
    },
    {
        id: "productos",
        targetSelector: "[data-testid='nav-productos']",
        route: "/app/products",
        title: "¿Qué vendés?",
        emoji: "📦",
        content: "Cargá tus productos con precio, costo y stock. Podés organizarlos por categorías. El stock se descuenta automático cuando hacés una venta.",
        placement: "right",
    },
    {
        id: "caja",
        targetSelector: "[data-testid='nav-caja']",
        route: "/app/cash",
        title: "Controlá la plata",
        emoji: "💰",
        content: "Acá abrís una sesión de caja para empezar a registrar movimientos. Cada venta o pedido cobrado impacta directamente en la caja abierta.",
        tip: "Hacé click en \"Abrir caja\" para iniciar tu primera sesión.",
        placement: "right",
    },
    {
        id: "pedidos",
        targetSelector: "[data-testid='nav-pedidos']",
        route: "/app/orders",
        title: "Creá tu primer pedido",
        emoji: "📋",
        content: "Cada pedido tiene un estado (pendiente, en proceso, listo) y un link de seguimiento único para que el cliente vea cómo va su pedido en tiempo real.",
        tip: "Tocá \"Nuevo pedido\" y elegí un cliente de tu lista.",
        placement: "right",
    },
    {
        id: "ventas",
        targetSelector: "[data-testid='nav-ventas']",
        route: "/app/pos",
        title: "Hacé ventas rápidas",
        emoji: "🏪",
        content: "El Punto de Venta (POS) es para ventas directas: buscás el producto, elegís el método de pago y generás el ticket. También podés imprimir o enviar por WhatsApp.",
        placement: "right",
    },
    {
        id: "compras",
        targetSelector: "[data-testid='nav-compras']",
        route: "/app/purchases",
        title: "Controlá tus compras",
        emoji: "🛒",
        content: "Cuando recibís mercadería de un proveedor, registrala acá. El stock se actualiza solo y el costo de cada compra se registra en caja como egreso.",
        placement: "right",
    },
    {
        id: "tracking",
        route: "/app/settings",
        title: "Seguimiento para tus clientes",
        emoji: "📍",
        content: "Cada pedido genera un link público que el cliente puede abrir para saber el estado de su pedido. En Configuración → Personalización podés cambiar los colores y el diseño.",
        tip: "Compartí el link de seguimiento por WhatsApp directo desde el pedido.",
        placement: "center",
    },
    {
        id: "cajeros",
        targetSelector: "[data-testid='nav-caja']",
        route: "/app/cashiers",
        title: "Sumá a tu equipo",
        emoji: "👤",
        content: "Si tenés empleados que usan la caja, podés crear cajeros con un PIN propio. Cada uno accede solo al POS, sin ver el resto del panel.",
        requiresFeature: "cashiers",
        placement: "right",
    },
    {
        id: "cierre",
        route: "/app",
        title: "¡Estás listo para arrancar!",
        emoji: "🚀",
        content: "Ya conocés todo lo que podés hacer con Orbia. Si necesitás ayuda, escribinos por WhatsApp y te respondemos enseguida. ¡Éxitos con tu negocio!",
        tip: "Podés reiniciar este tutorial desde Configuración → Cuenta.",
        placement: "center",
    },
];

function SpotlightOverlay({ rect }: { rect: DOMRect | null }) {
    if (!rect) {
        return <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />;
    }
    const pad = 10;
    return (
        <svg
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: "none" }}
        >
            <defs>
                <mask id="spotlight-mask">
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    <rect
                        x={rect.left - pad}
                        y={rect.top - pad}
                        width={rect.width + pad * 2}
                        height={rect.height + pad * 2}
                        rx="8"
                        ry="8"
                        fill="black"
                    />
                </mask>
            </defs>
            <rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.68)"
                mask="url(#spotlight-mask)"
            />
            {/* Spotlight border glow */}
            <rect
                x={rect.left - pad}
                y={rect.top - pad}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx="8"
                ry="8"
                fill="none"
                stroke="rgba(99,102,241,0.7)"
                strokeWidth="2"
            />
        </svg>
    );
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
    const [, setLocation] = useLocation();
    const [isActive, setIsActive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const { plan } = usePlan();
    const retriesRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const steps = ALL_STEPS.filter((s) => {
        if (!s.requiresFeature) return true;
        if (!plan) return false;
        return plan.features[s.requiresFeature] === true;
    });

    const { isAuthenticated, user } = useAuth();

    useEffect(() => {
        const completed = localStorage.getItem("onboarding_completed");
        if (!completed && isAuthenticated && user && !user.isSuperAdmin) {
            const timer = setTimeout(() => setIsActive(true), 1200);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticated, user]);

    const startOnboarding = useCallback(() => {
        setCurrentStep(0);
        setIsActive(true);
        localStorage.removeItem("onboarding_completed");
    }, []);

    const stopOnboarding = useCallback(() => {
        setIsActive(false);
        localStorage.setItem("onboarding_completed", "true");
        if (retriesRef.current) clearTimeout(retriesRef.current);
    }, []);

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

        setLocation(step.route);
        setTargetRect(null);

        if (!step.targetSelector) return;

        if (retriesRef.current) clearTimeout(retriesRef.current);

        let retries = 0;
        const findEl = () => {
            const el = document.querySelector(step.targetSelector!) as HTMLElement | null;
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                setTimeout(() => {
                    const freshEl = document.querySelector(step.targetSelector!) as HTMLElement | null;
                    if (freshEl) setTargetRect(freshEl.getBoundingClientRect());
                }, 200);
            } else if (retries < 14) {
                retries++;
                retriesRef.current = setTimeout(findEl, 250);
            }
        };
        retriesRef.current = setTimeout(findEl, 400);

        const handleResize = () => {
            const el = document.querySelector(step.targetSelector!) as HTMLElement | null;
            if (el) setTargetRect(el.getBoundingClientRect());
        };
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            if (retriesRef.current) clearTimeout(retriesRef.current);
        };
    }, [isActive, currentStep, steps, setLocation]);

    const step = steps[currentStep];
    const isCenter = !step?.targetSelector || step?.placement === "center" || !targetRect;

    // Compute tooltip anchor position
    const getTooltipStyle = (): React.CSSProperties => {
        if (isCenter || !targetRect) {
            return {
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(440px, 90vw)",
            };
        }
        const placement = step?.placement ?? "right";
        const vw = window.innerWidth;
        const style: React.CSSProperties = {
            position: "fixed",
            width: "min(400px, 85vw)",
        };

        if (placement === "right") {
            const left = targetRect.right + 18;
            style.left = Math.min(left, vw - 420);
            style.top = Math.max(12, targetRect.top);
        } else if (placement === "left") {
            style.right = vw - targetRect.left + 18;
            style.top = Math.max(12, targetRect.top);
        } else if (placement === "bottom") {
            style.top = targetRect.bottom + 12;
            style.left = Math.max(12, Math.min(targetRect.left, vw - 420));
        } else {
            style.bottom = window.innerHeight - targetRect.top + 12;
            style.left = Math.max(12, Math.min(targetRect.left, vw - 420));
        }
        return style;
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
                        {/* SVG Spotlight */}
                        <div className="absolute inset-0">
                            <SpotlightOverlay rect={isCenter ? null : targetRect} />
                        </div>

                        {/* Tooltip card */}
                        <motion.div
                            key={`step-${currentStep}`}
                            initial={{ opacity: 0, scale: 0.88, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.88, y: -8 }}
                            transition={{ type: "spring", stiffness: 340, damping: 28 }}
                            className="bg-background border-2 border-primary/30 shadow-2xl rounded-2xl overflow-hidden"
                            style={{ ...getTooltipStyle(), pointerEvents: "auto" }}
                        >
                            {/* Colored accent bar */}
                            <div className="h-1.5 w-full bg-gradient-to-r from-primary to-primary/60" />

                            <div className="p-6 space-y-4">
                                {/* Header */}
                                <div className="flex items-start gap-3">
                                    <span className="text-3xl leading-none">{step.emoji}</span>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-lg leading-snug">{step.title}</h3>
                                        {/* Step dots */}
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            {steps.map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    layout
                                                    className={`rounded-full transition-colors ${i === currentStep
                                                        ? "bg-primary"
                                                        : i < currentStep
                                                            ? "bg-primary/40"
                                                            : "bg-muted"
                                                        }`}
                                                    style={{
                                                        width: i === currentStep ? 20 : 8,
                                                        height: 8,
                                                    }}
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

                                {/* Content */}
                                <p className="text-base text-foreground leading-relaxed">{step.content}</p>

                                {/* Tip box */}
                                {step.tip && (
                                    <div className="rounded-lg bg-primary/8 border border-primary/25 px-4 py-3">
                                        <p className="text-sm text-primary font-medium">💡 {step.tip}</p>
                                    </div>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-between gap-3 pt-1 border-t">
                                    <span className="text-sm text-muted-foreground font-medium">
                                        {currentStep + 1} de {steps.length}
                                    </span>
                                    <div className="flex gap-2">
                                        {currentStep > 0 && (
                                            <Button variant="outline" size="sm" onClick={prevStep}>
                                                ← Atrás
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={nextStep}
                                            className="px-6"
                                        >
                                            {currentStep === steps.length - 1 ? "¡Listo! 🎉" : "Dale →"}
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
