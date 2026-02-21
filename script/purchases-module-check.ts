import fs from "fs";
const api = fs.readFileSync("server/routes/purchases.ts", "utf8");
const ui = fs.readFileSync("client/src/pages/app/purchases.tsx", "utf8");
if (!api.includes('/api/purchases/manual')) throw new Error("missing purchases manual endpoint");
if (!api.includes('updatedStock')) throw new Error("missing updatedStock response");
if (!ui.includes('Nombre producto')) throw new Error("manual product name field missing");
if (ui.includes('<option value={0}>Producto</option>')) throw new Error("legacy fake product dropdown still present");
console.log("purchases-module-check: OK");
