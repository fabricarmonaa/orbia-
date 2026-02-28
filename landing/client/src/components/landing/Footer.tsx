import logoOrbia from "@assets/WhatsApp_Image_2026-02-25_at_15.35.49-removebg-preview_1772154794159.png";

export function Footer() {
  const whatsappLink = "https://wa.me/5492236979026";
  
  return (
    <footer className="bg-foreground text-muted py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          
          <div className="col-span-1 md:col-span-2 space-y-6">
            <a href="#" className="inline-block group">
              <img src={logoOrbia} alt="Orbia Logo" className="h-12 w-auto object-contain brightness-0 invert" />
            </a>
            <p className="text-muted-foreground max-w-sm text-lg font-medium leading-relaxed">
              El sistema de gestión marplatense diseñado para simplificar la vida de los comercios y PyMEs locales.
            </p>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Navegación</h4>
            <ul className="space-y-4 text-base font-medium text-muted-foreground">
              <li><a href="#features" className="hover:text-white transition-colors">Características</a></li>
              <li><a href="#showcase" className="hover:text-white transition-colors">Módulos</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Planes</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Contacto</h4>
            <ul className="space-y-4 text-base font-medium text-muted-foreground">
              <li>
                <a 
                  href={whatsappLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center gap-2 group"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  WhatsApp MDP
                </a>
              </li>
              <li>orbia99@gmail.com</li>
              <li>Mar del Plata, Argentina</li>
            </ul>
          </div>
          
        </div>
        
        <div className="pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-muted-foreground font-bold uppercase tracking-widest">
          <p>© {new Date().getFullYear()} Orbia Software. Local & Profesional.</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-white transition-colors">Términos</a>
            <a href="#" className="hover:text-white transition-colors">Privacidad</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
