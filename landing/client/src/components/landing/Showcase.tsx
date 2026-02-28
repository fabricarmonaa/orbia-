import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import imgClients from "@assets/image_1772153968152.png";
import imgPos from "@assets/image_1772153969775.png";
import imgDashboard from "@assets/image_1772153971674.png";

export function Showcase() {
  const modules = [
    {
      title: "Punto de Venta Dinámico",
      description: "Agilizá el cobro. Interfaz ultra-rápida que soporta múltiples métodos de pago, descuentos y recargos automáticos. Hecho para no perder ni un segundo.",
      image: imgPos,
      reversed: false,
      tag: "Velocidad"
    },
    {
      title: "Gestión de Clientes",
      description: "Tus clientes son tu activo más importante. Gestioná deudas, preferencias y mantené una comunicación fluida por WhatsApp directamente desde su ficha.",
      image: imgClients,
      reversed: true,
      tag: "Relaciones"
    },
    {
      title: "Logística y Delivery",
      description: "Organizá tus repartos con rutas inteligentes. Link de seguimiento único para el cliente con total personalización de tu marca. Saben dónde está su pedido siempre.",
      image: imgDashboard,
      reversed: false,
      tag: "Control"
    }
  ];

  return (
    <section id="showcase" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-24">

          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-6xl font-extrabold text-foreground font-display tracking-tight"
          >
            Potencia sin fricción.
          </motion.h3>
        </div>

        <div className="space-y-40">
          {modules.map((mod, index) => (
            <div
              key={index}
              className={`flex flex-col lg:flex-row items-center gap-16 lg:gap-24 ${mod.reversed ? 'lg:flex-row-reverse' : ''}`}
            >

              <motion.div
                initial={{ opacity: 0, x: mod.reversed ? 50 : -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "circOut" }}
                className="w-full lg:w-1/2 space-y-8"
              >
                <div className="inline-block px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-xs uppercase tracking-widest border border-accent/20">
                  {mod.tag}
                </div>
                <h4 className="text-4xl md:text-5xl font-black text-foreground font-display leading-[1.1]">{mod.title}</h4>
                <p className="text-xl text-muted-foreground leading-relaxed font-medium">
                  {mod.description}
                </p>

              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="w-full lg:w-1/2 relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 rounded-[2.5rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                <div className="relative rounded-[2rem] border border-border/40 shadow-2xl overflow-hidden bg-white/50 backdrop-blur-sm p-3 group-hover:-translate-y-2 transition-transform duration-700">
                  <div className="rounded-[1.5rem] overflow-hidden border border-border/20 shadow-inner">
                    <img
                      src={mod.image}
                      alt={mod.title}
                      className="w-full h-auto object-cover scale-100 group-hover:scale-110 transition-transform duration-1000 ease-in-out"
                    />
                  </div>
                </div>
              </motion.div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
