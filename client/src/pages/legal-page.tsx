import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LegalResponse = {
  slug: string;
  logoUrl: string | null;
  termsText: string;
  privacyText: string;
  updatedAt: string | null;
};

function detectLegalInfo(path: string) {
  const match = path.match(/^\/legal\/(?:([^/]+)\/)?(terms|privacy)$/);
  return {
    slug: match?.[1] || "orbia",
    doc: match?.[2] || "terms",
  };
}

export default function LegalPage() {
  const info = useMemo(() => detectLegalInfo(window.location.pathname), []);
  const [data, setData] = useState<LegalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/legal/${encodeURIComponent(info.slug)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("LEGAL_NOT_FOUND"))))
      .then((json) => setData(json?.data || null))
      .catch(() => setError("No se encontró contenido legal para este enlace."));
  }, [info.slug]);

  const title = info.doc === "privacy" ? "Política de Privacidad" : "Términos y Condiciones";
  const text = info.doc === "privacy" ? data?.privacyText : data?.termsText;

  return (
    <div className="min-h-screen bg-background p-4 md:p-10">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          {data?.logoUrl ? <img src={data.logoUrl} alt="ORBIA" className="h-12 w-auto object-contain mb-3" /> : null}
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">Última actualización: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString("es-AR") : "Sin fecha"}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {!error ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{text || "No hay contenido disponible."}</div>
          ) : null}
          <Button asChild variant="outline"><a href="/login">Volver</a></Button>
        </CardContent>
      </Card>
    </div>
  );
}
