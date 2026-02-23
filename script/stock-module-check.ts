/* eslint-disable no-console */
import fs from "node:fs";

async function run() {
  const hasDb = !!process.env.DATABASE_URL;
  const stockServiceSrc = fs.readFileSync("server/services/stock-professional.ts", "utf8");
  const stockRoutesSrc = fs.readFileSync("server/routes/stock.ts", "utf8");

  if (!stockServiceSrc.includes("completeTransfer")) throw new Error("completeTransfer faltante");
  if (!stockRoutesSrc.includes("/api/stock/adjust")) throw new Error("endpoint adjust faltante");
  if (!stockRoutesSrc.includes("/api/stock/alerts")) throw new Error("endpoint alerts faltante");

  if (hasDb) {
    const mod = await import("../server/services/stock-professional");
    console.log("stock-module-check: DB mode", Object.keys(mod).length > 0 ? "OK" : "FAIL");
  } else {
    console.log("stock-module-check: static mode OK (sin DATABASE_URL)");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
