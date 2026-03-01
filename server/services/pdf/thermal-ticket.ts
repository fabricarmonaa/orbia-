import PDFDocument from "pdfkit";
import QRCode from "qrcode";

type TicketWidth = 58 | 80;

type TicketItem = {
  qty: number;
  name: string;
  price?: string;
};

type ThermalTicketInput = {
  widthMm: TicketWidth;
  companyName: string;
  branchName?: string | null;
  ticketLabel: string;
  ticketNumber: string;
  datetime: string;
  paymentMethod?: string | null;
  customerName?: string | null;
  customerDni?: string | null;
  customerPhone?: string | null;
  items: TicketItem[];
  subtotal?: string | null;
  discount?: string | null;
  surcharge?: string | null;
  total: string;
  qrUrl?: string | null;
  notes?: string | null;
  footerText?: string | null;
};

const MM_TO_PT = 72 / 25.4;
const mmToPt = (mm: number) => mm * MM_TO_PT;

function estimateHeightPt(input: ThermalTicketInput) {
  const line = 12;
  const topBottom = mmToPt(5);
  const qr = input.qrUrl ? mmToPt(input.widthMm === 58 ? 22 : 26) + 24 : 0;
  const itemChars = input.widthMm === 58 ? 22 : 30;
  const itemLines = input.items.reduce((acc, item) => {
    const nameLines = Math.max(1, Math.ceil(String(item.name || "").length / itemChars));
    return acc + nameLines + 1;
  }, 0);
  const baseLines = 16;
  const notesLines = input.notes ? Math.max(1, Math.ceil(input.notes.length / itemChars)) + 1 : 0;
  const footerLines = input.footerText ? Math.max(1, Math.ceil(input.footerText.length / itemChars)) + 1 : 1;
  return Math.max(mmToPt(90), topBottom + (baseLines + itemLines + notesLines + footerLines) * line + qr);
}

export async function buildThermalTicketPdf(input: ThermalTicketInput): Promise<Buffer> {
  const widthPt = mmToPt(input.widthMm);
  const margin = mmToPt(2.5);
  const pageHeight = estimateHeightPt(input);

  const doc = new PDFDocument({
    size: [widthPt, pageHeight],
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    compress: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const contentWidth = widthPt - margin * 2;
  const rightPriceWidth = input.widthMm === 58 ? mmToPt(16) : mmToPt(22);
  const leftWidth = contentWidth - rightPriceWidth - 4;

  const dashed = () => {
    doc.moveDown(0.2);
    doc.fontSize(8).text("-".repeat(input.widthMm === 58 ? 28 : 40), { align: "center" });
    doc.moveDown(0.2);
  };

  doc.font("Helvetica-Bold").fontSize(input.widthMm === 58 ? 8 : 9).text(input.companyName, { align: "center" });
  if (input.branchName) {
    doc.font("Helvetica").fontSize(7).text(input.branchName, { align: "center" });
  }

  dashed();

  doc.font("Helvetica").fontSize(7);
  doc.text(`${input.ticketLabel}: ${input.ticketNumber}`);
  doc.text(`Fecha: ${new Date(input.datetime).toLocaleString("es-AR")}`);
  if (input.paymentMethod) doc.text(`Pago: ${input.paymentMethod}`);
  if (input.customerName) doc.text(`Cliente: ${input.customerName}`);
  if (input.customerDni) doc.text(`DNI: ${input.customerDni}`);
  if (input.customerPhone) doc.text(`Tel: ${input.customerPhone}`);

  dashed();

  for (const item of input.items) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(7).text(`${item.qty} x ${item.name}`, doc.page.margins.left, y, { width: leftWidth, align: "left" });
    doc.font("Helvetica").fontSize(7).text(item.price || "", doc.page.margins.left + leftWidth + 4, y, { width: rightPriceWidth, align: "right" });
    doc.moveDown(0.1);
  }

  dashed();

  const right = (label: string, value?: string | null, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 7).text(`${label} ${value || "-"}`, { align: "right" });
  };
  right("Subtotal:", input.subtotal);
  right("Descuento:", input.discount);
  right("Recargo:", input.surcharge);
  right("TOTAL:", input.total, true);

  if (input.qrUrl) {
    const qrSize = mmToPt(input.widthMm === 58 ? 22 : 26);
    const qrBuffer = await QRCode.toBuffer(input.qrUrl, { margin: 1, width: Math.round(qrSize) });
    doc.moveDown(0.4);
    const qrX = (widthPt - qrSize) / 2;
    doc.image(qrBuffer, qrX, doc.y, { fit: [qrSize, qrSize], align: "center" });
    doc.y += qrSize + 4;
    doc.font("Helvetica").fontSize(6).text(input.qrUrl, { align: "center" });
  }

  if (input.notes) {
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(7).text(`Notas: ${input.notes}`);
  }

  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(7).text(input.footerText || "Gracias por su compra", { align: "center" });

  doc.end();

  await new Promise<void>((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}
