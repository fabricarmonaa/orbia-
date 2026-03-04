import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { PackageSearch } from "lucide-react";

interface TosPayload {
  companyName: string;
  logoUrl: string | null;
  tosContent: string;
  updatedAt: string | null;
}

export default function PublicTosPage() {
  const [, tokenParams] = useRoute<{ publicToken: string }>("/tos/:publicToken");
  const [, slugParams] = useRoute<{ slug: string }>("/t/:slug/tos");
  const [data, setData] = useState<TosPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const publicToken = tokenParams?.publicToken;
    const slug = slugParams?.slug;
    if (!publicToken && !slug) return;
    const endpoint = publicToken
      ? `/api/public/tos/${encodeURIComponent(publicToken)}`
      : `/api/public/tenant/${encodeURIComponent(String(slug))}/tos`;
    fetch(endpoint)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "No disponible");
        setData(body?.data || body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tokenParams?.publicToken, slugParams?.slug]);

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando términos y condiciones...</div>;
  if (error || !data) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">{error || "No hay términos cargados"}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center space-y-3">
          {data.logoUrl ? <img src={data.logoUrl} alt={data.companyName} className="mx-auto h-16 w-auto object-contain" /> : <div className="mx-auto w-16 h-16 rounded-full grid place-items-center border"><PackageSearch className="w-7 h-7 text-muted-foreground" /></div>}
          <h1 className="text-2xl font-bold">{data.companyName}</h1>
                    <p className="text-xs text-muted-foreground">Última actualización: {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "-"}</p>
        </div>
        <hr className="my-6" />
        <article className="prose prose-sm max-w-none whitespace-pre-wrap">{data.tosContent}</article>
        <p className="text-center text-xs text-muted-foreground mt-10">Documento público del negocio</p>
      </div>
    </div>
  );
}
