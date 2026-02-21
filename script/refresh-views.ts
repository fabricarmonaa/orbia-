import { pool } from "../server/db";
async function run() {
  await pool.query("REFRESH MATERIALIZED VIEW mv_sales_history");
  await pool.query("REFRESH MATERIALIZED VIEW mv_cash_daily");
  await pool.query("REFRESH MATERIALIZED VIEW mv_reports_daily_sales");
  console.log("refresh-views: OK");
  await pool.end();
}
run().catch((e)=>{ console.error(e); process.exit(1); });
