import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";

interface TosPayload {
  companyName: string;
  logoUrl: string | null;
  slogan: string;
  tosContent: string;
  updatedAt: string | null;
}

const LIGHT_PAGE_STYLES: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#111827",
};

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

  const updatedAtLabel = useMemo(
    () => (data?.updatedAt ? new Date(data.updatedAt).toLocaleString("es-AR") : "-"),
    [data?.updatedAt]
  );

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={LIGHT_PAGE_STYLES}>
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#d1d5db", backgroundColor: "#f9fafb", color: "#374151" }}>
          Cargando términos...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={LIGHT_PAGE_STYLES}>
        <div className="max-w-lg rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2", color: "#991b1b" }}>
          {error || "No disponible"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={LIGHT_PAGE_STYLES}>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center space-y-3">
          {data.logoUrl ? <img src={data.logoUrl} alt={data.companyName} className="mx-auto h-16 w-auto object-contain" /> : null}
          <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>{data.companyName}</h1>
          {data.slogan ? <p style={{ color: "#4b5563" }}>{data.slogan}</p> : null}
          <p className="text-xs" style={{ color: "#6b7280" }}>Última actualización: {updatedAtLabel}</p>
        </div>
        <hr className="my-6" style={{ borderColor: "#e5e7eb" }} />
        <article className="prose prose-sm max-w-none whitespace-pre-wrap" style={{ color: "#1f2937" }}>{data.tosContent}</article>
        <p className="text-center text-xs mt-10" style={{ color: "#6b7280" }}>Powered by Orbia</p>
      </div>
    </div>
  );
}
