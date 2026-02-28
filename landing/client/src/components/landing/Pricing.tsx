import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

export function Pricing() {
  const plans = [
    {
      name: "Económico",
      slogan: "Para arrancar ordenado",
      description: "La base sólida para tu negocio.",
      price: "MDQ",
      highlighted: false,
      features: [
        "Sistema de caja básico",
        "Gestión de pedidos",
        "Link de seguimiento único",
        "Personalización parcial",
        "PDF con marca de agua"
      ],
      whatsappLink: "https://wa.me/5492236979026?text=Hola,%20me%20interesa%20el%20plan%20Económico%20de%20Orbia%20para%20mi%20negocio."
    },
    {
      name: "Profesional",
      slogan: "Para negocios que ya funcionan",
      description: "Todo lo que necesitas para escalar.",
      price: "Pro",
      highlighted: true,
      features: [
        "Todo lo de Económico, más:",
        "Manejo de productos y stock",
        "Listas de precios propias",
        "Caja completa y movimientos",
        "Resúmenes del mes detallados",
        "Documentos 100% a tu gusto",
        "Tus redes en el link de pedidos"
      ],
      whatsappLink: "https://wa.me/5492236979026?text=Hola,%20me%20interesa%20el%20plan%20Profesional%20de%20Orbia%20para%20mi%20negocio."
    },
    {
      name: "Escala",
      slogan: "Para locales con varias sedes",
      description: "Potencia corporativa para PyMEs.",
      price: "Multi",
      highlighted: false,
      features: [
        "Todo lo de Profesional, más:",
        "Hasta 5 sucursales",
        "Control por cada sucursal",
        "Generar Factura B (AFIP)",
        "IA: Dictado por voz integrado",
        "Soporte VIP presencial"
      ],
      whatsappLink: "https://wa.me/5492236979026?text=Hola,%20me%20interesa%20el%20plan%20Escala%20de%20Orbia%20para%20mis%20sucursales."
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4 font-display">Planes a tu medida.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15, duration: 0.6 }}
              className={`relative rounded-[2.5rem] p-10 flex flex-col transition-all duration-500 ${plan.highlighted
                  ? 'bg-primary text-primary-foreground shadow-[0_32px_64px_-16px_rgba(59,130,246,0.3)] scale-100 md:scale-105 z-10 border-none'
                  : 'bg-card border-2 border-border/50 shadow-xl hover:shadow-2xl hover:border-primary/20'
                }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 inset-x-0 transform -translate-y-1/2 flex justify-center">
                  <span className="bg-accent text-accent-foreground text-xs font-black uppercase tracking-[0.2em] py-2 px-6 rounded-full shadow-lg">
                    Recomendado
                  </span>
                </div>
              )}

              <div className="mb-10">
                <p className={`text-xs font-black uppercase tracking-widest mb-4 ${plan.highlighted ? 'text-primary-foreground/70' : 'text-accent'}`}>
                  {plan.slogan}
                </p>
                <h3 className={`text-3xl font-black mb-2 font-display ${plan.highlighted ? 'text-white' : 'text-foreground'}`}>
                  {plan.name}
                </h3>
                <p className={`text-base font-medium ${plan.highlighted ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-5 mb-10 flex-grow">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <div className={`mr-4 shrink-0 mt-1 h-2 w-2 rounded-full ${plan.highlighted ? 'bg-accent' : 'bg-primary'}`} />
                    <span className={`text-sm font-bold ${plan.highlighted ? 'text-primary-foreground' : 'text-foreground/80'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`w-full rounded-2xl py-8 text-lg font-black transition-all duration-300 ${plan.highlighted
                    ? 'bg-white text-primary hover:bg-slate-50 hover:scale-[1.02]'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02]'
                  }`}
              >
                <a href={plan.whatsappLink} target="_blank" rel="noopener noreferrer">
                  {plan.highlighted ? 'Elegir Plan Pro' : 'Consultar Ahora'}
                </a>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
