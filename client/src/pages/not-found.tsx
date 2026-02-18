import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/20">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">Página no encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            La ruta que buscás no existe o fue movida. Verificá la URL o volvé al inicio.
          </p>

          <Button className="mt-6 w-full" onClick={() => setLocation("/app")}>
            <Home className="w-4 h-4 mr-2" />
            Ir al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
