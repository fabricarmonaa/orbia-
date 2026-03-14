import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const pgDialect = new PgDialect();
const arr: any[] = [];
try {
  const queryANY = sql`SELECT * FROM t WHERE id = ANY(${arr})`;
  console.log("ANY():", pgDialect.sqlToQuery(queryANY));
} catch(e:any) { console.error("ANY() ERROR:", e.message); }

try {
  const queryIN = sql`SELECT * FROM t WHERE id IN (${arr})`;
  console.log("IN ():", pgDialect.sqlToQuery(queryIN));
} catch(e:any) { console.error("IN () ERROR:", e.message); }
