/* eslint-disable no-console */
import fs from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const ticketLayout = fs.readFileSync("client/src/components/print/TicketLayout.tsx", "utf8");
  const printUtil = fs.readFileSync("client/src/components/sales/ticket-print.ts", "utf8");
  const salesSchema = fs.readFileSync("shared/schema/sales.ts", "utf8");

  assert(ticketLayout.includes("58mm auto"), "Debe existir @page 58mm");
  assert(ticketLayout.includes("80mm auto"), "Debe existir @page 80mm");
  assert(ticketLayout.includes("A4"), "Debe existir @page A4");
  assert(ticketLayout.includes("imageDataUrl") || printUtil.includes("QRCode.toDataURL"), "Debe renderizar QR");
  assert(salesSchema.includes("unitPrice") && salesSchema.includes("lineTotal"), "Debe usar snapshot unitPrice/lineTotal");

  console.log("ticket-print-check: OK");
}

run();
