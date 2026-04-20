"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Pencil,
  ReceiptText,
  RefreshCcw,
  Send,
  Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { PriorityBadge } from "@/components/invoices/priority-badge";
import { StatusBadge } from "@/components/invoices/status-badge";
import { TypeBadge } from "@/components/invoices/type-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  describeDueDate,
  formatCurrency,
  formatDate,
  formatDateTime,
  invoiceBalance,
  percentage
} from "@/lib/format";
import {
  canReceivePayment,
  getAgingLabel,
  getOperationalStatus,
  getPartyLabel,
  getTypeLabel
} from "@/lib/invoice-helpers";
import { mockActivity } from "@/lib/mock-data";
import type {
  ActivityEvent,
  Invoice,
  InvoiceInput,
  InvoicePayment,
  InvoicePriority,
  InvoiceStatus
} from "@/lib/types";
import { cn } from "@/lib/utils";

const statuses: InvoiceStatus[] = [
  "Draft",
  "Pending",
  "Due Soon",
  "Overdue",
  "Paid",
  "Partially Paid",
  "Cancelled"
];

const priorities: InvoicePriority[] = ["Low", "Medium", "High", "Critical"];

export function InvoiceDetailView({ id }: { id: string }) {
  const router = useRouter();
  const {
    invoices,
    addInvoice,
    updateInvoice,
    markAsPaid,
    recordPartialPayment,
    deleteInvoice,
    getPaymentsForInvoice
  } = useInvoices();
  const { notify } = useToast();
  const invoice = invoices.find((item) => item.id === id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "Pending");
  const [priority, setPriority] = useState<InvoicePriority>(invoice?.priority ?? "Medium");

  useEffect(() => {
    if (invoice) {
      setStatus(invoice.status);
      setPriority(invoice.priority);
    }
  }, [invoice]);

  const activity = useMemo(() => buildActivity(id, invoice), [id, invoice]);

  if (!invoice) {
    return (
      <>
        <PageHeader
          eyebrow="Invoice detail"
          title="Invoice not found"
          description="This record is not available in the active demo ledger."
          action={
            <ButtonLink href="/invoices" variant="secondary">
              Back to ledger
            </ButtonLink>
          }
        />
        <EmptyState
          title="No invoice record"
          description="The invoice may have been archived or the local demo data may have been reset."
          href="/invoices"
        />
      </>
    );
  }

  const displayStatus = getOperationalStatus(invoice);
  const payments = getPaymentsForInvoice(invoice.id);
  const lastPayment = payments[0];
  const balance = invoiceBalance(invoice);
  const paidPercent = percentage(invoice.amountPaid, invoice.amount);
  const canPay = canReceivePayment(invoice);
  const isPaid = displayStatus === "Paid";
  const isClosed = displayStatus === "Paid" || displayStatus === "Cancelled";
  const partyLabel = getPartyLabel(invoice);
  const lastReminder = getLastReminder(invoice.id);

  function notifyMutationError(title: string, error: unknown) {
    notify({
      title,
      description: error instanceof Error ? error.message : "Supabase could not complete the request.",
      variant: "warning"
    });
  }

  async function handleMarkPaid() {
    if (!invoice) {
      return;
    }

    if (!canReceivePayment(invoice)) {
      return;
    }

    try {
      await markAsPaid(invoice.id);
      notify({
        title: "Invoice marked paid",
        description: `${invoice.invoiceNumber} now has a zero balance.`,
        variant: "success"
      });
    } catch (error) {
      notifyMutationError("Invoice could not be marked paid", error);
    }
  }

  async function handlePartialPayment() {
    if (!invoice) {
      return;
    }

    const amount = Number(partialAmount);

    if (!canReceivePayment(invoice)) {
      notify({
        title: "No open balance",
        description: "This invoice does not have a balance available for payment.",
        variant: "warning"
      });
      return;
    }

    if (!amount || amount <= 0) {
      notify({
        title: "Enter a valid payment",
        description: "Partial payments must be greater than zero.",
        variant: "warning"
      });
      return;
    }

    if (amount > balance) {
      notify({
        title: "Payment exceeds balance",
        description: `The remaining balance is ${formatCurrency(balance, invoice.currency)}.`,
        variant: "warning"
      });
      return;
    }

    try {
      await recordPartialPayment(invoice.id, amount);
      setPartialAmount("");
      notify({
        title: "Payment recorded",
        description: `${formatCurrency(amount, invoice.currency)} was applied to ${invoice.invoiceNumber}.`,
        variant: "success"
      });
    } catch (error) {
      notifyMutationError("Payment could not be recorded", error);
    }
  }

  async function handleDelete() {
    if (!invoice) {
      return;
    }

    try {
      await deleteInvoice(invoice.id);
      notify({
        title: "Invoice archived",
        description: `${invoice.invoiceNumber} was removed from the active ledger.`,
        variant: "warning"
      });
      router.push("/invoices");
    } catch (error) {
      notifyMutationError("Invoice could not be archived", error);
    }
  }

  async function saveEdits() {
    if (!invoice) {
      return;
    }

    const patch: Partial<Invoice> = { status, priority };

    if (status === "Paid") {
      patch.amountPaid = invoice.amount;
    }

    if (invoice.status === "Paid" && status !== "Paid") {
      patch.amountPaid = 0;
    }

    try {
      await updateInvoice(invoice.id, patch);
      setEditing(false);
      notify({
        title: "Invoice updated",
        description: "Status and priority were saved.",
        variant: "success"
      });
    } catch (error) {
      notifyMutationError("Invoice could not be updated", error);
    }
  }

  function sendReminder() {
    if (!invoice) {
      return;
    }

    notify({
      title: "Reminder queued",
      description: `${invoice.invoiceNumber} reminder is ready for ${invoice.partyName}.`,
      variant: "info"
    });
  }

  async function duplicateInvoice() {
    if (!invoice) {
      return;
    }

    const input: InvoiceInput = {
      invoiceNumber: `${invoice.invoiceNumber}-COPY`,
      type: invoice.type,
      partyName: invoice.partyName,
      contact: invoice.contact,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      amount: invoice.amount,
      currency: invoice.currency,
      status: "Draft",
      paymentMethod: invoice.paymentMethod,
      category: invoice.category,
      notes: invoice.notes ? `${invoice.notes}\nDuplicated from ${invoice.invoiceNumber}.` : `Duplicated from ${invoice.invoiceNumber}.`,
      internalRemarks: invoice.internalRemarks,
      priority: invoice.priority,
      reminderDate: invoice.reminderDate,
      amountPaid: 0,
      tags: invoice.tags,
      referenceNumber: invoice.referenceNumber,
      recurring: invoice.recurring,
      attachmentName: invoice.attachmentName
    };
    try {
      const created = await addInvoice(input);
      notify({
        title: "Invoice duplicated",
        description: `${created.invoiceNumber} was created as a draft.`,
        variant: "success"
      });
      router.push(`/invoices/${created.id}`);
    } catch (error) {
      notifyMutationError("Invoice could not be duplicated", error);
    }
  }

  function exportInvoice() {
    if (!invoice) {
      return;
    }

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(invoice, null, 2)], { type: "application/json;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);

    notify({
      title: "Invoice export ready",
      description: `${invoice.invoiceNumber} was downloaded as JSON.`,
      variant: "success"
    });
  }

  async function reopenInvoice() {
    if (!invoice) {
      return;
    }

    try {
      await updateInvoice(invoice.id, {
        status: "Pending",
        amountPaid: 0
      });
      notify({
        title: "Invoice reopened",
        description: `${invoice.invoiceNumber} is open again with the original balance.`,
        variant: "info"
      });
    } catch (error) {
      notifyMutationError("Invoice could not be reopened", error);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Invoice detail"
        title={invoice.invoiceNumber}
        description={`${partyLabel} record for ${invoice.partyName}.`}
        action={
          <>
            <ButtonLink href="/invoices" variant="secondary">
              <ArrowLeft className="size-4" />
              Ledger
            </ButtonLink>
            <Button variant="secondary" onClick={() => setEditing((current) => !current)}>
              <Pencil className="size-4" />
              Edit
            </Button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={displayStatus} />
                    <PriorityBadge priority={invoice.priority} />
                    <TypeBadge type={invoice.type} />
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-ink-500">
                    Balance remaining
                  </p>
                  <h2 className="mt-1 text-3xl font-black tracking-normal text-ink-900 sm:text-4xl">
                    {formatCurrency(balance, invoice.currency)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ink-600">
                    {getTypeLabel(invoice)} invoice for {invoice.partyName}. {getAgingLabel(invoice)}.
                  </p>
                </div>

                <div className="w-full rounded-lg border border-ink-200 bg-ink-50 p-4 lg:w-64">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-500">
                        Payment progress
                      </p>
                      <p className="mt-2 text-2xl font-black text-ink-900">
                        {isPaid ? "Paid in full" : `${paidPercent}%`}
                      </p>
                    </div>
                    <CheckCircle2 className={cn("size-5", isPaid ? "text-emerald-700" : "text-ink-400")} />
                  </div>
                  <Progress value={paidPercent} className="mt-3" tone={isPaid ? "emerald" : "peacock"} />
                  <p className="mt-3 text-sm font-semibold text-ink-600">
                    {formatCurrency(invoice.amountPaid, invoice.currency)} paid of{" "}
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid border-t border-ink-100 sm:grid-cols-2 xl:grid-cols-4">
              <FinancialMetric
                label="Original amount"
                value={formatCurrency(invoice.amount, invoice.currency)}
              />
              <FinancialMetric
                label="Amount paid"
                value={formatCurrency(invoice.amountPaid, invoice.currency)}
              />
              <FinancialMetric
                label="Balance remaining"
                value={formatCurrency(balance, invoice.currency)}
                tone={balance > 0 ? "warning" : "success"}
              />
              <FinancialMetric label="Due date" value={formatDate(invoice.dueDate)} detail={getAgingLabel(invoice)} />
            </div>

            {editing ? (
              <div className="grid gap-4 border-t border-ink-100 bg-emerald-50/45 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label>
                  <span className="field-label">Status</span>
                  <select className="field-control" value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus)}>
                    {statuses.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Priority</span>
                  <select className="field-control" value={priority} onChange={(event) => setPriority(event.target.value as InvoicePriority)}>
                    {priorities.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={saveEdits}>Save edits</Button>
              </div>
            ) : null}
          </Card>

          <div className="xl:hidden">
            <QuickActionsCard
              canPay={canPay}
              isClosed={isClosed}
              balance={balance}
              partialAmount={partialAmount}
              partialInputId="partial-payment-mobile"
              onPartialAmountChange={setPartialAmount}
              onMarkPaid={handleMarkPaid}
              onPartialPayment={handlePartialPayment}
              onReminder={sendReminder}
              onDuplicate={duplicateInvoice}
              onExport={exportInvoice}
              onReopen={reopenInvoice}
              onEdit={() => setEditing((current) => !current)}
              onArchive={() => setConfirmOpen(true)}
            />
          </div>

          <section className="grid gap-4 xl:grid-cols-3">
            <SectionCard title="Invoice information" eyebrow="Record">
              <dl className="grid gap-4 text-sm">
                <DetailItem label={partyLabel} value={invoice.partyName} />
                <DetailItem label="Contact" value={cleanValue(invoice.contact)} />
                <DetailItem label="Category" value={invoice.category} />
                <DetailItem label="Reference" value={cleanValue(invoice.referenceNumber)} />
                <DetailItem label="Recurring" value={invoice.recurring ? "Yes" : "No"} />
              </dl>
            </SectionCard>

            <SectionCard title="Payment details" eyebrow="Balance">
              <dl className="grid gap-4 text-sm">
                <DetailItem label="Invoice type" value={getTypeLabel(invoice)} />
                <DetailItem label="Payment method" value={cleanValue(invoice.paymentMethod)} />
                <DetailItem label="Currency" value={invoice.currency} />
                <DetailItem label="Due state" value={getAgingLabel(invoice)} />
                <DetailItem
                  label="Attachment"
                  value={<AttachmentLink invoiceId={invoice.id} fileName={invoice.attachmentName} />}
                />
              </dl>
            </SectionCard>

            <SectionCard title="Operational metadata" eyebrow="Audit">
              <dl className="grid gap-4 text-sm">
                <DetailItem label="Created" value={formatDateTime(invoice.createdAt)} />
                <DetailItem label="Last updated" value={formatDateTime(invoice.updatedAt)} />
                <DetailItem label="Last payment" value={lastPayment ? formatDateTime(lastPayment.createdAt) : "Not paid"} />
                <DetailItem label="Reminder date" value={invoice.reminderDate ? formatDate(invoice.reminderDate) : "Not set"} />
                <DetailItem label="Last reminder" value={lastReminder ? formatDateTime(lastReminder.createdAt) : "Not sent"} />
              </dl>
            </SectionCard>
          </section>

          <SectionCard title="Notes and tags" eyebrow="Context">
            <div className="grid gap-5 xl:grid-cols-2">
              <TextBlock title="Notes" value={invoice.notes} empty="No notes added." />
              <TextBlock title="Internal remarks" value={invoice.internalRemarks} empty="No internal remarks added." />
              <div className="xl:col-span-2">
                <p className="text-sm font-bold text-ink-900">Tags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoice.tags.length ? (
                    invoice.tags.map((tag) => (
                      <span key={tag} className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-xs font-bold text-ink-700">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-sm font-semibold text-ink-500">
                      No tags added
                    </span>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Payment history" eyebrow="Payments">
            <PaymentHistoryTable payments={payments} invoice={invoice} />
          </SectionCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="hidden xl:block">
            <QuickActionsCard
              canPay={canPay}
              isClosed={isClosed}
              balance={balance}
              partialAmount={partialAmount}
              partialInputId="partial-payment"
              onPartialAmountChange={setPartialAmount}
              onMarkPaid={handleMarkPaid}
              onPartialPayment={handlePartialPayment}
              onReminder={sendReminder}
              onDuplicate={duplicateInvoice}
              onExport={exportInvoice}
              onReopen={reopenInvoice}
              onEdit={() => setEditing((current) => !current)}
              onArchive={() => setConfirmOpen(true)}
            />
          </div>

          <SectionCard title="Activity timeline" eyebrow="History">
            <div className="space-y-4">
              {activity.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div
                    className={cn(
                      "mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg",
                      event.tone === "success" && "bg-emerald-50 text-emerald-700",
                      event.tone === "warning" && "bg-citrine-50 text-citrine-800",
                      event.tone === "danger" && "bg-garnet-50 text-garnet-700",
                      event.tone === "neutral" && "bg-ink-100 text-ink-600"
                    )}
                  >
                    <ReceiptText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">{event.title}</p>
                    <p className="mt-1 text-xs font-semibold text-ink-500">
                      {formatDateTime(event.createdAt)} | Finance operations
                    </p>
                    <p className="mt-1 text-sm leading-5 text-ink-600">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </aside>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Archive this invoice?"
        description="This removes the invoice from the active demo ledger. You can reset demo data from Settings."
        confirmLabel="Archive invoice"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function QuickActionsCard({
  canPay,
  isClosed,
  balance,
  partialAmount,
  partialInputId,
  onPartialAmountChange,
  onMarkPaid,
  onPartialPayment,
  onReminder,
  onDuplicate,
  onExport,
  onReopen,
  onEdit,
  onArchive
}: {
  canPay: boolean;
  isClosed: boolean;
  balance: number;
  partialAmount: string;
  partialInputId: string;
  onPartialAmountChange: (value: string) => void;
  onMarkPaid: () => void;
  onPartialPayment: () => void;
  onReminder: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
        Quick actions
      </p>
      <div className="mt-4 grid gap-3">
        {canPay ? (
          <>
            <Button onClick={onMarkPaid}>
              <CheckCircle2 className="size-4" />
              Mark as paid
            </Button>
            <div className="grid gap-2">
              <label className="field-label" htmlFor={partialInputId}>
                Partial payment
              </label>
              <input
                id={partialInputId}
                type="number"
                min="0"
                max={balance}
                step="0.01"
                value={partialAmount}
                onChange={(event) => onPartialAmountChange(event.target.value)}
                className="field-control mt-0"
                placeholder="0.00"
              />
              <Button variant="secondary" onClick={onPartialPayment}>
                Record partial payment
              </Button>
            </div>
            <Button variant="secondary" onClick={onReminder}>
              <Send className="size-4" />
              Send reminder
            </Button>
          </>
        ) : null}

        {isClosed ? (
          <>
            <Button variant="secondary" onClick={onDuplicate}>
              <Copy className="size-4" />
              Duplicate invoice
            </Button>
            <Button variant="secondary" onClick={onExport}>
              <Download className="size-4" />
              Download / Export
            </Button>
            <Button variant="secondary" onClick={onReopen}>
              <RefreshCcw className="size-4" />
              Reopen invoice
            </Button>
          </>
        ) : null}

        <Button variant="secondary" onClick={onEdit}>
          <Pencil className="size-4" />
          Edit status
        </Button>
        <Button variant="danger" onClick={onArchive}>
          <Trash2 className="size-4" />
          Archive invoice
        </Button>
      </div>
    </Card>
  );
}

function FinancialMetric({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "border-b border-ink-100 p-5 sm:border-r xl:border-b-0",
        tone === "success" && "bg-emerald-50/50",
        tone === "warning" && "bg-citrine-50/50"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className="mt-2 text-lg font-black text-ink-900">{value}</p>
      {detail ? <p className="mt-1 text-sm font-semibold text-ink-500">{detail}</p> : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function AttachmentLink({ invoiceId, fileName }: { invoiceId: string; fileName?: string }) {
  if (!fileName) {
    return "No attachment uploaded";
  }

  return (
    <a
      href={`/api/invoices/${invoiceId}/attachment`}
      target="_blank"
      rel="noreferrer"
      title={`View ${fileName}`}
      className="inline-flex max-w-full items-center justify-end gap-1.5 rounded-md text-right font-black text-emerald-700 underline-offset-4 transition hover:text-emerald-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
    >
      <span className="min-w-0 break-words">{fileName}</span>
      <Download className="size-3.5 shrink-0" />
    </a>
  );
}

function TextBlock({ title, value, empty }: { title: string; value?: string; empty: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-4">
      <p className="text-sm font-bold text-ink-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-ink-600">{value?.trim() || empty}</p>
    </div>
  );
}

function PaymentHistoryTable({
  payments,
  invoice
}: {
  payments: InvoicePayment[];
  invoice: Invoice;
}) {
  if (!payments.length) {
    return (
      <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-4">
        <p className="text-sm font-black text-ink-900">No payments recorded</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Record a partial payment or mark the invoice as paid to build the payment history.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink-100">
      <div className="grid gap-3 border-b border-ink-100 bg-ink-50/70 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Payments</p>
          <p className="mt-1 text-lg font-black text-ink-900">{payments.length}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Total paid</p>
          <p className="mt-1 text-lg font-black text-ink-900">
            {formatCurrency(invoice.amountPaid, invoice.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Remaining</p>
          <p className="mt-1 text-lg font-black text-ink-900">
            {formatCurrency(invoiceBalance(invoice), invoice.currency)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100 text-left text-sm">
          <thead className="bg-white">
            <tr>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Recorded
              </th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Payment date
              </th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Amount
              </th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Method
              </th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Reference
              </th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-ink-500">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink-700">
                  {formatDateTime(payment.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                  {formatDate(payment.paymentDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-black text-ink-900">
                  {formatCurrency(payment.amount, payment.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                  {cleanValue(payment.paymentMethod)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                  {cleanValue(payment.referenceNumber)}
                </td>
                <td className="min-w-48 px-4 py-3 text-ink-600">
                  {cleanValue(payment.notes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cleanValue(value?: string) {
  return value?.trim() || "Not set";
}

function getLastReminder(invoiceId: string) {
  return mockActivity
    .filter((item) => item.invoiceId === invoiceId)
    .filter((item) => item.title.toLowerCase().includes("reminder"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function buildActivity(invoiceId: string, invoice?: Invoice): ActivityEvent[] {
  const matched = mockActivity.filter((item) => item.invoiceId === invoiceId);

  if (!invoice) {
    return matched;
  }

  const events: ActivityEvent[] = [
    {
      id: `${invoice.id}-created`,
      invoiceId: invoice.id,
      title: "Invoice created",
      description: `${invoice.invoiceNumber} entered for ${invoice.partyName}.`,
      createdAt: invoice.createdAt,
      tone: "neutral"
    },
    ...matched
  ];

  if (invoice.amountPaid > 0) {
    events.push({
      id: `${invoice.id}-payment`,
      invoiceId: invoice.id,
      title: getOperationalStatus(invoice) === "Paid" ? "Payment recorded" : "Partial payment recorded",
      description: `${formatCurrency(invoice.amountPaid, invoice.currency)} has been applied. ${formatCurrency(invoiceBalance(invoice), invoice.currency)} remains.`,
      createdAt: invoice.updatedAt,
      tone: "success"
    });
  }

  events.push({
    id: `${invoice.id}-status`,
    invoiceId: invoice.id,
    title: `Status changed to ${getOperationalStatus(invoice)}`,
    description: `${describeDueDate(invoice.dueDate, getOperationalStatus(invoice))}.`,
    createdAt: invoice.updatedAt,
    tone: getOperationalStatus(invoice) === "Overdue" ? "danger" : "warning"
  });

  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
