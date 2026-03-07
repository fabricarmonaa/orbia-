const AI_URL = process.env.AI_URL || "http://localhost:8000";
const APP_URL = process.env.APP_URL || "http://localhost:5000";

async function checkAiHealth() {
  console.log(`Checking AI health (${AI_URL}/health)...`);
  try {
    const res = await fetch(`${AI_URL}/health`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      console.log("❌ AI health failed:", res.status, json);
      return;
    }
    console.log("✅ AI health OK:", json);
  } catch (err: any) {
    console.log("❌ AI service unreachable:", err.message);
  }
}

async function checkBackendAuth() {
  console.log(`\nChecking backend auth guard (${APP_URL}/api/stt/interpret)...`);
  try {
    const res = await fetch(`${APP_URL}/api/stt/interpret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hola" }),
    });
    if (res.status === 401) {
      console.log("✅ Auth guard OK (401 sin token).");
    } else {
      const text = await res.text();
      console.log("⚠️ Unexpected status:", res.status, text);
    }
  } catch (err: any) {
    console.log("❌ Backend unreachable:", err.message);
  }
}

(async function run() {
  await checkAiHealth();
  await checkBackendAuth();
  console.log("\nTip: para validar flujo completo, usar token y probar /api/stt/health y /api/stt/interpret desde la app.");
})();
