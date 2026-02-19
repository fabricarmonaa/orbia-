import { motion } from "framer-motion";
import { 
  ArrowRight, 
  Check, 
  ChevronRight, 
  LayoutDashboard, 
  ShoppingBag, 
  Wallet, 
  Package, 
  Store, 
  Settings, 
  FileText, 
  MessageSquare, 
  Truck,
  PlusCircle,
  TrendingUp,
  ShieldCheck,
  Zap,
  Smartphone,
  Globe,
  Phone,
  MessageCircle
} from "lucide-react";

import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import { useScrollTo } from "@/hooks/use-scroll-to";
import { useWhatsApp } from "@/hooks/use-whatsapp";

// Import assets
import imgProductos from '@assets/image_1771538153374.png';
import imgSucursales from '@assets/image_1771538179750.png';
import imgMensajeria from '@assets/image_1771538363946.png';

export default function Home() {
  const scrollTo = useScrollTo();
  const { openWhatsApp, phoneNumberFormatted } = useWhatsApp();

  const containerAnimation = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const features = [
    {
      icon: <LayoutDashboard className="h-6 w-6 text-blue-600" />,
      title: "Panel de Control",
      description: "Mirá cómo va tu negocio hoy: ventas, lo que entra y sale de plata, y tus resultados del mes al instante."
    },
    {
      icon: <ShoppingBag className="h-6 w-6 text-blue-600" />,
      title: "Tus Pedidos",
      description: "Seguí cada venta paso a paso. Agregá comentarios, mirá el historial y compartí un link para que tu cliente sepa por dónde va su pedido."
    },
    {
      icon: <Wallet className="h-6 w-6 text-blue-600" />,
      title: "Manejo de Caja",
      description: "Controlá tu efectivo sin vueltas. Aperturas, cierres y arqueos súper fáciles para que siempre te den las cuentas."
    },
    {
      icon: <Package className="h-6 w-6 text-blue-600" />,
      title: "Tus Productos",
      description: "Cargá y editá tus productos en segundos. Organizalos por categorías, controlá el stock y exportá tus listas cuando quieras."
    },
    {
      icon: <Store className="h-6 w-6 text-blue-600" />,
      title: "Sucursales",
      description: "Si tenés más de un local, podés manejar todo desde un solo lugar. Ideal para acompañar tu crecimiento."
    },
    {
      icon: <Settings className="h-6 w-6 text-blue-600" />,
      title: "Tu Marca",
      description: "Poné tu logo, elegí tus colores y sumá tus redes sociales. Hacé que el sistema se vea como parte de tu negocio."
    },
    {
      icon: <FileText className="h-6 w-6 text-blue-600" />,
      title: "Comprobantes y PDFs",
      description: "Creá facturas y documentos con un diseño profesional. Podés ver cómo quedan antes de bajarlos o enviarlos."
    },
    {
      icon: <MessageSquare className="h-6 w-6 text-blue-600" />,
      title: "Mensajes Automáticos",
      description: "Ahorrá tiempo con mensajes de WhatsApp ya listos. Mandá confirmaciones y avisos sin tener que escribir lo mismo mil veces."
    },
    {
      icon: <Truck className="h-6 w-6 text-blue-600" />,
      title: "Envíos y Delivery",
      description: "Un apartado exclusivo para tus repartidores. Organizá las rutas, asigná pedidos y llevá el control de cada entrega."
    }
  ];

  const screenshots = [
    { src: imgProductos, title: "Gestión de Productos", desc: "Control de stock y precios al instante" },
    { src: imgSucursales, title: "Multi-sucursal", desc: "Administrá todos tus locales desde un solo lugar" },
    { src: imgMensajeria, title: "Mensajería Inteligente", desc: "Plantillas de WhatsApp para agilizar ventas" },
  ];

  return (
    <div className="min-h-screen font-sans bg-white selection:bg-primary/20">
      <Navigation />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100 via-white to-white opacity-70"></div>
        <div className="container mx-auto px-4 md:px-6 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto"
          >
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {["Pedidos", "Caja", "Productos", "Sucursales", "PDFs", "WhatsApp", "Delivery"].map((badge) => (
                <Badge key={badge} variant="secondary" className="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100">
                  {badge}
                </Badge>
              ))}
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]">
              Gestioná tu negocio <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                sin planillas
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Controlá ventas, caja y productos en un solo lugar. 
              ORBIA se adapta al crecimiento de tu empresa.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="lg" 
                className="h-14 px-8 rounded-full text-lg bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200"
                onClick={() => openWhatsApp("Hola! Me interesa conocer más sobre ORBIA.")}
              >
                Quiero saber más
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="h-14 px-8 rounded-full text-lg border-slate-300 text-slate-600 hover:bg-slate-50"
                onClick={() => scrollTo('modulos')}
              >
                Ver qué incluye
              </Button>
            </div>
            <p className="mt-6 text-sm text-slate-500 flex items-center justify-center gap-2">
              <Smartphone className="w-4 h-4" />
              <span>Instalalo como una App en tu celu, ¡incluido en todos los planes!</span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* VALUE PROP SECTION */}
      <section className="py-20 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="¿Qué es ORBIA?"
            title="Todo lo que necesitás para operar"
            subtitle="Olvidate de los excels desactualizados y los cuadernos perdidos."
          />
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="border-none shadow-md bg-white hover:shadow-lg transition-all duration-300">
              <CardContent className="pt-8 px-8 pb-8 text-center">
                <div className="mx-auto w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6 text-green-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Control Total</h3>
                <p className="text-slate-600">Gestión unificada de ventas y movimientos de caja. Sepa exactamente cuánto gana y gasta su negocio.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-white hover:shadow-lg transition-all duration-300 transform md:-translate-y-4">
              <CardContent className="pt-8 px-8 pb-8 text-center">
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 text-blue-600">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Potencia y Escala</h3>
                <p className="text-slate-600">Multisucursal, usuarios ilimitados y gestión de productos centralizada. Crezca sin cambiar de sistema.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-white hover:shadow-lg transition-all duration-300">
              <CardContent className="pt-8 px-8 pb-8 text-center">
                <div className="mx-auto w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Profesionalismo</h3>
                <p className="text-slate-600">Facturas PDF personalizables, link de seguimiento para clientes y mensajería automática.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* MODULES GRID */}
      <section id="modulos" className="py-24 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="Características"
            title="Módulos potentes y simples"
            subtitle="Diseñado pensando en la usabilidad y la rapidez operativa."
          />
          
          <motion.div 
            variants={containerAnimation}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto"
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={itemAnimation}>
                <Card className="h-full border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group">
                  <CardHeader className="pb-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                      {feature.icon}
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-500 leading-relaxed text-sm">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* GALLERY SECTION */}
      <section id="capturas" className="py-24 bg-slate-900 text-white">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="Mirá el sistema"
            title="Simple, clarito y potente"
            subtitle="Echale un vistazo a cómo se ve ORBIA por dentro."
            light={true}
          />
          
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {screenshots.map((shot, idx) => (
              <Dialog key={idx}>
                <DialogTrigger asChild>
                  <div className="group cursor-pointer rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 hover:border-blue-500 transition-all duration-300 relative aspect-video">
                    <img 
                      src={shot.src} 
                      alt={shot.title} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-6">
                      <p className="font-bold text-lg">{shot.title}</p>
                      <p className="text-slate-300 text-sm">{shot.desc}</p>
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-5xl bg-slate-900 border-slate-700 p-1">
                  <img src={shot.src} alt={shot.title} className="w-full h-auto rounded-lg" />
                  <div className="p-4 text-center text-white">
                    <h4 className="text-xl font-bold">{shot.title}</h4>
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="planes" className="py-24 bg-slate-50">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="Precios"
            title="Planes pensados para crecer"
            subtitle="Cada negocio es distinto. Elegí el plan que mejor se adapte a tu etapa actual."
          />
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
            {/* Plan Económico */}
            <Card className="border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 bg-white">
              <CardHeader className="text-center pt-8 pb-2">
                <CardTitle className="text-2xl font-bold text-slate-900">Económico</CardTitle>
                <p className="text-sm text-slate-500 mt-2">Para arrancar ordenado</p>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-4 mb-8">
                  {["Sistema de caja básico", "Gestión de pedidos", "Link de seguimiento", "Personalización parcial", "PDF con marca de agua"].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                      <Check className="w-5 h-5 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full bg-slate-100 text-slate-900 hover:bg-slate-200 hover:text-slate-900"
                  onClick={() => openWhatsApp("Hola! Quiero contratar el plan Económico.")}
                >
                  Elegir Económico
                </Button>
              </CardContent>
            </Card>

            {/* Plan Profesional */}
            <Card className="border-2 border-blue-600 shadow-2xl relative bg-white transform md:-translate-y-4 z-10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg">
                Más elegido
              </div>
              <CardHeader className="text-center pt-10 pb-2">
                <CardTitle className="text-2xl font-bold text-slate-900">Profesional</CardTitle>
                <p className="text-sm text-slate-500 mt-2">Para negocios que ya están funcionando</p>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-4 mb-8">
                  <li className="font-semibold text-blue-600 text-sm">Todo lo de Económico, más:</li>
                  {["Manejo de productos", "Listas de precios propias", "Caja completa y arqueos", "Seguimiento de movimientos", "Resúmenes del mes", "Documentos 100% a tu gusto", "Tus redes en el link de pedidos"].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate-700 font-medium">
                      <Check className="w-5 h-5 text-blue-600 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200"
                  onClick={() => openWhatsApp("Hola! Quiero contratar el plan Profesional.")}
                >
                  Elegir Profesional
                </Button>
              </CardContent>
            </Card>

            {/* Plan Escala */}
            <Card className="border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 bg-white">
              <CardHeader className="text-center pt-8 pb-2">
                <CardTitle className="text-2xl font-bold text-slate-900">Escala</CardTitle>
                <p className="text-sm text-slate-500 mt-2">Para locales con varias sedes</p>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-4 mb-8">
                  <li className="font-semibold text-slate-400 text-sm">Todo lo de Profesional, más:</li>
                  {["Hasta 20 sucursales", "10 usuarios por sucursal", "Control por cada sucursal", "Generar Factura B (AFIP)", "IA: Dictado por voz"].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                      <Check className="w-5 h-5 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => openWhatsApp("Hola! Quiero contratar el plan Escala.")}
                >
                  Elegir Escala
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ADDONS SECTION */}
      <section id="addons" className="py-24 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="Complementos"
            title="Potenciá aún más tu sistema"
            subtitle="Agregá funcionalidades extra según tu modelo de negocio."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card className="bg-slate-50 border-slate-200 hover:border-blue-300 transition-colors">
              <CardHeader>
                <Truck className="w-10 h-10 text-orange-500 mb-2" />
                <CardTitle>Delivery</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500 mb-4">Gestión de flota, asignación de pedidos a repartidores y rutas optimizadas.</p>
                <Button variant="link" className="p-0 text-blue-600" onClick={() => openWhatsApp("Hola! Quiero sumar el addon de Delivery.")}>Consultar addon &rarr;</Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200 hover:border-blue-300 transition-colors">
              <CardHeader>
                <MessageSquare className="w-10 h-10 text-green-500 mb-2" />
                <CardTitle>WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500 mb-4">Envío de mensajes pre-armados, confirmaciones de pedido y links de pago.</p>
                <Button variant="link" className="p-0 text-blue-600" onClick={() => openWhatsApp("Hola! Quiero sumar el addon de WhatsApp.")}>Consultar addon &rarr;</Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none col-span-1 lg:col-span-1">
              <CardHeader>
                <Globe className="w-10 h-10 text-blue-200 mb-2" />
                <CardTitle>Tu propia Web</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-100 mb-4 font-medium">
                  Creamos la página de tu negocio. <br/>
                  Diseño + Puesta en marcha + Soporte.
                  <br/><br/>
                  <span className="text-2xl font-bold text-white">$40.000</span> <span className="text-xs opacity-70">pago único</span>
                </p>
                <Button size="sm" className="w-full bg-white text-blue-700 hover:bg-blue-50" onClick={() => openWhatsApp("Hola! Quiero mi página web.")}>La quiero</Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-dashed border-2 border-slate-200 opacity-75">
              <CardHeader>
                <PlusCircle className="w-10 h-10 text-slate-300 mb-2" />
                <CardTitle className="text-slate-400">Próximamente</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-slate-400 space-y-2">
                  <li>• Reportes avanzados</li>
                  <li>• Integración pagos</li>
                  <li>• Automatizaciones</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-24 bg-slate-50">
        <div className="container mx-auto px-4 md:px-6">
          <SectionHeader 
            badge="FAQ"
            title="Preguntas Frecuentes"
            className="mb-8"
          />
          
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {[
                { q: "¿Necesito instalar algo?", a: "No. ORBIA es 100% web. Podés acceder desde cualquier navegador en tu computadora, tablet o celular sin instalar nada." },
                { q: "¿Puedo usarlo desde el celular?", a: "Sí, nuestra plataforma es totalmente responsiva y se adapta a cualquier tamaño de pantalla para que gestiones tu negocio estés donde estés." },
                { q: "¿Qué pasa si tengo más de una sucursal?", a: "Tenemos planes diseñados específicamente para gestión multi-sucursal que te permiten centralizar la información y comparar rendimientos." },
                { q: "¿Cómo funcionan los PDF y facturas?", a: "Contamos con un editor flexible que te permite configurar tus comprobantes con tu logo, colores y datos fiscales. Podés generar PDFs listos para imprimir o enviar." },
                { q: "¿Qué incluye el soporte?", a: "Todos los planes incluyen asistencia directa por WhatsApp y correo electrónico para resolver dudas operativas rápidamente." },
                { q: "¿Se puede personalizar con mi marca?", a: "Sí, podés configurar tus colores, subir tu logo y adaptar los mensajes automáticos para que tus clientes vean tu identidad, no la nuestra." },
              ].map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="bg-white border border-slate-200 rounded-lg mb-4 px-4 shadow-sm">
                  <AccordionTrigger className="text-left font-medium text-slate-800 hover:text-blue-600">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-slate-600">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA CONTACT */}
      <section className="py-24 bg-blue-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            ¿Listo para ordenar tu negocio?
          </h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Empezá hoy mismo. Sin contratos a largo plazo ni costos ocultos.
          </p>
          
          <div className="flex flex-col items-center gap-6">
            <Button 
              size="lg" 
              className="h-16 px-10 rounded-full text-xl bg-white text-blue-600 hover:bg-blue-50 shadow-2xl hover:-translate-y-1 transition-all"
              onClick={() => openWhatsApp("Hola! Estoy listo para empezar con ORBIA.")}
            >
              <MessageCircle className="w-6 h-6 mr-3" />
              Hablemos por WhatsApp
            </Button>
            
            <div className="flex items-center gap-2 text-blue-200">
              <Phone className="w-4 h-4" />
              <span>{phoneNumberFormatted}</span>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
