const faqs = [
  { q: "¿Cómo funciona la prueba gratis?", a: "Al registrarte, Orbia crea tu empresa y activa 3 días de trial del plan profesional con mensajería." },
  { q: "¿Necesito tarjeta para empezar?", a: "No. Podés probar sin cargar tarjeta." },
  { q: "¿Puedo usarlo desde celular?", a: "Sí, Orbia funciona como app instalable (PWA) en celular, tablet y PC." },
  { q: "¿Qué pasa cuando termina el trial?", a: "El sistema marca el trial como vencido y te pedirá upgrade para seguir con funcionalidades premium." },
];

export function Faq() {
  return (
    <section id="faq" className="py-20 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Preguntas frecuentes</h2>
        <div className="space-y-4">
          {faqs.map((item) => (
            <div key={item.q} className="rounded-xl border bg-white p-5">
              <h3 className="font-semibold mb-1">{item.q}</h3>
              <p className="text-muted-foreground text-sm">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
