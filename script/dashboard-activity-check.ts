import fs from "fs";
const tenantRoutes = fs.readFileSync("server/routes/tenant.ts", "utf8");
const dashboardUi = fs.readFileSync("client/src/pages/app/dashboard.tsx", "utf8");
if (!tenantRoutes.includes('/api/dashboard/recent-orders')) throw new Error('missing /api/dashboard/recent-orders');
if (!tenantRoutes.includes('/api/dashboard/activity')) throw new Error('missing /api/dashboard/activity');
if (!dashboardUi.includes('Pendientes')) throw new Error('dashboard pending section missing');
if (!dashboardUi.includes('Actividad reciente')) throw new Error('dashboard activity section missing');
console.log('dashboard-activity-check: OK');
