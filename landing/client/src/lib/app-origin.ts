const DEFAULT_DEV_APP_ORIGIN = "http://localhost:5000";
const DEFAULT_PROD_APP_ORIGIN = "https://app.orbiapanel.com";

export function getAppOrigin() {
  const raw = (import.meta.env.VITE_APP_ORIGIN as string | undefined)?.trim();
  let origin = raw || (import.meta.env.DEV ? DEFAULT_DEV_APP_ORIGIN : DEFAULT_PROD_APP_ORIGIN);

  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    origin = `https://${origin}`;
  }

  return origin.replace(/\/$/, "");
}

