import "server-only";

import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type ExportInvoice = {
  id: string;
  invoice_number: string;
  type: "receivable" | "payable";
  party_name: string;
  contact: string | null;
  invoice_date: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  balance_remaining: number;
  currency: "TTD" | "USD" | "EUR" | "GBP" | "CAD" | "BOB";
  status: string;
  payment_method: string | null;
  category: string;
  notes: string | null;
  internal_remarks: string | null;
  priority: string;
  reminder_date: string | null;
  reference_number: string | null;
  recurring: boolean;
  created_at: string;
  updated_at: string;
};

type ExportWorkspace = {
  name: string;
  businessName: string | null;
  financeEmail: string | null;
  defaultPaymentTerms: string | null;
};

type ExportPayment = {
  id: string;
  amount: number;
  currency: ExportInvoice["currency"];
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

type ExportAttachment = {
  fileName: string;
  contentType: string | null;
  bytes: Uint8Array;
};

export type InvoiceExportPayload = {
  invoice: ExportInvoice;
  workspace: ExportWorkspace;
  tags: string[];
  payments: ExportPayment[];
  attachments: ExportAttachment[];
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const pageMargin = 48;
const contentWidth = pageWidth - pageMargin * 2;
const accentColor = rgb(0.04, 0.47, 0.34);
const accentSoft = rgb(0.92, 0.98, 0.96);
const ink = rgb(0.08, 0.1, 0.15);
const muted = rgb(0.42, 0.46, 0.52);
const line = rgb(0.87, 0.9, 0.92);
const cardFill = rgb(0.98, 0.99, 0.99);

export async function buildInvoiceExportPackage(payload: InvoiceExportPayload) {
  const zip = new JSZip();
  const baseName = sanitizeFilename(payload.invoice.invoice_number || "invoice-export");
  const pdfBytes = await buildInvoicePdf(payload);

  zip.file(`${baseName}.pdf`, pdfBytes, {
    binary: true
  });

  payload.attachments.forEach((attachment, index) => {
    const fileName = attachment.fileName || `attachment-${index + 1}`;
    zip.file(`attachments/${sanitizeAttachmentName(index + 1, fileName)}`, attachment.bytes, {
      binary: true
    });
  });

  const archiveBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6
    }
  });

  return {
    fileName: `${baseName}-export.zip`,
    bytes: archiveBytes
  };
}

async function buildInvoicePdf(payload: InvoiceExportPayload) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const exportedAt = new Date().toISOString();

  const page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = drawDocumentHeader(page, payload, exportedAt, boldFont, regularFont);
  cursorY = drawPartyPanels(page, payload, cursorY, regularFont, boldFont);
  cursorY = drawMetaCards(page, payload, cursorY, regularFont, boldFont);
  cursorY = drawAmountSummary(page, payload.invoice, cursorY, regularFont, boldFont);
  cursorY = drawBillingTable(page, payload, cursorY, regularFont, boldFont);

  if (payload.invoice.notes?.trim()) {
    cursorY = drawParagraphCard(page, "Notes", payload.invoice.notes, cursorY, regularFont, boldFont);
  }

  if (payload.attachments.length) {
    drawInfoStrip(
      page,
      getSupportingDocumentLabel(payload.attachments.length),
      cursorY,
      regularFont,
      boldFont
    );
  }

  if (payload.payments.length) {
    drawPaymentActivityPage(pdf, payload, regularFont, boldFont);
  }

  addPageFooters(pdf, payload, exportedAt, regularFont);
  return pdf.save();
}

function drawDocumentHeader(
  page: PDFPage,
  payload: InvoiceExportPayload,
  exportedAt: string,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  page.drawRectangle({
    x: pageMargin,
    y: pageHeight - pageMargin - 6,
    width: contentWidth,
    height: 6,
    color: accentColor
  });

  const companyName = getCompanyName(payload.workspace);
  const title = getDocumentTitle(payload.invoice);
  const rightEdge = pageWidth - pageMargin;

  page.drawText(companyName, {
    x: pageMargin,
    y: pageHeight - pageMargin - 34,
    size: 20,
    font: boldFont,
    color: ink
  });

  if (payload.workspace.financeEmail?.trim()) {
    page.drawText(payload.workspace.financeEmail.trim(), {
      x: pageMargin,
      y: pageHeight - pageMargin - 52,
      size: 10,
      font: regularFont,
      color: muted
    });
  }

  drawRightAlignedText(page, title, rightEdge, pageHeight - pageMargin - 34, 24, boldFont, ink);
  drawRightAlignedText(
    page,
    payload.invoice.invoice_number,
    rightEdge,
    pageHeight - pageMargin - 52,
    14,
    boldFont,
    ink
  );
  drawRightAlignedText(
    page,
    `Exported ${formatDateTime(exportedAt)}`,
    rightEdge,
    pageHeight - pageMargin - 68,
    10,
    regularFont,
    muted
  );

  drawStatusBadge(page, payload.invoice.status, rightEdge, pageHeight - pageMargin - 92, boldFont);

  page.drawLine({
    start: { x: pageMargin, y: pageHeight - pageMargin - 112 },
    end: { x: pageWidth - pageMargin, y: pageHeight - pageMargin - 112 },
    thickness: 1,
    color: line
  });

  return pageHeight - pageMargin - 132;
}

function drawPartyPanels(
  page: PDFPage,
  payload: InvoiceExportPayload,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const panelGap = 12;
  const panelWidth = (contentWidth - panelGap) / 2;
  const panelHeight = 82;
  const issuedByLines = [getCompanyName(payload.workspace)];

  if (payload.workspace.financeEmail?.trim()) {
    issuedByLines.push(payload.workspace.financeEmail.trim());
  }

  const counterpartyLines = [payload.invoice.party_name];

  if (payload.invoice.contact?.trim()) {
    counterpartyLines.push(payload.invoice.contact.trim());
  }

  drawInfoPanel(page, "Issued by", issuedByLines, pageMargin, startY, panelWidth, panelHeight, regularFont, boldFont);
  drawInfoPanel(
    page,
    payload.invoice.type === "receivable" ? "Bill to" : "Vendor",
    counterpartyLines,
    pageMargin + panelWidth + panelGap,
    startY,
    panelWidth,
    panelHeight,
    regularFont,
    boldFont
  );

  return startY - panelHeight - 18;
}

function drawInfoPanel(
  page: PDFPage,
  label: string,
  lines: string[],
  x: number,
  topY: number,
  width: number,
  height: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const bottomY = topY - height;

  page.drawRectangle({
    x,
    y: bottomY,
    width,
    height,
    color: cardFill,
    borderColor: line,
    borderWidth: 1
  });

  page.drawText(label, {
    x: x + 14,
    y: topY - 18,
    size: 10,
    font: boldFont,
    color: muted
  });

  lines.forEach((lineText, index) => {
    page.drawText(truncateText(lineText, index === 0 ? boldFont : regularFont, index === 0 ? 13 : 11, width - 28), {
      x: x + 14,
      y: topY - 40 - index * 16,
      size: index === 0 ? 13 : 11,
      font: index === 0 ? boldFont : regularFont,
      color: ink
    });
  });
}

function drawMetaCards(
  page: PDFPage,
  payload: InvoiceExportPayload,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const fields = buildMetaFields(payload);
  const columnGap = 12;
  const columnWidth = (contentWidth - columnGap) / 2;
  const rowHeight = 50;
  const rows = Math.ceil(fields.length / 2);

  fields.forEach((field, index) => {
    const columnIndex = index % 2;
    const rowIndex = Math.floor(index / 2);
    const x = pageMargin + columnIndex * (columnWidth + columnGap);
    const y = startY - rowIndex * (rowHeight + 10);

    page.drawRectangle({
      x,
      y: y - rowHeight,
      width: columnWidth,
      height: rowHeight,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 1
    });

    page.drawText(field.label, {
      x: x + 12,
      y: y - 16,
      size: 9,
      font: boldFont,
      color: muted
    });

    page.drawText(truncateText(field.value, regularFont, 12, columnWidth - 24), {
      x: x + 12,
      y: y - 34,
      size: 12,
      font: regularFont,
      color: ink
    });
  });

  return startY - rows * (rowHeight + 10) - 10;
}

function drawAmountSummary(
  page: PDFPage,
  invoice: ExportInvoice,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const boxGap = 12;
  const boxWidth = (contentWidth - boxGap * 2) / 3;
  const boxHeight = 74;
  const items = [
    {
      label: "Total",
      value: formatCurrency(Number(invoice.amount), invoice.currency),
      fill: rgb(0.98, 0.99, 0.99)
    },
    {
      label: "Paid",
      value: formatCurrency(Number(invoice.amount_paid), invoice.currency),
      fill: rgb(0.95, 0.98, 0.97)
    },
    {
      label: "Balance due",
      value: formatCurrency(Math.max(0, Number(invoice.balance_remaining)), invoice.currency),
      fill: Number(invoice.balance_remaining) > 0 ? rgb(1, 0.98, 0.93) : accentSoft
    }
  ];

  items.forEach((item, index) => {
    const x = pageMargin + index * (boxWidth + boxGap);
    const y = startY;

    page.drawRectangle({
      x,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: item.fill,
      borderColor: line,
      borderWidth: 1
    });

    page.drawText(item.label, {
      x: x + 14,
      y: y - 18,
      size: 10,
      font: boldFont,
      color: muted
    });

    page.drawText(item.value, {
      x: x + 14,
      y: y - 45,
      size: 16,
      font: boldFont,
      color: ink
    });
  });

  return startY - boxHeight - 22;
}

function drawBillingTable(
  page: PDFPage,
  payload: InvoiceExportPayload,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const rows = buildSummaryRows(payload);
  const columns = [
    { label: "Description", width: 160 },
    { label: "Details", width: 229 },
    { label: "Amount", width: 110 }
  ] as const;
  const rowHeight = 30;
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  let cursorY = startY;

  page.drawText("Invoice summary", {
    x: pageMargin,
    y: cursorY,
    size: 16,
    font: boldFont,
    color: ink
  });
  cursorY -= 20;

  page.drawRectangle({
    x: pageMargin,
    y: cursorY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.96, 0.98, 0.98)
  });

  let cursorX = pageMargin;
  columns.forEach((column) => {
    page.drawText(column.label, {
      x: cursorX + 8,
      y: cursorY - 18,
      size: 9,
      font: boldFont,
      color: muted
    });
    cursorX += column.width;
  });

  cursorY -= rowHeight;

  rows.forEach((row, index) => {
    page.drawRectangle({
      x: pageMargin,
      y: cursorY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.99, 1, 1)
    });

    page.drawText(truncateText(row.description, boldFont, 10, columns[0].width - 16), {
      x: pageMargin + 8,
      y: cursorY - 18,
      size: 10,
      font: boldFont,
      color: ink
    });

    page.drawText(truncateText(row.details, regularFont, 10, columns[1].width - 16), {
      x: pageMargin + columns[0].width + 8,
      y: cursorY - 18,
      size: 10,
      font: regularFont,
      color: ink
    });

    drawRightAlignedText(
      page,
      row.amount,
      pageMargin + tableWidth - 8,
      cursorY - 18,
      10,
      boldFont,
      ink
    );

    cursorY -= rowHeight;
  });

  return cursorY - 16;
}

function drawParagraphCard(
  page: PDFPage,
  title: string,
  text: string,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const lines = wrapText(text, regularFont, 11, contentWidth - 28).slice(0, 6);
  const truncated = wrapText(text, regularFont, 11, contentWidth - 28).length > lines.length;
  const renderedLines = truncated ? [...lines.slice(0, -1), `${lines[lines.length - 1]}...`] : lines;
  const height = 42 + renderedLines.length * 15;

  page.drawRectangle({
    x: pageMargin,
    y: startY - height,
    width: contentWidth,
    height,
    color: cardFill,
    borderColor: line,
    borderWidth: 1
  });

  page.drawText(title, {
    x: pageMargin + 14,
    y: startY - 18,
    size: 10,
    font: boldFont,
    color: muted
  });

  renderedLines.forEach((lineText, index) => {
    page.drawText(lineText, {
      x: pageMargin + 14,
      y: startY - 38 - index * 15,
      size: 11,
      font: regularFont,
      color: ink
    });
  });

  return startY - height - 16;
}

function drawInfoStrip(
  page: PDFPage,
  text: string,
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const height = 42;

  page.drawRectangle({
    x: pageMargin,
    y: startY - height,
    width: contentWidth,
    height,
    color: accentSoft,
    borderColor: line,
    borderWidth: 1
  });

  page.drawText("Supporting documents", {
    x: pageMargin + 14,
    y: startY - 16,
    size: 10,
    font: boldFont,
    color: accentColor
  });

  page.drawText(text, {
    x: pageMargin + 14,
    y: startY - 30,
    size: 10,
    font: regularFont,
    color: ink
  });
}

function drawPaymentActivityPage(
  pdf: PDFDocument,
  payload: InvoiceExportPayload,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const page = pdf.addPage([pageWidth, pageHeight]);
  const tableRows = payload.payments.slice(0, 16);
  const columns = [
    { label: "Payment date", width: 100 },
    { label: "Recorded", width: 132 },
    { label: "Amount", width: 96 },
    { label: "Method", width: 90 },
    { label: "Reference", width: 81 }
  ] as const;
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const rowHeight = 26;
  let cursorY = pageHeight - pageMargin;

  page.drawText("Payment activity", {
    x: pageMargin,
    y: cursorY - 6,
    size: 20,
    font: boldFont,
    color: ink
  });

  page.drawText(
    `${payload.payments.length} payment${payload.payments.length === 1 ? "" : "s"} recorded | Total paid ${formatCurrency(
      Number(payload.invoice.amount_paid),
      payload.invoice.currency
    )}`,
    {
      x: pageMargin,
      y: cursorY - 24,
      size: 10,
      font: regularFont,
      color: muted
    }
  );

  cursorY -= 52;

  page.drawRectangle({
    x: pageMargin,
    y: cursorY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.96, 0.98, 0.98)
  });

  let cursorX = pageMargin;
  columns.forEach((column) => {
    page.drawText(column.label, {
      x: cursorX + 8,
      y: cursorY - 17,
      size: 9,
      font: boldFont,
      color: muted
    });
    cursorX += column.width;
  });

  cursorY -= rowHeight;

  tableRows.forEach((payment, index) => {
    page.drawRectangle({
      x: pageMargin,
      y: cursorY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.99, 1, 1)
    });

    const values = [
      formatDate(payment.payment_date),
      formatDateTime(payment.created_at),
      formatCurrency(payment.amount, payment.currency),
      cleanInlineValue(payment.payment_method),
      cleanInlineValue(payment.reference_number)
    ];

    let rowX = pageMargin;
    columns.forEach((column, columnIndex) => {
      const font = columnIndex === 2 ? boldFont : regularFont;
      page.drawText(truncateText(values[columnIndex], font, 10, column.width - 16), {
        x: rowX + 8,
        y: cursorY - 17,
        size: 10,
        font,
        color: ink
      });
      rowX += column.width;
    });

    cursorY -= rowHeight;
  });

  if (payload.payments.length > tableRows.length) {
    page.drawText(
      `Additional payments (${payload.payments.length - tableRows.length}) were omitted from this page due to space.`,
      {
        x: pageMargin,
        y: cursorY - 16,
        size: 9,
        font: regularFont,
        color: muted
      }
    );
  }
}

function addPageFooters(
  pdf: PDFDocument,
  payload: InvoiceExportPayload,
  exportedAt: string,
  regularFont: PDFFont
) {
  const pages = pdf.getPages();

  pages.forEach((page, index) => {
    const footerText = `${getCompanyName(payload.workspace)} | ${formatDateTime(exportedAt)} | Page ${
      index + 1
    } of ${pages.length}`;

    page.drawLine({
      start: { x: pageMargin, y: pageMargin - 6 },
      end: { x: pageWidth - pageMargin, y: pageMargin - 6 },
      thickness: 1,
      color: line
    });

    page.drawText(footerText, {
      x: pageMargin,
      y: pageMargin - 22,
      size: 9,
      font: regularFont,
      color: muted
    });
  });
}

function buildMetaFields(payload: InvoiceExportPayload) {
  const fields = [
    { label: "Invoice number", value: payload.invoice.invoice_number },
    { label: "Issue date", value: formatDate(payload.invoice.invoice_date) },
    { label: "Due date", value: formatDate(payload.invoice.due_date) }
  ];

  if (payload.workspace.defaultPaymentTerms?.trim()) {
    fields.push({
      label: "Terms",
      value: payload.workspace.defaultPaymentTerms.trim()
    });
  }

  if (payload.invoice.reference_number?.trim()) {
    fields.push({
      label: "Reference",
      value: payload.invoice.reference_number.trim()
    });
  }

  if (payload.invoice.payment_method?.trim()) {
    fields.push({
      label: "Payment method",
      value: payload.invoice.payment_method.trim()
    });
  }

  return fields;
}

function buildSummaryRows(payload: InvoiceExportPayload) {
  const invoice = payload.invoice;
  const balance = Math.max(0, Number(invoice.balance_remaining));
  const rows = [
    {
      description: invoice.type === "receivable" ? "Receivable invoice" : "Payable invoice",
      details: buildPrimaryDetail(invoice),
      amount: formatCurrency(Number(invoice.amount), invoice.currency)
    }
  ];

  if (Number(invoice.amount_paid) > 0) {
    rows.push({
      description: "Payments received",
      details: `${payload.payments.length} recorded transaction${payload.payments.length === 1 ? "" : "s"}`,
      amount: formatNegativeCurrency(Number(invoice.amount_paid), invoice.currency)
    });
  }

  rows.push({
    description: balance > 0 ? "Balance due" : "Balance settled",
    details: balance > 0 ? `Due ${formatDate(invoice.due_date)}` : "Paid in full",
    amount: formatCurrency(balance, invoice.currency)
  });

  return rows;
}

function buildPrimaryDetail(invoice: ExportInvoice) {
  const detailParts = [`Category: ${invoice.category}`];

  if (invoice.reference_number?.trim()) {
    detailParts.push(`Reference: ${invoice.reference_number.trim()}`);
  }

  return detailParts.join(" | ");
}

function getCompanyName(workspace: ExportWorkspace) {
  return workspace.businessName?.trim() || workspace.name.trim() || "Invoice Tracker Pro";
}

function getDocumentTitle(invoice: ExportInvoice) {
  if (invoice.status === "Cancelled") {
    return "Cancelled Invoice";
  }

  if (Number(invoice.balance_remaining) <= 0 || invoice.status === "Paid") {
    return "Paid Invoice";
  }

  return "Invoice";
}

function getSupportingDocumentLabel(count: number) {
  return `${count} supporting document${count === 1 ? "" : "s"} included separately in this export package.`;
}

function drawStatusBadge(
  page: PDFPage,
  status: string,
  rightEdge: number,
  y: number,
  boldFont: PDFFont
) {
  const badgeText = status.toUpperCase();
  const fontSize = 9;
  const horizontalPadding = 10;
  const badgeWidth = boldFont.widthOfTextAtSize(badgeText, fontSize) + horizontalPadding * 2;
  const x = rightEdge - badgeWidth;
  const fillColor =
    status === "Paid"
      ? rgb(0.9, 0.97, 0.94)
      : status === "Cancelled"
        ? rgb(0.99, 0.92, 0.92)
        : rgb(1, 0.97, 0.9);
  const textColor =
    status === "Paid" ? accentColor : status === "Cancelled" ? rgb(0.7, 0.2, 0.2) : rgb(0.62, 0.43, 0.02);

  page.drawRectangle({
    x,
    y: y - 12,
    width: badgeWidth,
    height: 18,
    color: fillColor,
    borderColor: line,
    borderWidth: 1
  });

  page.drawText(badgeText, {
    x: x + horizontalPadding,
    y: y - 6,
    size: fontSize,
    font: boldFont,
    color: textColor
  });
}

function drawRightAlignedText(
  page: PDFPage,
  text: string,
  rightEdge: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  page.drawText(text, {
    x: rightEdge - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return ["-"];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function truncateText(value: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }

  let truncated = value;

  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}...`;
}

function cleanInlineValue(value: string | null) {
  return value?.trim() || "—";
}

function formatNegativeCurrency(amount: number, currency: ExportInvoice["currency"]) {
  return `-${formatCurrency(amount, currency)}`;
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function sanitizeAttachmentName(index: number, value: string) {
  const sanitized = sanitizeFilename(value);
  return sanitized ? `${index}-${sanitized}` : `${index}-attachment`;
}
