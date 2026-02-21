import fs from "fs";
const ordersUi = fs.readFileSync("client/src/pages/app/orders.tsx", "utf8");
const ordersApi = fs.readFileSync("server/routes/orders.ts", "utf8");
if (ordersUi.includes('Comanda cocina')) throw new Error('kitchen button still visible');
if (!ordersUi.includes('Ticket cliente')) throw new Error('ticket cliente button missing');
if (!ordersApi.includes('/api/orders/:id/print-data')) throw new Error('orders print-data endpoint missing');
if (!ordersApi.includes('publicUrl')) throw new Error('tracking public URL missing in print-data');
console.log('order-ticket-check: OK');
