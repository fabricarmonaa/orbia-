const APP_URL = process.env.APP_URL || "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN is required");

async function run() {
  const res = await fetch(`${APP_URL}/api/ai/health`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok !== true) {
    throw new Error(`ai-health-check failed (${res.status}): ${JSON.stringify(body)}`);
  }
  console.log("ai-health-check: OK");
}

run().catch((err) => {
  console.error("ai-health-check FAIL", err.message);
  process.exit(1);
});
