import { pool } from "../server/db";

async function relationExists(name: string) {
  const result = await pool.query("SELECT to_regclass($1) AS reg", [`public.${name}`]);
  return Boolean(result.rows?.[0]?.reg);
}

async function run() {
  const views = ["mv_sales_history", "mv_cash_daily", "mv_reports_daily_sales"];
  const skipped: string[] = [];

  for (const view of views) {
    const exists = await relationExists(view);
    if (!exists) {
      skipped.push(view);
      console.log(`refresh-views: skipped missing ${view}`);
      continue;
    }
    await pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
  }

  console.log(`refresh-views: OK${skipped.length ? ` (skipped: ${skipped.join(", ")})` : ""}`);
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
