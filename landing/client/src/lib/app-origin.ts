const DEFAULT_DEV_APP_ORIGIN = "http://localhost:5000";

export function getAppOrigin() {
  const raw = import.meta.env.VITE_APP_ORIGIN;
  const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  
  let origin = raw || ((import.meta.env.PROD && !isLocal) ? "https://app.orbiapanel.com" : DEFAULT_DEV_APP_ORIGIN);
  return origin.replace(/\/$/, "");
}
