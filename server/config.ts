import "dotenv/config";

function runningScriptContext() {
  return (process.argv || []).some((arg) => /seed|script\//i.test(arg));
}

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && !runningScriptContext()) {
    throw new Error("SESSION_SECRET is not defined");
  }
  return "dev-insecure-secret";
}
