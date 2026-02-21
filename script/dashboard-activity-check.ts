import fs from "fs";
const tenantRoutes = fs.readFileSync("server/routes/tenant.ts", "utf8");
const dashboardUi = fs.readFileSync("client/src/pages/app/dashboard.tsx", "utf8");
if (!tenantRoutes.includes('/api/dashboard/highlight-orders')) throw new Error('missing /api/dashboard/highlight-orders');
if (!tenantRoutes.includes('/api/dashboard/highlight-settings')) throw new Error('missing dashboard highlight settings endpoints');
if (!dashboardUi.includes('highlightStatuses')) throw new Error('dashboard highlight rendering missing');
if (!dashboardUi.includes('+{hiddenCount} pedidos')) throw new Error('dashboard +N indicator missing');
console.log('dashboard-activity-check: OK');
