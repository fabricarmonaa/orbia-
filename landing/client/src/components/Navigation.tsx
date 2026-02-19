import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, MessageCircle } from "lucide-react";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { useWhatsApp } from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const scrollTo = useScrollTo();
  const { openWhatsApp } = useWhatsApp();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    setIsMobileMenuOpen(false);
    if (location !== "/") {
      setLocation("/");
      // Give time for navigation before scrolling
      setTimeout(() => scrollTo(sectionId), 100);
    } else {
      scrollTo(sectionId);
    }
  };

  const navItems = [
    { label: "Módulos", id: "modulos" },
    { label: "Planes", id: "planes" },
    { label: "Addons", id: "addons" },
    { label: "Capturas", id: "capturas" },
    { label: "FAQ", id: "faq" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled ? "glass-nav py-3 shadow-sm" : "bg-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 z-50">
            <img 
              src="/logo-orbia.png" 
              alt="ORBIA Logo" 
              className="h-8 md:h-10 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerText = 'ORBIA';
              }}
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Button 
              onClick={() => openWhatsApp("Hola! Me interesa conocer más sobre ORBIA.")}
              className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Contactar
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-slate-600 z-50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-white z-40 flex flex-col pt-24 px-6 md:hidden animate-in slide-in-from-top-10 duration-200">
          <nav className="flex flex-col gap-6 text-lg">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="text-left font-medium text-slate-900 border-b border-slate-100 pb-4"
              >
                {item.label}
              </button>
            ))}
            <Button 
              onClick={() => openWhatsApp("Hola! Me interesa conocer más sobre ORBIA.")}
              className="w-full mt-4 bg-primary text-lg h-12 rounded-xl"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Hablemos por WhatsApp
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
