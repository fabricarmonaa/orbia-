import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function BottomCTA() {
  const whatsappLink = "https://wa.me/5491123456789?text=Hola,%20quiero%20empezar%20con%20Orbia%20hoy.";

  return (
    <section className="py-24 bg-primary relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-accent rounded-full opacity-20 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-white rounded-full opacity-10 blur-3xl"></div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
          ¿Listo para profesionalizar tu negocio?
        </h2>
        <p className="text-xl text-primary-foreground/90 mb-10 max-w-2xl mx-auto">
          Empezá hoy mismo y llevá el control total de tu empresa. Configuración en minutos, beneficios para siempre.
        </p>
        <Button 
          asChild 
          size="lg" 
          className="rounded-full px-10 h-16 text-lg font-bold bg-white text-primary hover:bg-slate-100 shadow-2xl hover:shadow-white/20 hover:-translate-y-1 transition-all duration-300"
        >
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-3 h-6 w-6 text-emerald-500" />
            Hablar ahora por WhatsApp
          </a>
        </Button>
        <p className="mt-6 text-sm text-primary-foreground/70">
          Respuesta en menos de 5 minutos en horario comercial.
        </p>
      </div>
    </section>
  );
}
