import { Button } from "@/components/ui/button";

type SignupTrialProps = {
  onStartTrial?: () => void;
};

export function SignupTrial({ onStartTrial }: SignupTrialProps) {
  return (
    <section id="signup" className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-3xl font-bold mb-3">Iniciá tu prueba gratis</h2>
          <p className="text-muted-foreground mb-4">Creá tu cuenta en menos de 2 minutos. Activamos automáticamente el trial y te redirigimos al login de la app con tu código precargado.</p>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
            <li>Alta instantánea de empresa, sucursal y usuario administrador.</li>
            <li>Sin tarjeta de crédito.</li>
            <li>Acceso inmediato al panel.</li>
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground mb-4">Completá tus datos básicos y entrá directo a la app.</p>
          <Button className="w-full" onClick={onStartTrial}>Iniciá tu prueba gratis</Button>
        </div>
      </div>
    </section>
  );
}
