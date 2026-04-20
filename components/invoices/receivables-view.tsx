"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  Landmark,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
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
  canReceivePayment,
  getAgingLabel,
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
  { label: "Partially paid", value: "partial" },
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
  Critical: 400,
  High: 250,
  Medium: 100,
  Low: 0
};

type QuickFilter = (typeof quickFilters)[number]["value"];
type DateRange = "all" | "due7" | "due30" | "issuedMonth";
type SortKey = "urgency" | "dueDate" | "amount" | "balance" | "customer" | "status";
type PanelTab = "overdue" | "dueSoon" | "paid";

export function ReceivablesView() {
  const { invoices, markAsPaid, deleteInvoice } = useInvoices();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<PanelTab>("overdue");

  const data = useMemo(() => {
    const receivables = invoices.filter((invoice) => invoice.type === "receivable");
    const open = receivables.filter(isInvoiceOpen);
    const overdue = open.filter((invoice) => daysUntil(invoice.dueDate) < 0);
    const dueSoon = open.filter((invoice) => {
      const days = daysUntil(invoice.dueDate);
      return days >= 0 && days <= 7;
    });
    const paidThisMonth = receivables
      .filter((invoice) => getOperationalStatus(invoice) === "Paid")
      .filter((invoice) => isSameMonthDateOnly(invoice.updatedAt, getAppTodayString()));
    const totalOpen = open.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const overdueAmount = overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const dueSoonAmount = dueSoon.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const collectedThisMonth = paidThisMonth.reduce((total, invoice) => total + invoice.amountPaid, 0);
    const aging = getAgingBuckets(receivables, "receivable");
    const queue = receivables
      .filter((invoice) => canReceivePayment(invoice))
      .filter((invoice) => invoice.status !== "Draft")
      .filter(isQueueCandidate)
      .sort((a, b) => getCollectionScore(b) - getCollectionScore(a))
      .slice(0, 5);

    return {
      receivables,
      open,
      overdue,
      overdueAmount,
      dueSoon,
      dueSoonAmount,
      paidThisMonth,
      totalOpen,
      collectedThisMonth,
      aging,
      queue
    };
  }, [invoices]);

  function sendReminder(invoice: Invoice) {
    notify({
      title: "Reminder queued",
      description: `${invoice.invoiceNumber} reminder is ready for ${invoice.partyName}.`,
      variant: "info"
    });
  }

  function recordPayment(invoice: Invoice) {
    if (!canReceivePayment(invoice)) {
      return;
    }

    markAsPaid(invoice.id);
    notify({
      title: "Payment recorded",
      description: `${invoice.invoiceNumber} is now paid in full.`,
      variant: "success"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Collections control"
        title="Receivables"
        description="Prioritize customer balances, aging risk, follow-ups, and collection activity from one focused workspace."
        action={
          <>
            <Button variant="secondary" onClick={() => exportReceivables(data.receivables, notify)}>
              <Download className="size-4" />
              Export receivables
            </Button>
            <ButtonLink href="/invoices/new?type=receivable">
              Add receivable
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open receivables"
          value={formatCurrency(data.totalOpen)}
          detail={`${data.open.length} active customer invoice${data.open.length === 1 ? "" : "s"}`}
          icon={<Landmark className="size-5" />}
          tone="emerald"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(data.overdueAmount)}
          detail={`${data.overdue.length} invoice${data.overdue.length === 1 ? "" : "s"} past deadline`}
          icon={<AlertTriangle className="size-5" />}
          tone="garnet"
        />
        <StatCard
          label="Due soon"
          value={formatCurrency(data.dueSoonAmount)}
          detail={`${data.dueSoon.length} invoice${data.dueSoon.length === 1 ? "" : "s"} due in 7 days`}
          icon={<CalendarClock className="size-5" />}
          tone="citrine"
        />
        <StatCard
          label="Collected this month"
          value={formatCurrency(data.collectedThisMonth)}
          detail={`${data.paidThisMonth.length} invoice${data.paidThisMonth.length === 1 ? "" : "s"} settled`}
          icon={<CheckCircle2 className="size-5" />}
          tone="ink"
        />
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <AgingOverview buckets={data.aging} totalOpen={data.totalOpen} overdueAmount={data.overdueAmount} />
        <CollectionQueue invoices={data.queue} onReminder={sendReminder} onRecordPayment={recordPayment} />
      </section>

      <section className="mt-4">
        <ReceivablesLedger
          invoices={data.receivables}
          onReminder={sendReminder}
          onRecordPayment={recordPayment}
          onArchive={(invoice) => {
            deleteInvoice(invoice.id);
            notify({
              title: "Receivable archived",
              description: `${invoice.invoiceNumber} was removed from the active ledger.`,
              variant: "warning"
            });
          }}
        />
      </section>

      <section className="mt-4">
        <CollectionsPanel
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

function AgingOverview({
  buckets,
  totalOpen,
  overdueAmount
}: {
  buckets: Array<{ label: string; amount: number; count: number }>;
  totalOpen: number;
  overdueAmount: number;
}) {
  const overdueRatio = totalOpen > 0 ? Math.round((overdueAmount / totalOpen) * 100) : 0;

  return (
    <SectionCard
      title="Aging overview"
      eyebrow="Collection risk"
      action={
        <p className="text-sm font-semibold text-ink-500">
          {overdueRatio}% overdue
        </p>
      }
    >
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
                    {bucket.count} invoice{bucket.count === 1 ? "" : "s"} | {share}% of open AR
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

function CollectionQueue({
  invoices,
  onReminder,
  onRecordPayment
}: {
  invoices: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
}) {
  return (
    <SectionCard title="Collection queue" eyebrow="Next best actions">
      {!invoices.length ? (
        <p className="text-sm leading-6 text-ink-500">No customer balances need immediate follow-up.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {invoices.map((invoice) => {
            const action = getNextAction(invoice);
            return (
              <div
                key={invoice.id}
                className={cn(
                  "rounded-lg border border-ink-100 p-4",
                  getOperationalStatus(invoice) === "Overdue" && "border-garnet-200 bg-garnet-50/45"
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
                    <p className="mt-1 text-sm font-semibold text-ink-600">{getAgingLabel(invoice)}</p>
                  </div>
                  <PriorityBadge priority={invoice.priority} />
                </div>

                <div className="mt-4 rounded-lg border border-ink-100 bg-white/80 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                    Next action
                  </p>
                  <p className="mt-1 text-sm font-black text-ink-900">{action.label}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-500">{getLastTouch(invoice)}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {action.kind === "payment" ? (
                    <Button variant="secondary" onClick={() => onRecordPayment(invoice)}>
                      Record payment
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => onReminder(invoice)}>
                      <Send className="size-4" />
                      Reminder
                    </Button>
                  )}
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

function ReceivablesLedger({
  invoices,
  onReminder,
  onRecordPayment,
  onArchive
}: {
  invoices: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
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
          return getCollectionScore(b) - getCollectionScore(a);
        }

        if (sort === "amount") {
          return b.amount - a.amount;
        }

        if (sort === "balance") {
          return invoiceBalance(b) - invoiceBalance(a);
        }

        if (sort === "customer") {
          return a.partyName.localeCompare(b.partyName);
        }

        if (sort === "status") {
          return getOperationalStatus(a).localeCompare(getOperationalStatus(b));
        }

        return compareDateOnly(a.dueDate, b.dueDate);
      });
  }, [dateRange, invoices, priority, query, quickFilter, sort, status]);

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
    exportReceivables(visibleInvoices, notify);
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Customer ledger
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">Receivables ledger</h2>
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

        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
                quickFilter === item.value
                  ? "border-emerald-700 bg-emerald-700 text-white"
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
            <span className="sr-only">Search receivables</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer, invoice, reference..."
              className="h-11 w-full rounded-lg border-ink-200 pl-10 text-sm focus:border-emerald-600 focus:ring-emerald-600"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as InvoiceStatus | "All")}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
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
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
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
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
            aria-label="Filter by date range"
          >
            <option value="all">All due dates</option>
            <option value="due7">Due next 7 days</option>
            <option value="due30">Due next 30 days</option>
            <option value="issuedMonth">Issued this month</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
            aria-label="Sort receivables"
          >
            <option value="urgency">Sort by collection urgency</option>
            <option value="dueDate">Sort by due date</option>
            <option value="balance">Sort by remaining balance</option>
            <option value="amount">Sort by invoice total</option>
            <option value="customer">Sort by customer</option>
            <option value="status">Sort by status</option>
          </select>
        </div>

        <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
          <SlidersHorizontal className="size-4" />
          Showing {visibleInvoices.length} of {invoices.length} receivables
        </p>
      </div>

      {!visibleInvoices.length ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            title="No receivables match these filters"
            description="Clear filters or add a receivable to build the collection ledger."
            href="/invoices/new?type=receivable"
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[9.5rem]" />
                <col className="w-[8.5rem]" />
                <col className="w-[9.5rem]" />
                <col className="w-[8.5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[5.75rem]" />
                <col className="w-[6rem]" />
                <col className="w-[7rem]" />
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink-100 bg-ink-50 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-3 py-4">Invoice</th>
                  <th className="px-3 py-4">Customer</th>
                  <th className="px-3 py-4">Dates</th>
                  <th className="px-3 py-4 text-right">Invoice total</th>
                  <th className="px-3 py-4">Status</th>
                  <th className="px-3 py-4">Priority</th>
                  <th className="px-3 py-4">Aging</th>
                  <th className="px-3 py-4">Next action</th>
                  <th className="px-3 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleInvoices.map((invoice) => (
                  <ReceivableTableRow
                    key={invoice.id}
                    invoice={invoice}
                    onOpen={openInvoice}
                    onKeyDown={handleRowKeyDown}
                    onReminder={onReminder}
                    onRecordPayment={onRecordPayment}
                    onArchive={setPendingArchive}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {visibleInvoices.map((invoice) => (
              <ReceivableMobileCard
                key={invoice.id}
                invoice={invoice}
                onReminder={onReminder}
                onRecordPayment={onRecordPayment}
                onArchive={setPendingArchive}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="Archive this receivable?"
        description="This removes the customer invoice from the active receivables ledger."
        confirmLabel="Archive receivable"
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />
    </Card>
  );
}

function ReceivableTableRow({
  invoice,
  onOpen,
  onKeyDown,
  onReminder,
  onRecordPayment,
  onArchive
}: {
  invoice: Invoice;
  onOpen: (invoice: Invoice) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, invoice: Invoice) => void;
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
}) {
  const displayStatus = getOperationalStatus(invoice);
  const action = getNextAction(invoice);

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => onOpen(invoice)}
      onKeyDown={(event) => onKeyDown(event, invoice)}
      className={cn(
        "cursor-pointer transition hover:bg-emerald-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-600",
        displayStatus === "Overdue" && "bg-garnet-50/35"
      )}
    >
      <td className="px-3 py-4 align-middle">
        <p className="truncate whitespace-nowrap font-black text-ink-900">{invoice.invoiceNumber}</p>
        <p className="mt-1 truncate text-sm text-ink-500">{invoice.referenceNumber || invoice.category}</p>
      </td>
      <td className="px-3 py-4 align-middle">
        <p className="truncate font-semibold text-ink-900">{invoice.partyName}</p>
        <p className="mt-1 truncate text-sm text-ink-500">{invoice.category}</p>
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
      </td>
      <td className="px-3 py-4 align-middle">
        <PriorityBadge priority={invoice.priority} />
      </td>
      <td className="px-3 py-4 align-middle text-sm font-semibold text-ink-700">{getAgingLabel(invoice)}</td>
      <td className="px-3 py-4 align-middle">
        <p className="text-sm font-black text-ink-900">{action.label}</p>
        <p className="mt-1 text-xs font-semibold text-ink-500">{getLastTouch(invoice)}</p>
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
          <ReceivableActionMenu
            invoice={invoice}
            onReminder={onReminder}
            onRecordPayment={onRecordPayment}
            onArchive={onArchive}
          />
        </div>
      </td>
    </tr>
  );
}

function ReceivableMobileCard({
  invoice,
  onReminder,
  onRecordPayment,
  onArchive
}: {
  invoice: Invoice;
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
}) {
  const displayStatus = getOperationalStatus(invoice);
  const paid = percentage(invoice.amountPaid, invoice.amount);

  return (
    <article
      className={cn(
        "rounded-lg border border-ink-200 p-4 transition hover:border-emerald-200",
        displayStatus === "Overdue" && "border-garnet-200 bg-garnet-50/50"
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
        <span className="text-sm font-semibold text-ink-600">Aging: {getAgingLabel(invoice)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileField label="Invoice total" value={formatCurrency(invoice.amount, invoice.currency)} />
        <MobileField label="Remaining" value={formatCurrency(invoiceBalance(invoice), invoice.currency)} />
        <MobileField label="Due" value={formatDate(invoice.dueDate)} strong />
        <MobileField label="Next action" value={getNextAction(invoice).label} />
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs font-semibold text-ink-500">
          <span>{invoiceBalance(invoice) <= 0 ? "Paid in full" : "Collection progress"}</span>
          <span>{paid}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, Math.max(0, paid))}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={`/invoices/${invoice.id}`}
          className="flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700"
        >
          View detail
        </Link>
        <ReceivableActionMenu
          invoice={invoice}
          onReminder={onReminder}
          onRecordPayment={onRecordPayment}
          onArchive={onArchive}
          align="right"
        />
      </div>
    </article>
  );
}

function ReceivableActionMenu({
  invoice,
  onReminder,
  onRecordPayment,
  onArchive,
  align = "left"
}: {
  invoice: Invoice;
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
  align?: "left" | "right";
}) {
  const canPay = canReceivePayment(invoice);
  const open = isInvoiceOpen(invoice);

  return (
    <details className="group relative" onClick={stopEvent}>
      <summary
        aria-label={`More collection actions for ${invoice.invoiceNumber}`}
        title={`More collection actions for ${invoice.invoiceNumber}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-white hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div
        className={cn(
          "absolute z-30 mt-2 w-60 rounded-lg border border-ink-200 bg-white p-1.5 text-sm shadow-luxury",
          align === "right" ? "right-0" : "right-0"
        )}
      >
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Eye className="size-4" />}>
          View
        </MenuLink>
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Pencil className="size-4" />}>
          Edit
        </MenuLink>
        {canPay ? (
          <MenuButton onClick={() => onRecordPayment(invoice)} icon={<CheckCircle2 className="size-4" />}>
            Record payment
          </MenuButton>
        ) : null}
        {canPay ? (
          <MenuLink href={`/invoices/${invoice.id}`} icon={<CreditCard className="size-4" />}>
            Record partial payment
          </MenuLink>
        ) : null}
        {open ? (
          <MenuButton onClick={() => onReminder(invoice)} icon={<Send className="size-4" />}>
            Send reminder
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

function CollectionsPanel({
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
    <SectionCard title="Collections snapshot" eyebrow="Focused lists">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={cn(
              "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
              activeTab === tab.value
                ? "border-emerald-700 bg-emerald-700 text-white"
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
              className="rounded-lg border border-ink-100 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/35"
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
              <p className="mt-4 text-lg font-black text-ink-900">
                {formatCurrency(invoiceBalance(invoice) || invoice.amountPaid, invoice.currency)}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-600">{getAgingLabel(invoice)}</p>
            </Link>
          ))
        ) : (
          <p className="text-sm leading-6 text-ink-500">No receivables in this list right now.</p>
        )}
      </div>
    </SectionCard>
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

function getCollectionScore(invoice: Invoice) {
  if (!isInvoiceOpen(invoice) || invoice.status === "Draft") {
    return -1;
  }

  const days = daysUntil(invoice.dueDate);
  const overdueWeight = days < 0 ? Math.abs(days) * 500 : Math.max(0, 7 - days) * 80;
  const amountWeight = Math.min(invoiceBalance(invoice) / 50, 900);
  const statusWeight = invoice.status === "Partially Paid" ? 260 : 0;

  return overdueWeight + amountWeight + priorityScore[invoice.priority] + statusWeight;
}

function isQueueCandidate(invoice: Invoice) {
  const days = daysUntil(invoice.dueDate);

  return (
    days <= 7 ||
    invoice.status === "Partially Paid" ||
    invoice.priority === "Critical" ||
    invoiceBalance(invoice) >= 15000
  );
}

function getNextAction(invoice: Invoice) {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return { label: "Settled", kind: "closed" as const };
  }

  if (status === "Cancelled") {
    return { label: "No action needed", kind: "closed" as const };
  }

  if (status === "Draft") {
    return { label: "Review draft", kind: "followUp" as const };
  }

  const days = daysUntil(invoice.dueDate);

  if (status === "Partially Paid") {
    return { label: "Record payment", kind: "payment" as const };
  }

  if (days < -15) {
    return { label: "Call customer", kind: "followUp" as const };
  }

  if (days < 0) {
    return { label: "Send reminder", kind: "followUp" as const };
  }

  if (days === 0) {
    return { label: "Confirm payment", kind: "followUp" as const };
  }

  if (days <= 7) {
    return { label: "Await confirmation", kind: "followUp" as const };
  }

  return { label: "Monitor balance", kind: "followUp" as const };
}

function getLastTouch(invoice: Invoice) {
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
    return `Reminder scheduled | ${formatDate(invoice.reminderDate)}`;
  }

  return "No reminder sent";
}

function matchesQuickFilter(invoice: Invoice, quickFilter: QuickFilter) {
  const status = getOperationalStatus(invoice);
  const days = daysUntil(invoice.dueDate);

  if (quickFilter === "open") {
    return isInvoiceOpen(invoice);
  }

  if (quickFilter === "overdue") {
    return isInvoiceOpen(invoice) && days < 0;
  }

  if (quickFilter === "dueSoon") {
    return isInvoiceOpen(invoice) && days >= 0 && days <= 7;
  }

  if (quickFilter === "paid") {
    return status === "Paid";
  }

  if (quickFilter === "partial") {
    return status === "Partially Paid";
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

  if (dateRange === "issuedMonth") {
    return isSameMonthDateOnly(invoice.invoiceDate, getAppTodayString());
  }

  return true;
}

function exportReceivables(
  invoices: Invoice[],
  notify: (toast: { title: string; description?: string; variant: "success" | "warning" | "info" }) => void
) {
  const rows = invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    customer: invoice.partyName,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    invoiceTotal: invoice.amount,
    amountPaid: invoice.amountPaid,
    balanceRemaining: invoice.balanceRemaining,
    status: getOperationalStatus(invoice),
    aging: getAgingLabel(invoice),
    priority: invoice.priority,
    nextAction: getNextAction(invoice).label,
    lastTouch: getLastTouch(invoice)
  }));

  const headers = Object.keys(rows[0] ?? { invoiceNumber: "", customer: "" });
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
  link.download = "receivables-aging-export.csv";
  link.click();
  URL.revokeObjectURL(url);

  notify({
    title: "Receivables export ready",
    description: `${invoices.length} receivable${invoices.length === 1 ? "" : "s"} exported.`,
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
