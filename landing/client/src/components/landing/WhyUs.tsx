import { motion } from "framer-motion";
import { Cloud, Smartphone, ShieldCheck, MessageCircle, Clock, Zap } from "lucide-react";

export function WhyUs() {
  const reasons = [
    { icon: <Cloud className="w-5 h-5"/>, title: "Sistema en la nube", text: "Tus datos siempre disponibles y resguardados." },
    { icon: <Smartphone className="w-5 h-5"/>, title: "Cualquier dispositivo", text: "Usalo desde PC, tablet o tu celular." },
    { icon: <ShieldCheck className="w-5 h-5"/>, title: "Datos seguros", text: "Backups automáticos y privacidad total." },
    { icon: <MessageCircle className="w-5 h-5"/>, title: "Soporte directo", text: "Hablamos por WhatsApp, sin tickets infinitos." },
    { icon: <Clock className="w-5 h-5"/>, title: "Sin contratos", text: "Cancelás cuando querés, sin letra chica." },
    { icon: <Zap className="w-5 h-5"/>, title: "Escalable", text: "Crece a la par de tu negocio, sin trabas." },
  ];

  return (
    <section className="py-24 bg-background border-t border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-1/3"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6 leading-tight">
              No somos un sistema más. <br/>
              <span className="text-primary">Somos tu aliado para crecer.</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Entendemos el día a día del comerciante. Por eso creamos una herramienta que te quita peso de encima en lugar de sumarte complicaciones.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6"
          >
            {reasons.map((reason, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors">
                <div className="mt-1 flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {reason.icon}
                </div>
                <div>
                  <h4 className="font-bold text-foreground mb-1">{reason.title}</h4>
                  <p className="text-sm text-muted-foreground">{reason.text}</p>
                </div>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  );
}
