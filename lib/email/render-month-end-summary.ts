import {
  orderedSummaryCurrencies
} from "@/lib/email/build-month-end-summary";
import { formatEmailCurrency } from "@/lib/email/format";
import type {
  MonthEndSummary,
  MonthEndSummaryInvoice,
  MonthEndSummarySection,
  RenderedMonthEndEmail
} from "@/lib/email/types";

export function renderMonthEndSummary(summary: MonthEndSummary): RenderedMonthEndEmail {
  const subject = `Month-End Invoice Summary - ${summary.monthLabel}`;

  return {
    subject,
    html: renderHtml(summary, subject),
    text: renderText(summary, subject)
  };
}

function renderHtml(summary: MonthEndSummary, subject: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f7f7f4;color:#181917;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:920px;background:#ffffff;border:1px solid #d9d8d3;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px;border-bottom:1px solid #ececea;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#086c57;">Internal summary</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;color:#181917;">${escapeHtml(summary.title)}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#59564f;">
                  ${escapeHtml(summary.monthLabel)} snapshot generated on ${escapeHtml(summary.snapshotDateLabel)}.
                  This summary provides a month-end snapshot of open receivables and open payables, with TTD and USD totals kept separate.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                ${renderSection(summary.sections.receivables)}
                ${renderSection(summary.sections.payables)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderSection(section: MonthEndSummarySection) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
      <tr>
        <td>
          <h2 style="margin:0;font-size:20px;line-height:1.3;color:#181917;">${escapeHtml(section.label)}</h2>
          <p style="margin:6px 0 16px;font-size:14px;color:#59564f;">${section.openCount} open invoice${section.openCount === 1 ? "" : "s"}</p>
          ${renderTotals(section)}
          ${renderInvoiceGroup("Overdue", section.overdue, true)}
          ${renderInvoiceGroup("Open, not overdue", section.current, false)}
        </td>
      </tr>
    </table>`;
}

function renderTotals(section: MonthEndSummarySection) {
  const currencies = orderedSummaryCurrencies(section.totalsByCurrency);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
      <tr>
        ${currencies
          .map(
            (currency) => `
          <td width="${Math.floor(100 / currencies.length)}%" style="padding:0 8px 8px 0;">
            <div style="border:1px solid #ececea;border-radius:10px;background:#f7f7f4;padding:14px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#736f66;">${escapeHtml(section.totalLabel)} (${currency})</p>
              <p style="margin:7px 0 0;font-size:22px;font-weight:800;line-height:1.1;color:#181917;">${escapeHtml(formatEmailCurrency(section.totalsByCurrency[currency], currency))}</p>
            </div>
          </td>`
          )
          .join("")}
      </tr>
    </table>`;
}

function renderInvoiceGroup(title: string, invoices: MonthEndSummaryInvoice[], danger: boolean) {
  return `
    <div style="margin-top:18px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${danger ? "#a81839" : "#42403b"};">${escapeHtml(title)}</p>
      ${
        invoices.length
          ? `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #ececea;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#f7f7f4;">
                  ${["Party", "Invoice", "Type", "Issued", "Due", "Timing", "Status", "Original", "Balance"].map((label) => `<th align="left" style="padding:10px 9px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#736f66;border-bottom:1px solid #ececea;">${label}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${invoices.map(renderInvoiceRow).join("")}
              </tbody>
            </table>`
          : `<p style="margin:0;border:1px solid #ececea;border-radius:10px;background:#ffffff;padding:12px;font-size:14px;color:#736f66;">No invoices in this group.</p>`
      }
    </div>`;
}

function renderInvoiceRow(invoice: MonthEndSummaryInvoice) {
  return `
    <tr>
      <td style="padding:10px 9px;font-size:13px;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(invoice.partyName)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(invoice.invoiceNumber)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#59564f;border-bottom:1px solid #ececea;">${invoice.typeLabel}</td>
      <td style="padding:10px 9px;font-size:13px;color:#59564f;border-bottom:1px solid #ececea;">${escapeHtml(invoice.invoiceDateLabel)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(invoice.dueDateLabel)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(invoice.timingLabel)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#59564f;border-bottom:1px solid #ececea;">${escapeHtml(invoice.status)}</td>
      <td style="padding:10px 9px;font-size:13px;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(formatEmailCurrency(invoice.amount, invoice.currency))}</td>
      <td style="padding:10px 9px;font-size:13px;font-weight:700;color:#181917;border-bottom:1px solid #ececea;">${escapeHtml(formatEmailCurrency(invoice.balanceRemaining, invoice.currency))}</td>
    </tr>`;
}

function renderText(summary: MonthEndSummary, subject: string) {
  return [
    subject,
    "",
    `${summary.monthLabel} snapshot generated on ${summary.snapshotDateLabel}.`,
    "This summary provides a month-end snapshot of open receivables and open payables, with TTD and USD totals kept separate.",
    "",
    renderTextSection(summary.sections.receivables),
    "",
    renderTextSection(summary.sections.payables)
  ].join("\n");
}

function renderTextSection(section: MonthEndSummarySection) {
  return [
    section.label,
    `${section.openCount} open invoice${section.openCount === 1 ? "" : "s"}`,
    ...orderedSummaryCurrencies(section.totalsByCurrency).map(
      (currency) => `${section.totalLabel} (${currency}): ${formatEmailCurrency(section.totalsByCurrency[currency], currency)}`
    ),
    "",
    renderTextInvoiceGroup("Overdue", section.overdue),
    "",
    renderTextInvoiceGroup("Open, not overdue", section.current)
  ].join("\n");
}

function renderTextInvoiceGroup(title: string, invoices: MonthEndSummaryInvoice[]) {
  if (!invoices.length) {
    return `${title}: none`;
  }

  return [
    `${title}:`,
    ...invoices.map(
      (invoice) =>
        `- ${invoice.partyName} | ${invoice.invoiceNumber} | ${invoice.typeLabel} | Issued ${invoice.invoiceDateLabel} | Due ${invoice.dueDateLabel} | ${invoice.timingLabel} | ${invoice.status} | Original ${formatEmailCurrency(invoice.amount, invoice.currency)} | Balance ${formatEmailCurrency(invoice.balanceRemaining, invoice.currency)}`
    )
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
