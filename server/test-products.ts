import { db } from './db';
import { products, productCustomFieldValues } from '../shared/schema/products';
import { inArray, eq, sql } from 'drizzle-orm';
import { queryProductsByFilters } from './services/product-filters';

async function test() {
  const tenantId = 1; // Assuming tenant 1 based on previous tests
  
  try {
    console.log('Testing queryProductsByFilters (no pagination)...');
    const res = await queryProductsByFilters(tenantId, false, { status: 'all' } as any, { noPagination: true });
    console.log('queryProductsByFilters OK');
  } catch(e:any) {
    console.error('queryProductsByFilters FAILED:', e.message);
  }

  try {
    console.log('Testing customValuesRows query...');
    const productIds = [1];
    await db.select().from(productCustomFieldValues).where(
      sql`${productCustomFieldValues.tenantId} = ${tenantId} AND ${productCustomFieldValues.productId} IN (${productIds.join(',')})`
    );
    console.log('customValuesRows OK');
  } catch(e:any) {
    console.error('customValuesRows FAILED:', e.message);
  }

}
test().catch(console.error);
