import { motion } from "framer-motion";
import { Store, ShoppingBag, Coffee, Wrench } from "lucide-react";

export function TargetAudiences() {
    const profiles = [
        {
            icon: <Store className="h-6 w-6 text-primary" />,
            title: "Kioscos y Despensas",
            description: "Controlá tu stock al milímetro y cobrá rápido, ideal para negocios con alta rotación de clientes.",
        },
        {
            icon: <ShoppingBag className="h-6 w-6 text-primary" />,
            title: "Tiendas de Ropa",
            description: "Organizá tus prendas por talle y color. Conocé a tus clientes frecuentes y ofreceles promociones.",
        },
        {
            icon: <Coffee className="h-6 w-6 text-primary" />,
            title: "Gastronomía",
            description: "Gestioná pedidos, mesas y comandas con fluidez para brindar un servicio destacado a tus comensales.",
        },
        {
            icon: <Wrench className="h-6 w-6 text-primary" />,
            title: "Servicios Técnicos",
            description: "Mantené el tracking del estado de reparaciones y avisa a tus clientes automáticamente por WhatsApp.",
        }
    ];

    return (
        <section id="audiences" className="py-24 bg-background relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 scale-150 -rotate-12 translate-x-1/2 -translate-y-1/2">
                <Store className="h-96 w-96 text-primary" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl font-extrabold text-foreground mb-6 font-display tracking-tight"
                    >
                        Orbia es para quienes <span className="text-primary">hacen crecer su negocio.</span>
                    </motion.h2>
                    <p className="text-xl text-muted-foreground font-medium">
                        Entendemos el día a día del comerciante. Diseñamos módulos específicos para que no pagues de más por funciones que no usás.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {profiles.map((profile, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                            className="bg-card border-2 border-border/40 p-8 rounded-[1.5rem] shadow-sm hover:border-primary/50 hover:-translate-y-2 transition-transform duration-300 group"
                        >
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform duration-300">
                                {profile.icon}
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-3">{profile.title}</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed font-medium">
                                {profile.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
