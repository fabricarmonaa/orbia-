import { motion } from "framer-motion";
import { CheckCircle2, TrendingUp, Users, Wallet, Boxes, LayoutDashboard, Truck, Smartphone } from "lucide-react";

export function Features() {
  const features = [
    {
      icon: <Smartphone className="h-6 w-6 text-primary" />,
      title: "Instalable (PWA)",
      description: "Descargá Orbia en cualquier dispositivo. Funciona como una App nativa en PC, Tablet o Celular."
    },
    {
      icon: <Truck className="h-6 w-6 text-primary" />,
      title: "Add-on de Deliverys",
      description: "Establecé rutas óptimas para tus repartidores y enlistá pedidos por zonas de entrega al instante."
    },
    {
      icon: <LayoutDashboard className="h-6 w-6 text-primary" />,
      title: "Tracking Único",
      description: "Cada cliente recibe un link de seguimiento único y personalizado para su pedido en tiempo real."
    },
    {
      icon: <TrendingUp className="h-6 w-6 text-primary" />,
      title: "Ventas sin Vueltas",
      description: "Registrá ventas con múltiples métodos de pago y controlá tu stock de forma automática."
    },
    {
      icon: <Wallet className="h-6 w-6 text-primary" />,
      title: "Caja Blindada",
      description: "Mantené el control total de tus ingresos y egresos diarios sin margen de error."
    }
  ];

  return (
    <section id="features" className="py-24 bg-muted/20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-extrabold text-foreground mb-6 font-display tracking-tight"
          >
            Dejá de pelear con <br className="hidden sm:block" />
            <span className="text-primary underline decoration-accent/30 decoration-4 underline-offset-8">sistemas del siglo pasado.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground font-medium"
          >
            Hecho en Mar del Plata para comerciantes que valoran su tiempo y buscan profesionalizar su marca.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="bg-card border-2 border-border/50 p-8 rounded-[2rem] shadow-sm hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 group"
            >
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3 font-display">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed font-medium">
                {feature.description}
              </p>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-primary to-accent p-10 rounded-[2rem] shadow-2xl text-primary-foreground flex flex-col justify-center items-start lg:col-span-1 md:col-span-2 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 rotate-12 group-hover:scale-[2] transition-transform duration-700">
              <Boxes className="h-32 w-32" />
            </div>
            <CheckCircle2 className="h-12 w-12 text-primary-foreground/80 mb-6" />
            <h3 className="text-3xl font-bold mb-4 leading-tight font-display">Control total y cercanía local.</h3>
            <p className="text-primary-foreground/90 font-bold text-lg">
              Un producto local y confiable.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
