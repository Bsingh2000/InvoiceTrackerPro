"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  Landmark,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { StatCard } from "@/components/dashboard/stat-card";
import { PriorityBadge } from "@/components/invoices/priority-badge";
import { StatusBadge } from "@/components/invoices/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { getAgingBuckets } from "@/lib/analytics";
import {
  compareDateOnly,
  getAppTodayString,
  isSameMonthDateOnly
} from "@/lib/date-utils";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  invoiceBalance,
  isInvoiceOpen,
  percentage
} from "@/lib/format";
import {
  getBalanceLine,
  getOperationalStatus
} from "@/lib/invoice-helpers";
import { mockActivity } from "@/lib/mock-data";
import type { Invoice, InvoicePriority, InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const quickFilters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Overdue", value: "overdue" },
  { label: "Due soon", value: "dueSoon" },
  { label: "Paid", value: "paid" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Needs approval", value: "approval" },
  { label: "Critical", value: "critical" }
] as const;

const statuses: Array<InvoiceStatus | "All"> = [
  "All",
  "Draft",
  "Pending",
  "Due Soon",
  "Overdue",
  "Paid",
  "Partially Paid",
  "Cancelled"
];

const priorities: Array<InvoicePriority | "All"> = ["All", "Low", "Medium", "High", "Critical"];
const priorityScore: Record<InvoicePriority, number> = {
  Critical: 420,
  High: 280,
  Medium: 120,
  Low: 0
};

type QuickFilter = (typeof quickFilters)[number]["value"];
type DateRange = "all" | "due7" | "due30" | "dueMonth" | "issuedMonth";
type SortKey = "urgency" | "dueDate" | "amount" | "balance" | "vendor" | "status" | "workflow";
type PanelTab = "overdue" | "dueSoon" | "paid";
type TimingTone = "emerald" | "citrine" | "garnet" | "peacock" | "neutral" | "violet";
type WorkflowKind = "approval" | "scheduled" | "payment" | "proof" | "hold" | "monitor" | "closed";

export function PayablesView() {
  const { invoices, markAsPaid, deleteInvoice } = useInvoices();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<PanelTab>("overdue");

  const data = useMemo(() => {
    const payables = invoices.filter((invoice) => invoice.type === "payable");
    const open = payables.filter(isInvoiceOpen);
    const overdue = open.filter((invoice) => getTimingState(invoice).label === "Overdue");
    const dueSoon = open.filter((invoice) => {
      const days = daysUntil(invoice.dueDate);
      return days >= 0 && days <= 7;
    });
    const paidThisMonth = payables
      .filter((invoice) => getOperationalStatus(invoice) === "Paid")
      .filter((invoice) => isSameMonthDateOnly(invoice.updatedAt, getAppTodayString()));
    const totalOpen = open.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const overdueAmount = overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const dueSoonAmount = dueSoon.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const disbursedThisMonth = paidThisMonth.reduce((total, invoice) => total + invoice.amountPaid, 0);
    const aging = getAgingBuckets(payables, "payable");
    const queue = payables
      .filter(isPaymentQueueCandidate)
      .sort((a, b) => getPaymentScore(b) - getPaymentScore(a))
      .slice(0, 5);

    return {
      payables,
      open,
      overdue,
      overdueAmount,
      dueSoon,
      dueSoonAmount,
      paidThisMonth,
      totalOpen,
      disbursedThisMonth,
      aging,
      queue
    };
  }, [invoices]);

  function schedulePayment(invoice: Invoice) {
    notify({
      title: "Payment scheduled",
      description: `${invoice.invoiceNumber} is queued for ${invoice.paymentMethod || "payment release"}.`,
      variant: "info"
    });
  }

  function markPaid(invoice: Invoice) {
    if (!canPayInvoice(invoice)) {
      return;
    }

    markAsPaid(invoice.id);
    notify({
      title: "Payable marked paid",
      description: `${invoice.invoiceNumber} has been settled for ${invoice.partyName}.`,
      variant: "success"
    });
  }

  function approvePayable(invoice: Invoice) {
    notify({
      title: "Approval noted",
      description: `${invoice.invoiceNumber} is ready for payment planning.`,
      variant: "success"
    });
  }

  function uploadProof(invoice: Invoice) {
    notify({
      title: "Proof placeholder opened",
      description: `${invoice.invoiceNumber} is ready for a payment confirmation upload.`,
      variant: "info"
    });
  }

  function putOnHold(invoice: Invoice) {
    notify({
      title: "Hold noted",
      description: `${invoice.invoiceNumber} was flagged for payment review.`,
      variant: "warning"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Cash outflow control"
        title="Payables"
        description="Plan vendor obligations, approval readiness, payment timing, and outgoing cash from one focused workspace."
        action={
          <>
            <Button variant="secondary" onClick={() => exportPayables(data.payables, notify)}>
              <Download className="size-4" />
              Export payables
            </Button>
            <ButtonLink href="/invoices/new?type=payable">
              Add payable
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open payables"
          value={formatCurrency(data.totalOpen)}
          detail={`${data.open.length} active vendor bill${data.open.length === 1 ? "" : "s"}`}
          icon={<Landmark className="size-5" />}
          tone="peacock"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(data.overdueAmount)}
          detail={`${data.overdue.length} payable${data.overdue.length === 1 ? "" : "s"} past terms`}
          icon={<AlertTriangle className="size-5" />}
          tone="garnet"
        />
        <StatCard
          label="Due in next 7 days"
          value={formatCurrency(data.dueSoonAmount)}
          detail={`${data.dueSoon.length} payable${data.dueSoon.length === 1 ? "" : "s"} need scheduling`}
          icon={<CalendarClock className="size-5" />}
          tone="citrine"
        />
        <StatCard
          label="Disbursed this month"
          value={formatCurrency(data.disbursedThisMonth)}
          detail={`${data.paidThisMonth.length} invoice${data.paidThisMonth.length === 1 ? "" : "s"} settled`}
          icon={<CheckCircle2 className="size-5" />}
          tone="ink"
        />
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <PayablesAgingOverview
          buckets={data.aging}
          totalOpen={data.totalOpen}
          overdueAmount={data.overdueAmount}
          dueSoonAmount={data.dueSoonAmount}
        />
        <PaymentQueue
          invoices={data.queue}
          onApprove={approvePayable}
          onSchedule={schedulePayment}
          onMarkPaid={markPaid}
          onUploadProof={uploadProof}
        />
      </section>

      <section className="mt-4">
        <PayablesLedger
          invoices={data.payables}
          onApprove={approvePayable}
          onSchedule={schedulePayment}
          onMarkPaid={markPaid}
          onUploadProof={uploadProof}
          onHold={putOnHold}
          onArchive={(invoice) => {
            deleteInvoice(invoice.id);
            notify({
              title: "Payable archived",
              description: `${invoice.invoiceNumber} was removed from the active payables ledger.`,
              variant: "warning"
            });
          }}
        />
      </section>

      <section className="mt-4">
        <PayablesPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          overdue={data.overdue}
          dueSoon={data.dueSoon}
          paid={data.paidThisMonth}
        />
      </section>
    </>
  );
}

function PayablesAgingOverview({
  buckets,
  totalOpen,
  overdueAmount,
  dueSoonAmount
}: {
  buckets: Array<{ label: string; amount: number; count: number }>;
  totalOpen: number;
  overdueAmount: number;
  dueSoonAmount: number;
}) {
  const overdueRatio = totalOpen > 0 ? Math.round((overdueAmount / totalOpen) * 100) : 0;

  return (
    <SectionCard
      title="Aging overview"
      eyebrow="Payment exposure"
      action={
        <p className="text-sm font-semibold text-ink-500">
          {overdueRatio}% overdue
        </p>
      }
    >
      <div className="mb-4 rounded-lg border border-peacock-100 bg-peacock-50/45 p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-peacock-700">
          Next cash need
        </p>
        <p className="mt-1 text-sm font-semibold text-ink-700">
          {formatCurrency(dueSoonAmount)} is due in the next 7 days.
        </p>
      </div>

      <div className="space-y-3">
        {buckets.map((bucket) => {
          const share = totalOpen > 0 ? Math.round((bucket.amount / totalOpen) * 100) : 0;
          return (
            <div
              key={bucket.label}
              className={cn(
                "rounded-lg border p-3",
                bucket.count === 0 ? "border-ink-100 bg-ink-50/60" : agingBucketFrame(bucket.label)
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-ink-900">{bucket.label}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-500">
                    {bucket.count} bill{bucket.count === 1 ? "" : "s"} | {share}% of open AP
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-ink-900">{formatCurrency(bucket.amount)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={cn("h-full rounded-full transition-all", agingBucketBar(bucket.label))}
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function PaymentQueue({
  invoices,
  onApprove,
  onSchedule,
  onMarkPaid,
  onUploadProof
}: {
  invoices: Invoice[];
  onApprove: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onUploadProof: (invoice: Invoice) => void;
}) {
  return (
    <SectionCard title="Payment queue" eyebrow="Bills requiring action">
      {!invoices.length ? (
        <p className="text-sm leading-6 text-ink-500">No vendor obligations require immediate action.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {invoices.map((invoice) => {
            const timing = getTimingState(invoice);
            const workflow = getWorkflowState(invoice);
            const action = getNextPaymentAction(invoice);
            return (
              <div
                key={invoice.id}
                className={cn(
                  "rounded-lg border border-ink-100 p-4",
                  timing.label === "Overdue" && "border-garnet-200 bg-garnet-50/45",
                  timing.label === "Due today" && "border-citrine-200 bg-citrine-50/45"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      {invoice.invoiceNumber}
                    </p>
                  </div>
                  <StatusBadge status={getOperationalStatus(invoice)} />
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xl font-black text-ink-900">
                      {formatCurrency(invoiceBalance(invoice), invoice.currency)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink-600">{timing.detail}</p>
                  </div>
                  <TimingBadge state={timing} />
                </div>

                <div className="mt-4 rounded-lg border border-ink-100 bg-white/80 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-peacock-700">
                        Next action
                      </p>
                      <p className="mt-1 text-sm font-black text-ink-900">{action.label}</p>
                    </div>
                    <WorkflowBadge workflow={workflow} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ink-500">{getPaymentTouch(invoice)}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => runPrimaryQueueAction(invoice, action.kind, {
                    approve: onApprove,
                    schedule: onSchedule,
                    markPaid: onMarkPaid,
                    uploadProof: onUploadProof
                  })}>
                    {action.label}
                  </Button>
                  <ButtonLink href={`/invoices/${invoice.id}`} variant="secondary">
                    View
                  </ButtonLink>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function PayablesLedger({
  invoices,
  onApprove,
  onSchedule,
  onMarkPaid,
  onUploadProof,
  onHold,
  onArchive
}: {
  invoices: Invoice[];
  onApprove: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onUploadProof: (invoice: Invoice) => void;
  onHold: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [status, setStatus] = useState<InvoiceStatus | "All">("All");
  const [priority, setPriority] = useState<InvoicePriority | "All">("All");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortKey>("urgency");
  const [pendingArchive, setPendingArchive] = useState<Invoice | null>(null);

  const visibleInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return invoices
      .filter((invoice) => status === "All" || getOperationalStatus(invoice) === status)
      .filter((invoice) => priority === "All" || invoice.priority === priority)
      .filter((invoice) => matchesQuickFilter(invoice, quickFilter))
      .filter((invoice) => matchesDateRange(invoice, dateRange))
      .filter((invoice) => {
        if (!normalized) {
          return true;
        }

        return [
          invoice.invoiceNumber,
          invoice.partyName,
          invoice.category,
          invoice.paymentMethod,
          invoice.referenceNumber,
          invoice.notes,
          ...invoice.tags
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => {
        if (sort === "urgency") {
          return getPaymentScore(b) - getPaymentScore(a);
        }

        if (sort === "amount") {
          return b.amount - a.amount;
        }

        if (sort === "balance") {
          return invoiceBalance(b) - invoiceBalance(a);
        }

        if (sort === "vendor") {
          return a.partyName.localeCompare(b.partyName);
        }

        if (sort === "status") {
          return getOperationalStatus(a).localeCompare(getOperationalStatus(b));
        }

        if (sort === "workflow") {
          return getWorkflowState(a).label.localeCompare(getWorkflowState(b).label);
        }

        return compareDateOnly(a.dueDate, b.dueDate);
      });
  }, [dateRange, invoices, priority, query, quickFilter, sort, status]);

  const ledgerSummary = useMemo(() => {
    const open = visibleInvoices.filter(isInvoiceOpen);
    const overdue = open.filter((invoice) => getTimingState(invoice).label === "Overdue");
    const paidThisMonth = visibleInvoices
      .filter((invoice) => getOperationalStatus(invoice) === "Paid")
      .filter((invoice) => isSameMonthDateOnly(invoice.updatedAt, getAppTodayString()));

    return {
      count: visibleInvoices.length,
      totalValue: visibleInvoices.reduce((total, invoice) => total + invoice.amount, 0),
      outstanding: open.reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      overdue: overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      paid: paidThisMonth.reduce((total, invoice) => total + invoice.amountPaid, 0)
    };
  }, [visibleInvoices]);

  const hasFilters =
    query ||
    quickFilter !== "all" ||
    status !== "All" ||
    priority !== "All" ||
    dateRange !== "all" ||
    sort !== "urgency";

  function clearFilters() {
    setQuery("");
    setQuickFilter("all");
    setStatus("All");
    setPriority("All");
    setDateRange("all");
    setSort("urgency");
  }

  function openInvoice(invoice: Invoice) {
    router.push(`/invoices/${invoice.id}`);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, invoice: Invoice) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInvoice(invoice);
    }
  }

  function confirmArchive() {
    if (!pendingArchive) {
      return;
    }

    onArchive(pendingArchive);
    setPendingArchive(null);
  }

  function exportAging() {
    exportPayables(visibleInvoices, notify);
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-peacock-700">
              Vendor ledger
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">Payables ledger</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={clearFilters} disabled={!hasFilters}>
              <X className="size-4" />
              Clear filters
            </Button>
            <Button variant="secondary" onClick={exportAging} disabled={!visibleInvoices.length}>
              <Download className="size-4" />
              Export aging
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <LedgerSummaryMetric label="Visible records" value={String(ledgerSummary.count)} />
          <LedgerSummaryMetric label="Invoice value" value={formatCurrency(ledgerSummary.totalValue)} />
          <LedgerSummaryMetric label="Outstanding" value={formatCurrency(ledgerSummary.outstanding)} />
          <LedgerSummaryMetric label="Overdue" value={formatCurrency(ledgerSummary.overdue)} tone="garnet" />
          <LedgerSummaryMetric label="Paid this month" value={formatCurrency(ledgerSummary.paid)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
                quickFilter === item.value
                  ? "border-peacock-700 bg-peacock-700 text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
              )}
              onClick={() => setQuickFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.8fr_0.8fr]">
          <label className="relative lg:col-span-1">
            <span className="sr-only">Search payables</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search vendor, invoice, reference..."
              className="h-11 w-full rounded-lg border-ink-200 pl-10 text-sm focus:border-peacock-600 focus:ring-peacock-600"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as InvoiceStatus | "All")}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-peacock-600 focus:ring-peacock-600"
            aria-label="Filter by status"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "All statuses" : item}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as InvoicePriority | "All")}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-peacock-600 focus:ring-peacock-600"
            aria-label="Filter by priority"
          >
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "All priorities" : item}
              </option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRange)}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-peacock-600 focus:ring-peacock-600"
            aria-label="Filter by date range"
          >
            <option value="all">All due dates</option>
            <option value="due7">Due next 7 days</option>
            <option value="due30">Due next 30 days</option>
            <option value="dueMonth">Due this month</option>
            <option value="issuedMonth">Issued this month</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-peacock-600 focus:ring-peacock-600"
            aria-label="Sort payables"
          >
            <option value="urgency">Sort by payment urgency</option>
            <option value="dueDate">Sort by due date</option>
            <option value="balance">Sort by remaining balance</option>
            <option value="amount">Sort by invoice total</option>
            <option value="vendor">Sort by vendor</option>
            <option value="status">Sort by status</option>
            <option value="workflow">Sort by workflow</option>
          </select>
        </div>
      </div>

      {!visibleInvoices.length ? (
        <EmptyState
          title="No payables match these filters"
          description="Clear the filters or add a vendor bill to start planning outgoing cash."
          action={<Button onClick={clearFilters} disabled={!hasFilters}>Clear filters</Button>}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1040px] table-fixed text-left">
              <colgroup>
                <col className="w-[9.5rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9.5rem]" />
                <col className="w-[8.5rem]" />
                <col className="w-[6.25rem]" />
                <col className="w-[5.75rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink-100 bg-ink-50 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-3 py-4">Invoice</th>
                  <th className="px-3 py-4">Vendor</th>
                  <th className="px-3 py-4">Dates</th>
                  <th className="px-3 py-4 text-right">Invoice total</th>
                  <th className="px-3 py-4">Status</th>
                  <th className="px-3 py-4">Priority</th>
                  <th className="px-3 py-4">Payment state</th>
                  <th className="px-3 py-4">Workflow</th>
                  <th className="px-3 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleInvoices.map((invoice) => (
                  <PayableTableRow
                    key={invoice.id}
                    invoice={invoice}
                    onOpen={openInvoice}
                    onKeyDown={handleRowKeyDown}
                    onApprove={onApprove}
                    onSchedule={onSchedule}
                    onMarkPaid={onMarkPaid}
                    onUploadProof={onUploadProof}
                    onHold={onHold}
                    onArchive={setPendingArchive}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {visibleInvoices.map((invoice) => (
              <PayableMobileCard
                key={invoice.id}
                invoice={invoice}
                onApprove={onApprove}
                onSchedule={onSchedule}
                onMarkPaid={onMarkPaid}
                onUploadProof={onUploadProof}
                onHold={onHold}
                onArchive={setPendingArchive}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="Archive this payable?"
        description="This removes the vendor bill from the active payables ledger."
        confirmLabel="Archive payable"
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />
    </Card>
  );
}

function PayableTableRow({
  invoice,
  onOpen,
  onKeyDown,
  onApprove,
  onSchedule,
  onMarkPaid,
  onUploadProof,
  onHold,
  onArchive
}: {
  invoice: Invoice;
  onOpen: (invoice: Invoice) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, invoice: Invoice) => void;
  onApprove: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onUploadProof: (invoice: Invoice) => void;
  onHold: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
}) {
  const displayStatus = getOperationalStatus(invoice);
  const timing = getTimingState(invoice);
  const workflow = getWorkflowState(invoice);

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => onOpen(invoice)}
      onKeyDown={(event) => onKeyDown(event, invoice)}
      className={cn(
        "cursor-pointer transition hover:bg-peacock-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-peacock-600",
        timing.label === "Overdue" && "bg-garnet-50/35"
      )}
    >
      <td className="px-3 py-4 align-middle">
        <p className="truncate whitespace-nowrap font-black text-ink-900">{invoice.invoiceNumber}</p>
        <p className="mt-1 truncate text-sm text-ink-500">{invoice.referenceNumber || invoice.category}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <p className="truncate font-semibold text-ink-900">{invoice.partyName}</p>
        <p className="mt-1 truncate text-sm text-ink-500">{invoice.paymentMethod || invoice.category}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-4 align-middle text-sm">
        <p className="text-ink-500">
          Issued: <span className="font-semibold text-ink-700">{formatDate(invoice.invoiceDate)}</span>
        </p>
        <p className="mt-1 text-ink-500">
          Due: <span className="font-black text-ink-900">{formatDate(invoice.dueDate)}</span>
        </p>
      </td>
      <td className="px-3 py-4 text-right align-middle">
        <p className="whitespace-nowrap font-black text-ink-900">{formatCurrency(invoice.amount, invoice.currency)}</p>
        <p className="mt-1 text-sm leading-5 text-ink-500">{getBalanceLine(invoice).replace("Balance:", "Remaining:")}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <StatusBadge status={displayStatus} />
        <p className="mt-1 text-xs font-semibold text-ink-500">{getStatusMeaning(invoice)}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <PriorityBadge priority={invoice.priority} />
      </td>
      <td className="px-3 py-4 align-middle">
        <TimingBadge state={timing} />
        <p className="mt-1 text-xs font-semibold text-ink-500">{getPaymentStateLabel(invoice)}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <p className="text-sm font-black text-ink-900">{getNextPaymentAction(invoice).label}</p>
        <p className="mt-1 text-xs font-semibold text-ink-500">{workflow.label}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <div className="flex justify-end gap-1" onClick={stopEvent}>
          <Link
            href={`/invoices/${invoice.id}`}
            aria-label={`View ${invoice.invoiceNumber}`}
            title={`View ${invoice.invoiceNumber}`}
            className="flex size-9 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-white hover:text-ink-900"
          >
            <Eye className="size-4" />
          </Link>
          <PayableActionMenu
            invoice={invoice}
            onApprove={onApprove}
            onSchedule={onSchedule}
            onMarkPaid={onMarkPaid}
            onUploadProof={onUploadProof}
            onHold={onHold}
            onArchive={onArchive}
          />
        </div>
      </td>
    </tr>
  );
}

function PayableMobileCard({
  invoice,
  onApprove,
  onSchedule,
  onMarkPaid,
  onUploadProof,
  onHold,
  onArchive
}: {
  invoice: Invoice;
  onApprove: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onUploadProof: (invoice: Invoice) => void;
  onHold: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
}) {
  const displayStatus = getOperationalStatus(invoice);
  const timing = getTimingState(invoice);
  const workflow = getWorkflowState(invoice);
  const paid = percentage(invoice.amountPaid, invoice.amount);

  return (
    <article
      className={cn(
        "rounded-lg border border-ink-200 p-4 transition hover:border-peacock-200",
        timing.label === "Overdue" && "border-garnet-200 bg-garnet-50/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link href={`/invoices/${invoice.id}`} className="min-w-0">
          <span className="inline-flex min-h-9 items-center font-black text-ink-900">
            {invoice.invoiceNumber}
          </span>
          <span className="block truncate text-sm font-semibold text-ink-700">{invoice.partyName}</span>
        </Link>
        <StatusBadge status={displayStatus} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={invoice.priority} />
        <TimingBadge state={timing} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileField label="Invoice total" value={formatCurrency(invoice.amount, invoice.currency)} />
        <MobileField label="Remaining" value={formatCurrency(invoiceBalance(invoice), invoice.currency)} />
        <MobileField label="Due" value={formatDate(invoice.dueDate)} strong />
        <MobileField label="Workflow" value={workflow.label} />
        <MobileField label="Payment method" value={invoice.paymentMethod || "Not set"} />
        <MobileField label="Next action" value={getNextPaymentAction(invoice).label} />
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs font-semibold text-ink-500">
          <span>{invoiceBalance(invoice) <= 0 ? "Paid in full" : "Payment progress"}</span>
          <span>{paid}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-peacock-600" style={{ width: `${Math.min(100, Math.max(0, paid))}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={`/invoices/${invoice.id}`}
          className="flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700"
        >
          View detail
        </Link>
        <PayableActionMenu
          invoice={invoice}
          onApprove={onApprove}
          onSchedule={onSchedule}
          onMarkPaid={onMarkPaid}
          onUploadProof={onUploadProof}
          onHold={onHold}
          onArchive={onArchive}
          align="right"
        />
      </div>
    </article>
  );
}

function PayableActionMenu({
  invoice,
  onApprove,
  onSchedule,
  onMarkPaid,
  onUploadProof,
  onHold,
  onArchive,
  align = "left"
}: {
  invoice: Invoice;
  onApprove: (invoice: Invoice) => void;
  onSchedule: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onUploadProof: (invoice: Invoice) => void;
  onHold: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
  align?: "left" | "right";
}) {
  const open = isInvoiceOpen(invoice);
  const workflow = getWorkflowState(invoice);
  const payableCanBePaid = canPayInvoice(invoice);
  const needsApproval = workflow.kind === "approval";

  return (
    <details className="group relative" onClick={stopEvent}>
      <summary
        aria-label={`More payment actions for ${invoice.invoiceNumber}`}
        title={`More payment actions for ${invoice.invoiceNumber}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-white hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div
        className={cn(
          "absolute z-30 mt-2 w-64 rounded-lg border border-ink-200 bg-white p-1.5 text-sm shadow-luxury",
          align === "right" ? "right-0" : "right-0"
        )}
      >
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Eye className="size-4" />}>
          View
        </MenuLink>
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Pencil className="size-4" />}>
          Edit
        </MenuLink>
        {open && needsApproval ? (
          <MenuButton onClick={() => onApprove(invoice)} icon={<ShieldCheck className="size-4" />}>
            Approve for payment
          </MenuButton>
        ) : null}
        {payableCanBePaid ? (
          <MenuButton onClick={() => onSchedule(invoice)} icon={<CalendarClock className="size-4" />}>
            Schedule payment
          </MenuButton>
        ) : null}
        {payableCanBePaid ? (
          <MenuButton onClick={() => onMarkPaid(invoice)} icon={<CheckCircle2 className="size-4" />}>
            Mark as paid
          </MenuButton>
        ) : null}
        {open || getOperationalStatus(invoice) === "Paid" ? (
          <MenuButton onClick={() => onUploadProof(invoice)} icon={<Upload className="size-4" />}>
            Upload payment proof
          </MenuButton>
        ) : null}
        {open ? (
          <MenuButton onClick={() => onHold(invoice)} icon={<PauseCircle className="size-4" />}>
            Put on hold
          </MenuButton>
        ) : null}
        <div className="my-1 border-t border-ink-100" />
        <MenuButton danger onClick={() => onArchive(invoice)} icon={<Trash2 className="size-4" />}>
          Archive
        </MenuButton>
      </div>
    </details>
  );
}

function PayablesPanel({
  activeTab,
  onTabChange,
  overdue,
  dueSoon,
  paid
}: {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  overdue: Invoice[];
  dueSoon: Invoice[];
  paid: Invoice[];
}) {
  const tabs: Array<{ label: string; value: PanelTab; invoices: Invoice[] }> = [
    { label: "Overdue", value: "overdue", invoices: overdue },
    { label: "Due soon", value: "dueSoon", invoices: dueSoon },
    { label: "Recently paid", value: "paid", invoices: paid }
  ];
  const active = tabs.find((tab) => tab.value === activeTab) ?? tabs[0];

  return (
    <SectionCard title="Payment snapshot" eyebrow="Focused lists">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={cn(
              "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
              activeTab === tab.value
                ? "border-peacock-700 bg-peacock-700 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            )}
            onClick={() => onTabChange(tab.value)}
          >
            {tab.label}
            <span className="ml-2 opacity-80">{tab.invoices.length}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {active.invoices.length ? (
          active.invoices.slice(0, 6).map((invoice) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="rounded-lg border border-ink-100 p-4 transition hover:border-peacock-200 hover:bg-peacock-50/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                    {invoice.invoiceNumber}
                  </p>
                </div>
                <TimingBadge state={getTimingState(invoice)} />
              </div>
              <p className="mt-4 text-lg font-black text-ink-900">
                {formatCurrency(invoiceBalance(invoice) || invoice.amountPaid, invoice.currency)}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-600">{getPaymentStateLabel(invoice)}</p>
            </Link>
          ))
        ) : (
          <p className="text-sm leading-6 text-ink-500">No payables in this list right now.</p>
        )}
      </div>
    </SectionCard>
  );
}

function LedgerSummaryMetric({
  label,
  value,
  tone = "ink"
}: {
  label: string;
  value: string;
  tone?: "ink" | "garnet";
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/55 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className={cn("mt-1 text-sm font-black", tone === "garnet" ? "text-garnet-700" : "text-ink-900")}>
        {value}
      </p>
    </div>
  );
}

function TimingBadge({ state }: { state: ReturnType<typeof getTimingState> }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold",
        state.tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        state.tone === "citrine" && "border-citrine-200 bg-citrine-50 text-citrine-800",
        state.tone === "garnet" && "border-garnet-200 bg-garnet-50 text-garnet-700",
        state.tone === "peacock" && "border-peacock-200 bg-peacock-50 text-peacock-700",
        state.tone === "violet" && "border-violet-200 bg-violet-50 text-violet-700",
        state.tone === "neutral" && "border-ink-200 bg-ink-50 text-ink-600"
      )}
    >
      {state.label}
    </span>
  );
}

function WorkflowBadge({ workflow }: { workflow: ReturnType<typeof getWorkflowState> }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-bold",
        workflow.kind === "approval" && "border-citrine-200 bg-citrine-50 text-citrine-800",
        workflow.kind === "scheduled" && "border-peacock-200 bg-peacock-50 text-peacock-700",
        workflow.kind === "payment" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        workflow.kind === "proof" && "border-violet-200 bg-violet-50 text-violet-700",
        workflow.kind === "hold" && "border-ink-200 bg-ink-50 text-ink-600",
        workflow.kind === "monitor" && "border-ink-200 bg-white text-ink-600",
        workflow.kind === "closed" && "border-emerald-200 bg-emerald-50 text-emerald-700"
      )}
    >
      {workflow.label}
    </span>
  );
}

function MobileField({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-ink-500">{label}</p>
      <p className={cn("mt-1 font-bold", strong ? "text-ink-950" : "text-ink-900")}>{value}</p>
    </div>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold text-ink-700 transition hover:bg-ink-50"
    >
      {icon}
      {children}
    </Link>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  danger = false
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left font-semibold transition hover:bg-ink-50",
        danger ? "text-garnet-700 hover:bg-garnet-50" : "text-ink-700"
      )}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function getTimingState(invoice: Invoice): { label: string; detail: string; tone: TimingTone } {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return { label: "Paid", detail: `Paid ${formatDate(invoice.updatedAt)}`, tone: "emerald" };
  }

  if (status === "Cancelled") {
    return { label: "Cancelled", detail: "Closed payable", tone: "neutral" };
  }

  if (status === "Draft") {
    return { label: "Current", detail: "Draft pending review", tone: "neutral" };
  }

  const days = daysUntil(invoice.dueDate);

  if (days < 0) {
    return {
      label: "Overdue",
      detail: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`,
      tone: "garnet"
    };
  }

  if (days === 0) {
    return { label: "Due today", detail: "Due today", tone: "citrine" };
  }

  if (days <= 7) {
    return {
      label: "Due soon",
      detail: `${days} day${days === 1 ? "" : "s"} remaining`,
      tone: "citrine"
    };
  }

  return {
    label: "Current",
    detail: `${days} day${days === 1 ? "" : "s"} remaining`,
    tone: "peacock"
  };
}

function getWorkflowState(invoice: Invoice): { label: string; kind: WorkflowKind } {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return { label: "Proof archived", kind: "closed" };
  }

  if (status === "Cancelled") {
    return { label: "Closed", kind: "hold" };
  }

  if (status === "Draft") {
    return { label: "Needs approval", kind: "approval" };
  }

  if (invoice.tags.some((tag) => tag.toLowerCase().includes("hold"))) {
    return { label: "On hold", kind: "hold" };
  }

  if (invoice.status === "Partially Paid") {
    return { label: "Ready to complete", kind: "payment" };
  }

  const days = daysUntil(invoice.dueDate);

  if (days < 0) {
    return { label: "Urgent payment", kind: "payment" };
  }

  if (invoice.priority === "Critical" || invoice.amount >= 10000) {
    return { label: "Needs approval", kind: "approval" };
  }

  if (invoice.reminderDate && days >= 0) {
    return { label: "Scheduled", kind: "scheduled" };
  }

  if (invoice.recurring) {
    return { label: "Recurring bill", kind: "scheduled" };
  }

  return { label: "Ready to pay", kind: "payment" };
}

function getNextPaymentAction(invoice: Invoice): { label: string; kind: WorkflowKind } {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return { label: "Upload proof", kind: "proof" };
  }

  if (status === "Cancelled") {
    return { label: "Review record", kind: "monitor" };
  }

  if (status === "Draft") {
    return { label: "Approve bill", kind: "approval" };
  }

  const workflow = getWorkflowState(invoice);
  const timing = getTimingState(invoice);

  if (workflow.kind === "approval") {
    return { label: "Approve bill", kind: "approval" };
  }

  if (timing.label === "Overdue" || timing.label === "Due today") {
    return { label: "Mark as paid", kind: "payment" };
  }

  if (workflow.kind === "scheduled") {
    return { label: "Upload proof", kind: "proof" };
  }

  return { label: "Schedule payment", kind: "scheduled" };
}

function getPaymentStateLabel(invoice: Invoice) {
  const workflow = getWorkflowState(invoice);

  if (workflow.kind === "scheduled" && invoice.reminderDate) {
    return `Scheduled ${formatDate(invoice.reminderDate)}`;
  }

  return getTimingState(invoice).detail;
}

function getStatusMeaning(invoice: Invoice) {
  const status = getOperationalStatus(invoice);

  if (status === "Pending") {
    return "Pending payment";
  }

  if (status === "Due Soon") {
    return "Needs scheduling";
  }

  if (status === "Overdue") {
    return "Past vendor terms";
  }

  if (status === "Partially Paid") {
    return "Partial disbursement";
  }

  if (status === "Paid") {
    return "Settled";
  }

  if (status === "Draft") {
    return "Needs approval";
  }

  return "Closed";
}

function getPaymentTouch(invoice: Invoice) {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return `Paid | ${formatDate(invoice.updatedAt)}`;
  }

  if (status === "Cancelled") {
    return `Closed | ${formatDate(invoice.updatedAt)}`;
  }

  const activity = mockActivity
    .filter((item) => item.invoiceId === invoice.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (activity) {
    return `${activity.title} | ${formatDate(activity.createdAt)}`;
  }

  if (invoice.reminderDate) {
    return `Payment reminder | ${formatDate(invoice.reminderDate)}`;
  }

  return invoice.paymentMethod ? `${invoice.paymentMethod} | not scheduled` : "No payment method set";
}

function getPaymentScore(invoice: Invoice) {
  if (!isInvoiceOpen(invoice)) {
    return -1;
  }

  const days = daysUntil(invoice.dueDate);
  const overdueWeight = days < 0 ? Math.abs(days) * 520 : Math.max(0, 10 - days) * 95;
  const amountWeight = Math.min(invoiceBalance(invoice) / 55, 900);
  const workflow = getWorkflowState(invoice);
  const workflowWeight =
    workflow.kind === "approval" ? 300 : workflow.kind === "scheduled" ? 160 : workflow.kind === "payment" ? 220 : 0;

  return overdueWeight + amountWeight + priorityScore[invoice.priority] + workflowWeight;
}

function isPaymentQueueCandidate(invoice: Invoice) {
  if (!isInvoiceOpen(invoice)) {
    return false;
  }

  const days = daysUntil(invoice.dueDate);
  const workflow = getWorkflowState(invoice);

  return (
    days <= 10 ||
    invoice.priority === "Critical" ||
    invoiceBalance(invoice) >= 10000 ||
    workflow.kind === "approval" ||
    workflow.kind === "scheduled" ||
    invoice.status === "Partially Paid"
  );
}

function canPayInvoice(invoice: Invoice) {
  return isInvoiceOpen(invoice) && invoiceBalance(invoice) > 0;
}

function matchesQuickFilter(invoice: Invoice, quickFilter: QuickFilter) {
  const status = getOperationalStatus(invoice);
  const timing = getTimingState(invoice);
  const workflow = getWorkflowState(invoice);

  if (quickFilter === "open") {
    return isInvoiceOpen(invoice);
  }

  if (quickFilter === "overdue") {
    return isInvoiceOpen(invoice) && timing.label === "Overdue";
  }

  if (quickFilter === "dueSoon") {
    return isInvoiceOpen(invoice) && ["Due soon", "Due today"].includes(timing.label);
  }

  if (quickFilter === "paid") {
    return status === "Paid";
  }

  if (quickFilter === "scheduled") {
    return workflow.kind === "scheduled";
  }

  if (quickFilter === "approval") {
    return workflow.kind === "approval";
  }

  if (quickFilter === "critical") {
    return invoice.priority === "Critical";
  }

  return true;
}

function matchesDateRange(invoice: Invoice, dateRange: DateRange) {
  const days = daysUntil(invoice.dueDate);

  if (dateRange === "due7") {
    return isInvoiceOpen(invoice) && days >= 0 && days <= 7;
  }

  if (dateRange === "due30") {
    return isInvoiceOpen(invoice) && days >= 0 && days <= 30;
  }

  if (dateRange === "dueMonth") {
    return isSameMonthDateOnly(invoice.dueDate, getAppTodayString());
  }

  if (dateRange === "issuedMonth") {
    return isSameMonthDateOnly(invoice.invoiceDate, getAppTodayString());
  }

  return true;
}

function runPrimaryQueueAction(
  invoice: Invoice,
  kind: WorkflowKind,
  actions: {
    approve: (invoice: Invoice) => void;
    schedule: (invoice: Invoice) => void;
    markPaid: (invoice: Invoice) => void;
    uploadProof: (invoice: Invoice) => void;
  }
) {
  if (kind === "approval") {
    actions.approve(invoice);
    return;
  }

  if (kind === "payment") {
    actions.markPaid(invoice);
    return;
  }

  if (kind === "proof") {
    actions.uploadProof(invoice);
    return;
  }

  actions.schedule(invoice);
}

function exportPayables(
  invoices: Invoice[],
  notify: (toast: { title: string; description?: string; variant: "success" | "warning" | "info" }) => void
) {
  const rows = invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    vendor: invoice.partyName,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    invoiceTotal: invoice.amount,
    amountPaid: invoice.amountPaid,
    balanceRemaining: invoice.balanceRemaining,
    status: getOperationalStatus(invoice),
    timing: getTimingState(invoice).label,
    paymentState: getPaymentStateLabel(invoice),
    workflow: getWorkflowState(invoice).label,
    priority: invoice.priority,
    paymentMethod: invoice.paymentMethod,
    nextAction: getNextPaymentAction(invoice).label
  }));

  const headers = Object.keys(rows[0] ?? { invoiceNumber: "", vendor: "" });
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header as keyof typeof row] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
  ].join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "payables-aging-export.csv";
  link.click();
  URL.revokeObjectURL(url);

  notify({
    title: "Payables export ready",
    description: `${invoices.length} payable${invoices.length === 1 ? "" : "s"} exported.`,
    variant: "success"
  });
}

function agingBucketFrame(label: string) {
  if (label === "Current") {
    return "border-emerald-100 bg-emerald-50/45";
  }

  if (label === "1-15 days") {
    return "border-citrine-100 bg-citrine-50/55";
  }

  if (label === "16-30 days") {
    return "border-garnet-100 bg-garnet-50/35";
  }

  return "border-garnet-200 bg-garnet-50/60";
}

function agingBucketBar(label: string) {
  if (label === "Current") {
    return "bg-emerald-600";
  }

  if (label === "1-15 days") {
    return "bg-citrine-500";
  }

  if (label === "16-30 days") {
    return "bg-garnet-500";
  }

  return "bg-garnet-700";
}

function stopEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}
