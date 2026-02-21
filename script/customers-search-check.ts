import fs from "fs";
const route = fs.readFileSync("server/routes/customers.ts", "utf8");
if (!route.includes('escapeLikePattern')) throw new Error('missing LIKE escaping');
if (!route.includes('pageSize')) throw new Error('missing pagination response');
if (!route.includes('items')) throw new Error('missing stable items response');
if (!route.includes('CUSTOMER_LIST_ERROR')) throw new Error('missing safe error code');
console.log('customers-search-check: OK');
