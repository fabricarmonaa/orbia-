import fs from "fs";
const f = fs.readFileSync("server/routes/customers.ts", "utf8");
if (!f.includes('/api/customers"')) throw new Error("missing customers endpoint");
if (!f.includes('CUSTOMER_ALREADY_EXISTS')) throw new Error("missing customer exists code");
console.log("customers-module-check: OK");
