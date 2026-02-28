import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkAiHealth() {
    console.log("Checking AI service health (http://localhost:8000)...");
    try {
        const res = await fetch("http://localhost:8000/api/stt/interpret", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: "" })
        });
        // El AI devueve error validación si está vacío, pero responde indicando que está vivo.
        if (res.status >= 500) {
            console.log("❌ AI service returned 500 error.");
        } else {
            console.log("✅ AI service is responding (status: " + res.status + ").");
        }
    } catch (err: any) {
        console.log("❌ AI service is unreachable:", err.message);
    }
}

async function runChecks() {
    await checkAiHealth();

    console.log("\nChecking STT Endpoint Auth (http://localhost:5000/api/stt/interpret)...");
    try {
        const res = await fetch("http://localhost:5000/api/stt/interpret", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "hola" })
        });
        if (res.status === 401) {
            console.log("✅ Auth check passed: endpoint requires authentication (returned 401).");
        } else {
            console.log("⚠️ Auth check unexpected status:", res.status);
        }
    } catch (err: any) {
        console.log("❌ Error checking auth:", err.message);
    }

    console.log("\nNote: Full 413 and 200 payload tests require a valid auth token which must be tested via the authenticated UI / frontend. Wait for UI to test Blob upload and sizes.");
}

runChecks();
