import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import logoOrbia from "@assets/WhatsApp_Image_2026-02-25_at_15.35.49-removebg-preview_1772154794159.png";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Características", href: "#features" },
    { name: "Módulos", href: "#showcase" },
    { name: "Planes", href: "#pricing" },
    { name: "FAQ", href: "#faq" },
  ];

  const whatsappLink = (import.meta.env.VITE_WHATSAPP_LINK as string | undefined) || "https://wa.me/5492236979026?text=Quiero%20contratar%20un%20plan%20de%20Orbia";
  let appUrl = (import.meta.env.VITE_APP_BASE_URL as string | undefined) || (import.meta.env.MODE === 'production' ? 'https://app.orbiapanel.com' : 'http://localhost:5000');
  if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
    appUrl = `https://${appUrl}`;
  }
  const loginUrl = `${appUrl}/login`;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? "glass-nav py-2" : "bg-transparent py-4"
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <a href="#" className="flex items-center gap-2 group">
              <img src={logoOrbia} alt="Orbia Logo" className="h-10 w-auto object-contain" />
            </a>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            <Button asChild variant="ghost" className="rounded-full px-5 hover:bg-primary/5 transition-colors">
              <a href={loginUrl}>
                Iniciar sesión
              </a>
            </Button>
            <Button asChild className="rounded-full px-6 shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                Contratar un plan
              </a>
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-foreground hover:text-primary transition-colors"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass-nav border-t mt-3"
          >
            <div className="px-4 pt-2 pb-6 space-y-1 shadow-lg">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 rounded-md text-base font-medium text-foreground hover:bg-muted hover:text-primary transition-colors"
                >
                  {link.name}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-2">
                <Button asChild variant="outline" className="w-full rounded-full">
                  <a href={loginUrl} onClick={() => setMobileMenuOpen(false)}>
                    Iniciar sesión
                  </a>
                </Button>
                <Button asChild className="w-full rounded-full">
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)}>
                    Contratar un plan
                  </a>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
