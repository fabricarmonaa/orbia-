import { useEffect, useState } from "react";
import { useRoute } from "wouter";

interface TosPayload {
  companyName: string;
  logoUrl: string | null;
  slogan: string;
  tosContent: string;
  updatedAt: string | null;
}

export default function PublicTosPage() {
  const [, params] = useRoute<{ slug: string }>("/t/:slug/tos");
  const [data, setData] = useState<TosPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.slug) return;
    fetch(`/api/public/tenant/${encodeURIComponent(params.slug)}/tos`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "No disponible");
        setData(body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params?.slug]);

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando términos...</div>;
  if (error || !data) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{error || "No disponible"}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center space-y-3">
          {data.logoUrl ? <img src={data.logoUrl} alt={data.companyName} className="mx-auto h-16 w-auto object-contain" /> : null}
          <h1 className="text-2xl font-bold">{data.companyName}</h1>
          {data.slogan ? <p className="text-muted-foreground">{data.slogan}</p> : null}
          <p className="text-xs text-muted-foreground">Última actualización: {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "-"}</p>
        </div>
        <hr className="my-6" />
        <article className="prose prose-sm max-w-none whitespace-pre-wrap">{data.tosContent}</article>
        <p className="text-center text-xs text-muted-foreground mt-10">Powered by Orbia</p>
      </div>
    </div>
  );
}
