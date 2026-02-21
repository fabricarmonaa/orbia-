import fs from "fs";
import path from "path";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const routes = fs.readFileSync(path.join(process.cwd(), "server/routes/reports.ts"), "utf8");
assert(routes.includes('/api/reports/kpis'), "missing kpis endpoint");
assert(routes.includes('/api/reports/sales'), "missing sales endpoint");
assert(routes.includes('/api/reports/products'), "missing products endpoint");
assert(routes.includes('/api/reports/customers'), "missing customers endpoint");
assert(routes.includes('/api/reports/cash'), "missing cash endpoint");
assert(routes.includes('/api/reports/export'), "missing export endpoint");
assert(routes.includes('EXPORT_TTL_SECONDS = 15 * 60'), "export ttl is not 15 min");
assert(routes.includes("/^[=+\\-@]/"), "csv formula injection protection missing");
assert(routes.includes("kpis:"), "kpi response structure missing");

console.log("reports-module-check: OK");
