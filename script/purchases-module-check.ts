import fs from "fs";
const f = fs.readFileSync("server/routes/purchases.ts", "utf8");
if (!f.includes('/api/purchases"')) throw new Error("missing purchases endpoint");
if (!f.includes('movementType: "PURCHASE"')) throw new Error("missing purchase stock movement");
console.log("purchases-module-check: OK");
