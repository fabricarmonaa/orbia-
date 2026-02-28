import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import imgDashboard from "@assets/image_1772153971674.png";

export function Hero() {
  const whatsappLink = "https://wa.me/5492236979026?text=Hola,%20quiero%20empezar%20con%20Orbia%20en%20mi%20negocio.";

  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      <div className="hero-glow"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-semibold text-primary mb-6 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              Desde Mar del Plata para el mundo
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-foreground tracking-tighter leading-[1.05] mb-6 text-balance font-display">
              Controlá tu negocio <br className="hidden lg:block" />
              <span className="gradient-text">sin vueltas.</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto lg:mx-0 text-balance leading-relaxed font-medium">
              Gestioná pedidos, caja, ventas y clientes. <span className="text-foreground">Orbia</span> es un sistema descargable que te da el control total en cualquier dispositivo.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button asChild size="lg" className="rounded-2xl px-10 h-16 text-lg font-bold shadow-2xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-1 transition-all duration-300 bg-primary">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Empezar ahora
                  <ArrowRight className="ml-2 h-6 w-6" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-2xl px-10 h-16 text-lg font-bold border-2 border-border hover:bg-muted transition-all duration-300">
                <a href="https://wa.me/5492236979026?text=Hola,%20soy%20comerciante%20de%20MDP%20y%20tengo%20dudas%20sobre%20Orbia." target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-6 w-6 text-primary" />
                  WhatsApp Directo
                </a>
              </Button>
            </div>

            <div className="mt-10 flex items-center justify-center lg:justify-start gap-4 text-sm text-muted-foreground font-medium">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/40 to-accent/40" />
                  </div>
                ))}
              </div>
              <p>Confianza y cercanía en cada gestión</p>
            </div>
          </motion.div>

          {/* Hero Image / Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative mx-auto w-full max-w-lg lg:max-w-none"
          >
            <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-tr from-primary/20 via-transparent to-accent/20 blur-2xl"></div>
            <div className="relative rounded-2xl border border-border/50 bg-white shadow-2xl p-2 lg:p-4">
              <div className="rounded-xl overflow-hidden border border-border/50 bg-muted">
                <img
                  src={imgDashboard}
                  alt="Dashboard de Orbia"
                  className="w-full h-auto object-cover transform hover:scale-105 transition-transform duration-700 ease-out"
                />
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-6 -left-6 lg:-left-10 bg-white p-4 rounded-2xl shadow-xl border border-border/50 flex items-center gap-4 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="bg-emerald-100 p-2 rounded-full">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Venta registrada</p>
                <p className="text-xs text-muted-foreground">Hace unos segundos</p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
