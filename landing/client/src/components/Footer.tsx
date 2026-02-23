import { Link } from "wouter";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { cn } from "@/lib/utils";

export function Footer() {
  const scrollTo = useScrollTo();

  return (
    <footer className="bg-slate-900 text-slate-200 py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <img 
              src="/logo-orbia.png" 
              alt="ORBIA" 
              className="h-10 w-auto object-contain mb-4 brightness-0 invert" 
            />
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              La herramienta para que tu negocio crezca ordenado. 
              Sin complicaciones, todo en un solo lugar.
            </p>
          </div>

          {/* Links */}
          <div className="col-span-1">
            <h4 className="font-semibold text-white mb-4">Producto</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><button onClick={() => scrollTo('modulos')} className="hover:text-white transition-colors">Módulos</button></li>
              <li><button onClick={() => scrollTo('planes')} className="hover:text-white transition-colors">Planes</button></li>
              <li><button onClick={() => scrollTo('capturas')} className="hover:text-white transition-colors">Capturas</button></li>
            </ul>
          </div>

          <div className="col-span-1">
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li>
                <Link href="/legal/terminos" className="hover:text-white transition-colors">
                  Términos y Condiciones
                </Link>
              </li>
              <li>
                <Link href="/legal/privacidad" className="hover:text-white transition-colors">
                  Política de Privacidad
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-1">
            <h4 className="font-semibold text-white mb-4">Contacto</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li>Mar del Plata, Argentina</li>
              <li>+54 9 223 697-9026</li>
              <li>soporte@orbia.com.ar</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} ORBIA. Todos los derechos reservados.</p>
          <p>Desarrollado con ❤️ para negocios que crecen.</p>
        </div>
      </div>
    </footer>
  );
}
