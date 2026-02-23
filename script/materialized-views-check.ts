import fs from "fs";
const mig = fs.readFileSync("migrations/20260225_materialized_views.sql", "utf8");
const reports = fs.readFileSync("server/routes/reports.ts", "utf8");
if (!mig.includes('mv_sales_history')) throw new Error('missing mv_sales_history');
if (!mig.includes('mv_reports_daily_sales')) throw new Error('missing mv_reports_daily_sales');
if (!reports.includes('/api/admin/refresh-views')) throw new Error('missing refresh views endpoint');
console.log('materialized-views-check: OK');
