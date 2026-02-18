import { storage } from "../server/storage";
import { generateInvoiceBPdf } from "../server/services/pdf/invoice-b";
import { generatePriceListPdf } from "../server/services/pdf/price-list";

const baseSettings = {
  documentType: "INVOICE_B",
  templateKey: "B_STANDARD",
  pageSize: "A4",
  orientation: "portrait",
  showLogo: false,
  headerText: null,
  subheaderText: "Vista de prueba",
  footerText: "Footer test",
  showBranchStock: true,
  showSku: false,
  showDescription: true,
  priceColumnLabel: "Precio",
  currencySymbol: "$",
  columns: ["name", "description", "price", "stock_total"],
  invoiceColumns: ["code", "quantity", "product", "price", "discount", "total"],
  documentTitle: "Factura B",
  fiscalName: "Empresa Demo SA",
  fiscalCuit: "30-12345678-9",
  fiscalIibb: "123-456789-0",
  fiscalAddress: "Calle 123",
  fiscalCity: "CABA",
  showFooterTotals: true,
  styles: { fontSize: 10, headerSize: 16, subheaderSize: 12, tableHeaderSize: 10, rowHeight: 18 },
};

async function main() {
  const tenantId = 1;

  (storage as any).getTenantBranding = async () => ({ displayName: "Negocio Demo", logoUrl: null, colors: { primary: "#2563eb" } });
  (storage as any).getAppBranding = async () => ({ orbiaLogoUrl: null });
  (storage as any).getProducts = async () => ([
    { id: 1, name: "Producto Test", sku: "SKU-001", price: 1200, description: "Demo" },
    { id: 2, name: "Producto Test 2", sku: "SKU-002", price: 950, description: "Demo" },
  ]);
  (storage as any).getStockSummaryByTenant = async () => [];

  for (const templateKey of ["B_STANDARD", "B_COMPACT"]) {
    (storage as any).getTenantPdfSettings = async () => ({ ...baseSettings, templateKey });
    const invoiceBuffer = await generateInvoiceBPdf(tenantId);
    if (!invoiceBuffer?.length || !invoiceBuffer.slice(0, 4).equals(Buffer.from("%PDF"))) {
      throw new Error(`Factura B inválida para template ${templateKey}`);
    }
  }

  (storage as any).getTenantPdfSettings = async () => ({ ...baseSettings, documentType: "PRICE_LIST", templateKey: "CLASSIC" });
  const priceListBuffer = await generatePriceListPdf(tenantId, { products: await (storage as any).getProducts(), hasBranches: false, watermarkOrbia: false });
  if (!priceListBuffer?.length || !priceListBuffer.slice(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("Lista de precios inválida");
  }

  console.log("OK: Factura B y Lista de precios generan PDF válido");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
