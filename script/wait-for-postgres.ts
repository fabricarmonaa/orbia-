import { Client } from "pg";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS || 60000);
  const intervalMs = Number(process.env.DB_WAIT_INTERVAL_MS || 2000);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const startedAt = Date.now();
  let lastError: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log("wait-for-postgres: OK");
      return;
    } catch (err: any) {
      lastError = err?.message || String(err);
      try { await client.end(); } catch {}
      console.log(`wait-for-postgres: retrying... (${lastError})`);
      await sleep(intervalMs);
    }
  }

  throw new Error(`wait-for-postgres timeout after ${timeoutMs}ms. Last error: ${lastError || "unknown"}`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
