import fs from "fs";

const APP_URL = process.env.APP_URL || "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const AUDIO_FILE = process.env.AUDIO_FILE || "";

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN is required");
if (!AUDIO_FILE) throw new Error("AUDIO_FILE is required");
if (!fs.existsSync(AUDIO_FILE)) throw new Error(`audio file not found: ${AUDIO_FILE}`);

async function run() {
  const bytes = fs.readFileSync(AUDIO_FILE);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/webm" }), "sample.webm");

  const res = await fetch(`${APP_URL}/api/ai/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok !== true) {
    throw new Error(`ai-stt-check failed (${res.status}): ${JSON.stringify(body)}`);
  }
  if (!body?.data?.success) {
    throw new Error(`ai-stt-check invalid response: ${JSON.stringify(body)}`);
  }
  console.log("ai-stt-check: OK");
}

run().catch((err) => {
  console.error("ai-stt-check FAIL", err.message);
  process.exit(1);
});
