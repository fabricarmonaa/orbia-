import { db } from './db';
import { products } from '../shared/schema/products';
import { queryProductsByFilters } from './services/product-filters';

async function test() {
  const tenantId = 1; // demo tenant
  console.log('--- ALL PRODUCTS ---');
  const all = await db.select().from(products).where(products.tenantId.equals(tenantId));
  console.log(`Total raw products in DB: ${all.length}`);

  console.log('--- API QUERY ---');
  const res = await queryProductsByFilters(tenantId, false, { status: 'all', page: 1, pageSize: 20 });
  console.log(`Products returned by queryProductsByFilters (no filters): ${res.data.length}`);
}
test().catch(console.error);
