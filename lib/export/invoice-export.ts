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
  tags: string[];
  payments: ExportPayment[];
  attachments: ExportAttachment[];
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const pageMargin = 48;
const contentWidth = pageWidth - pageMargin * 2;
const sectionGap = 20;

export async function buildInvoiceExportPackage(payload: InvoiceExportPayload) {
  const zip = new JSZip();
  const baseName = sanitizeFilename(payload.invoice.invoice_number || "invoice-export");
  const pdfBytes = await buildInvoiceSummaryPdf(payload);

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

async function buildInvoiceSummaryPdf({
  invoice,
  tags,
  payments,
  attachments
}: InvoiceExportPayload) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [pdf.addPage([pageWidth, pageHeight])];
  let page = pages[0];
  let cursorY = pageHeight - pageMargin;

  drawHeader(page, invoice, boldFont, regularFont);
  cursorY -= 108;

  cursorY = drawSectionTitle(page, "Invoice summary", cursorY, boldFont);
  cursorY = drawKeyValueGrid(
    page,
    cursorY,
    [
      ["Invoice number", invoice.invoice_number],
      ["Status", invoice.status],
      ["Priority", invoice.priority],
      ["Type", invoice.type === "receivable" ? "Collect" : "Pay"],
      ["Counterparty", invoice.party_name],
      ["Contact", cleanValue(invoice.contact)],
      ["Invoice date", formatDate(invoice.invoice_date)],
      ["Due date", formatDate(invoice.due_date)],
      ["Currency", invoice.currency],
      ["Category", invoice.category],
      ["Reference", cleanValue(invoice.reference_number)],
      ["Recurring", invoice.recurring ? "Yes" : "No"]
    ],
    regularFont,
    boldFont
  );

  cursorY -= sectionGap;
  cursorY = drawSectionTitle(page, "Amounts", cursorY, boldFont);
  cursorY = drawKeyValueGrid(
    page,
    cursorY,
    [
      ["Original amount", formatCurrency(Number(invoice.amount), invoice.currency)],
      ["Amount paid", formatCurrency(Number(invoice.amount_paid), invoice.currency)],
      ["Balance remaining", formatCurrency(Math.max(0, Number(invoice.balance_remaining)), invoice.currency)],
      ["Payment method", cleanValue(invoice.payment_method)]
    ],
    regularFont,
    boldFont
  );

  cursorY -= sectionGap;
  cursorY = drawSectionTitle(page, "Timeline", cursorY, boldFont);
  cursorY = drawKeyValueGrid(
    page,
    cursorY,
    [
      ["Created", formatDateTime(invoice.created_at)],
      ["Last updated", formatDateTime(invoice.updated_at)],
      ["Reminder date", invoice.reminder_date ? formatDate(invoice.reminder_date) : "Not set"]
    ],
    regularFont,
    boldFont
  );

  if (tags.length) {
    cursorY -= sectionGap;
    cursorY = drawSectionTitle(page, "Tags", cursorY, boldFont);
    cursorY = drawWrappedBlock(page, tags.join(" | "), cursorY, regularFont, 11);
  }

  if (invoice.notes) {
    cursorY -= sectionGap;
    cursorY = drawSectionTitle(page, "Notes", cursorY, boldFont);
    cursorY = drawWrappedBlock(page, invoice.notes, cursorY, regularFont, 11);
  }

  if (invoice.internal_remarks) {
    cursorY -= sectionGap;
    cursorY = drawSectionTitle(page, "Internal remarks", cursorY, boldFont);
    cursorY = drawWrappedBlock(page, invoice.internal_remarks, cursorY, regularFont, 11);
  }

  const attachmentSummary = attachments.length
    ? attachments.map((attachment) => attachment.fileName).join(" | ")
    : "No attachment included";
  cursorY -= sectionGap;
  cursorY = drawSectionTitle(page, "Attachments", cursorY, boldFont);
  cursorY = drawWrappedBlock(page, attachmentSummary, cursorY, regularFont, 11);

  const paymentsTitleY = cursorY - sectionGap;
  const minimumTableSpace = 180;

  if (payments.length && paymentsTitleY < pageMargin + minimumTableSpace) {
    page = pdf.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - pageMargin;
  } else {
    cursorY = paymentsTitleY;
  }

  cursorY = drawSectionTitle(page, "Payment history", cursorY, boldFont);

  if (!payments.length) {
    drawWrappedBlock(
      page,
      "No payments were recorded for this invoice at the time of export.",
      cursorY,
      regularFont,
      11
    );
  } else {
    drawPaymentsTable(page, payments, cursorY, regularFont, boldFont);
  }

  return pdf.save();
}

function drawHeader(
  page: PDFPage,
  invoice: ExportInvoice,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  page.drawRectangle({
    x: pageMargin,
    y: pageHeight - pageMargin - 72,
    width: contentWidth,
    height: 72,
    color: rgb(0.04, 0.47, 0.34)
  });

  page.drawText("Invoice Tracker Pro", {
    x: pageMargin + 20,
    y: pageHeight - pageMargin - 24,
    size: 12,
    font: boldFont,
    color: rgb(0.92, 1, 0.98)
  });

  page.drawText("Invoice export package", {
    x: pageMargin + 20,
    y: pageHeight - pageMargin - 48,
    size: 24,
    font: boldFont,
    color: rgb(1, 1, 1)
  });

  page.drawText(`Prepared ${formatDateTime(new Date().toISOString())}`, {
    x: pageMargin + 20,
    y: pageHeight - pageMargin - 64,
    size: 10,
    font: regularFont,
    color: rgb(0.84, 0.95, 0.91)
  });

  page.drawText(invoice.invoice_number, {
    x: pageWidth - pageMargin - boldFont.widthOfTextAtSize(invoice.invoice_number, 16) - 20,
    y: pageHeight - pageMargin - 46,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1)
  });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, boldFont: PDFFont) {
  page.drawText(title, {
    x: pageMargin,
    y,
    size: 13,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.15)
  });

  return y - 18;
}

function drawKeyValueGrid(
  page: PDFPage,
  startY: number,
  items: Array<[string, string]>,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const leftX = pageMargin;
  const rightX = pageMargin + contentWidth / 2 + 8;
  const rowHeight = 30;
  let leftY = startY;
  let rightY = startY;

  items.forEach(([label, value], index) => {
    const targetX = index % 2 === 0 ? leftX : rightX;
    const targetY = index % 2 === 0 ? leftY : rightY;

    page.drawText(label, {
      x: targetX,
      y: targetY,
      size: 9,
      font: boldFont,
      color: rgb(0.45, 0.49, 0.55)
    });

    page.drawText(value, {
      x: targetX,
      y: targetY - 12,
      size: 11,
      font: regularFont,
      color: rgb(0.08, 0.1, 0.15)
    });

    if (index % 2 === 0) {
      leftY -= rowHeight;
    } else {
      rightY -= rowHeight;
    }
  });

  return Math.min(leftY, rightY) - 2;
}

function drawWrappedBlock(
  page: PDFPage,
  text: string,
  startY: number,
  font: PDFFont,
  size: number
) {
  const lines = wrapText(text, font, size, contentWidth);
  let cursorY = startY;

  lines.forEach((line) => {
    page.drawText(line, {
      x: pageMargin,
      y: cursorY,
      size,
      font,
      color: rgb(0.16, 0.18, 0.24)
    });
    cursorY -= size + 4;
  });

  return cursorY;
}

function drawPaymentsTable(
  page: PDFPage,
  payments: ExportPayment[],
  startY: number,
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const columns = [
    { key: "created", label: "Recorded", width: 132 },
    { key: "date", label: "Payment date", width: 92 },
    { key: "amount", label: "Amount", width: 100 },
    { key: "method", label: "Method", width: 98 },
    { key: "reference", label: "Reference", width: 77 }
  ] as const;
  const rowHeight = 22;
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  let cursorY = startY;
  let cursorX = pageMargin;

  page.drawRectangle({
    x: pageMargin,
    y: cursorY - 4,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.95, 0.97, 0.97)
  });

  columns.forEach((column) => {
    page.drawText(column.label, {
      x: cursorX + 4,
      y: cursorY + 4,
      size: 9,
      font: boldFont,
      color: rgb(0.38, 0.42, 0.48)
    });
    cursorX += column.width;
  });

  cursorY -= rowHeight;

  payments.slice(0, 12).forEach((payment, index) => {
    const fill = index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.99, 1, 1);
    page.drawRectangle({
      x: pageMargin,
      y: cursorY - 4,
      width: tableWidth,
      height: rowHeight,
      color: fill
    });

    const rowValues = [
      formatDateTime(payment.created_at),
      formatDate(payment.payment_date),
      formatCurrency(payment.amount, payment.currency),
      cleanValue(payment.payment_method),
      cleanValue(payment.reference_number)
    ];

    let rowX = pageMargin;
    columns.forEach((column, columnIndex) => {
      page.drawText(truncateText(rowValues[columnIndex], regularFont, 9, column.width - 8), {
        x: rowX + 4,
        y: cursorY + 4,
        size: 9,
        font: regularFont,
        color: rgb(0.16, 0.18, 0.24)
      });
      rowX += column.width;
    });

    cursorY -= rowHeight;
  });

  if (payments.length > 12) {
    page.drawText(`+ ${payments.length - 12} more payment entries not shown in this PDF`, {
      x: pageMargin,
      y: cursorY - 4,
      size: 9,
      font: regularFont,
      color: rgb(0.45, 0.49, 0.55)
    });
  }
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

function cleanValue(value: string | null) {
  return value?.trim() || "Not set";
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function sanitizeAttachmentName(index: number, value: string) {
  const sanitized = sanitizeFilename(value);
  return sanitized ? `${index}-${sanitized}` : `${index}-attachment`;
}
