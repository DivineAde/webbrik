import PDFDocument from "pdfkit";
import type { PaymentRec } from "./db";
import type { PaystackConfig } from "./paystack";
import { planName } from "./pricing";

const fmt = (amount: number, currency: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100); } catch { return `${(amount / 100).toFixed(2)} ${currency}`; } };

/** A one-page tax invoice for a successful payment. Seller details come from INVOICE_SELLER_* env (see .env.example). */
export function renderInvoicePdf(o: { payment: PaymentRec; workspaceName: string; config: PaystackConfig }): Promise<Buffer> {
  const { payment: p, config } = o;
  const seller = config.seller ?? { name: "Webbrik" };
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Invoice ${p.invoiceNo}`, Author: seller.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  const net = (p.listPrice ?? p.amount - (p.tax ?? 0)) - (p.discount ?? 0);
  const L = 56, R = doc.page.width - 56;
  doc.font("Helvetica-Bold").fontSize(22).text("Invoice", L, 56);
  doc.font("Helvetica").fontSize(10).fillColor("#555").text(p.invoiceNo ?? "", L, 84);
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(11).text(seller.name, R - 220, 56, { width: 220, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#555");
  for (const line of [seller.address, seller.taxId ? `Tax ID: ${seller.taxId}` : undefined, seller.email]) if (line) doc.text(line, R - 220, doc.y, { width: 220, align: "right" });

  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9).text("BILLED TO", L, 140);
  doc.font("Helvetica").fontSize(10).text(o.workspaceName, L, 154).fillColor("#555").text(p.email || "", L, doc.y);
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9).text("DETAILS", 330, 140);
  doc.font("Helvetica").fontSize(10).text(`Date: ${new Date(p.paidAt ?? p.createdAt).toISOString().slice(0, 10)}`, 330, 154).text(`Reference: ${p.reference}`, 330, doc.y).text("Status: Paid", 330, doc.y);

  const top = 240;
  doc.rect(L, top, R - L, 22).fill("#f3f3f3"); doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
  doc.text("DESCRIPTION", L + 8, top + 7); doc.text("AMOUNT", R - 108, top + 7, { width: 100, align: "right" });
  const desc = p.kind === "upgrade" ? `${planName(p.plan)} plan: upgrade (prorated to the end of the current period)` : p.kind === "renewal" ? `${planName(p.plan)} plan: monthly renewal` : `${planName(p.plan)} plan: one month`;
  let y = top + 34;
  const row = (label: string, value: string, bold = false) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#000").text(label, L + 8, y, { width: R - L - 130 }).text(value, R - 108, y, { width: 100, align: "right" }); y += 20; };
  row(desc, fmt(p.listPrice ?? net, p.currency));
  if (p.discount) row(`Discount${p.coupon ? ` (coupon ${p.coupon})` : ""}`, `-${fmt(p.discount, p.currency)}`);
  doc.moveTo(L, y).lineTo(R, y).strokeColor("#ddd").stroke(); y += 10;
  row("Subtotal", fmt(net, p.currency));
  row(`${config.taxLabel ?? "Tax"}${p.taxPercent ? ` (${p.taxPercent}%)` : ""}`, fmt(p.tax ?? 0, p.currency));
  row("Total paid", fmt(p.amount, p.currency), true);
  doc.fontSize(8).fillColor("#777").text("Paid online through Paystack. Amounts are in " + p.currency + ".", L, y + 24);
  doc.end();
  return done;
}
