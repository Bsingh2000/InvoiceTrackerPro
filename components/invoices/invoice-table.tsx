"use client";

import {
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
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
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { PriorityBadge } from "@/components/invoices/priority-badge";
import { StatusBadge } from "@/components/invoices/status-badge";
import { TypeBadge } from "@/components/invoices/type-badge";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
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
  getOperationalStatus,
  getPartyLabel
} from "@/lib/invoice-helpers";
import type { Invoice, InvoicePriority, InvoiceStatus, InvoiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const quickFilters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Overdue", value: "overdue" },
  { label: "Due soon", value: "dueSoon" },
  { label: "Paid", value: "paid" },
  { label: "Collect", value: "receivable" },
  { label: "Pay", value: "payable" }
] as const;

type QuickFilter = (typeof quickFilters)[number]["value"];
type DateRange = "all" | "due7" | "due30" | "issuedMonth";
type SortKey = "dueDate" | "amount" | "balance" | "partyName" | "status";

export function InvoiceTable({
  typeFilter,
  title = "Invoice ledger",
  compact = false
}: {
  typeFilter?: InvoiceType;
  title?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { invoices, deleteInvoice, markAsPaid } = useInvoices();
  const { notify } = useToast();
  const storageKey = `invoice-tracker:filters:${typeFilter ?? "all"}`;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "All">("All");
  const [priority, setPriority] = useState<InvoicePriority | "All">("All");
  const [type, setType] = useState<InvoiceType | "All">(typeFilter ?? "All");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortKey>("dueDate");
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setFiltersHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        query?: string;
        status?: InvoiceStatus | "All";
        priority?: InvoicePriority | "All";
        type?: InvoiceType | "All";
        quickFilter?: QuickFilter;
        dateRange?: DateRange;
        sort?: SortKey;
      };
      setQuery(parsed.query ?? "");
      setStatus(parsed.status ?? "All");
      setPriority(parsed.priority ?? "All");
      setType(typeFilter ?? parsed.type ?? "All");
      setQuickFilter(parsed.quickFilter ?? "all");
      setDateRange(parsed.dateRange ?? "all");
      setSort(parsed.sort ?? "dueDate");
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    setFiltersHydrated(true);
  }, [storageKey, typeFilter]);

  useEffect(() => {
    if (!filtersHydrated) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        query,
        status,
        priority,
        type,
        quickFilter,
        dateRange,
        sort
      })
    );
  }, [dateRange, filtersHydrated, priority, query, quickFilter, sort, status, storageKey, type]);

  const visibleInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return invoices
      .filter((invoice) => (typeFilter ? invoice.type === typeFilter : type === "All" || invoice.type === type))
      .filter((invoice) => status === "All" || getOperationalStatus(invoice) === status)
      .filter((invoice) => priority === "All" || invoice.priority === priority)
      .filter((invoice) => matchesQuickFilter(invoice, quickFilter))
      .filter((invoice) => matchesDateRange(invoice, dateRange))
      .filter((invoice) => {
        if (!normalized) {
          return true;
        }

        const haystack = [
          invoice.invoiceNumber,
          invoice.partyName,
          invoice.category,
          invoice.referenceNumber,
          invoice.notes,
          ...invoice.tags
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalized);
      })
      .sort((a, b) => {
        if (sort === "amount") {
          return b.amount - a.amount;
        }

        if (sort === "balance") {
          return invoiceBalance(b) - invoiceBalance(a);
        }

        if (sort === "partyName") {
          return a.partyName.localeCompare(b.partyName);
        }

        if (sort === "status") {
          return getOperationalStatus(a).localeCompare(getOperationalStatus(b));
        }

        return compareDateOnly(a.dueDate, b.dueDate);
      });
  }, [dateRange, invoices, priority, query, quickFilter, sort, status, type, typeFilter]);

  const summary = useMemo(() => {
    const overdue = visibleInvoices.filter((invoice) => isInvoiceOpen(invoice) && daysUntil(invoice.dueDate) < 0);
    const paidThisMonth = visibleInvoices
      .filter((invoice) => getOperationalStatus(invoice) === "Paid")
      .filter((invoice) => isSameMonthDateOnly(invoice.updatedAt, getAppTodayString()))
      .reduce((total, invoice) => total + invoice.amountPaid, 0);

    return {
      records: visibleInvoices.length,
      totalValue: visibleInvoices.reduce((total, invoice) => total + invoice.amount, 0),
      outstanding: visibleInvoices.reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      paidThisMonth
    };
  }, [visibleInvoices]);

  const hasFilters =
    query ||
    status !== "All" ||
    priority !== "All" ||
    (!typeFilter && type !== "All") ||
    quickFilter !== "all" ||
    dateRange !== "all" ||
    sort !== "dueDate";

  function clearFilters() {
    setQuery("");
    setStatus("All");
    setPriority("All");
    setType(typeFilter ?? "All");
    setQuickFilter("all");
    setDateRange("all");
    setSort("dueDate");
  }

  function handleExport() {
    const rows = visibleInvoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      type: invoice.type,
      partyName: invoice.partyName,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      invoiceTotal: invoice.amount,
      amountPaid: invoice.amountPaid,
      balanceRemaining: invoice.balanceRemaining,
      currency: invoice.currency,
      status: getOperationalStatus(invoice),
      aging: getAgingLabel(invoice),
      priority: invoice.priority,
      referenceNumber: invoice.referenceNumber ?? "",
      notes: invoice.notes ?? ""
    }));

    const headers = Object.keys(rows[0] ?? { invoiceNumber: "", type: "", partyName: "" });
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
    link.download = "invoice-export.csv";
    link.click();
    URL.revokeObjectURL(url);

    notify({
      title: "Export prepared",
      description: `${visibleInvoices.length} invoice${visibleInvoices.length === 1 ? "" : "s"} exported.`,
      variant: "success"
    });
  }

  function handleMarkPaid(invoice: Invoice) {
    if (!canReceivePayment(invoice)) {
      return;
    }

    markAsPaid(invoice.id);
    notify({
      title: "Invoice marked paid",
      description: `${invoice.invoiceNumber} now has a zero balance.`,
      variant: "success"
    });
  }

  function handleReminder(invoice: Invoice) {
    notify({
      title: "Reminder queued",
      description: `${invoice.invoiceNumber} reminder is ready for ${invoice.partyName}.`,
      variant: "info"
    });
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    deleteInvoice(pendingDelete.id);
    notify({
      title: "Invoice archived",
      description: `${pendingDelete.invoiceNumber} was removed from the active ledger.`,
      variant: "warning"
    });
    setPendingDelete(null);
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

  return (
    <div className="rounded-lg border border-ink-200 bg-white shadow-soft">
      <div className="border-b border-ink-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Ledger
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">{title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={clearFilters} disabled={!hasFilters}>
              <X className="size-4" />
              Clear filters
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={!visibleInvoices.length}>
              <Download className="size-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric label="Visible records" value={String(summary.records)} />
          <SummaryMetric label="Invoice value" value={formatCurrency(summary.totalValue)} />
          <SummaryMetric label="Outstanding" value={formatCurrency(summary.outstanding)} />
          <SummaryMetric
            label="Overdue"
            value={formatCurrency(summary.overdueAmount)}
            detail={`${summary.overdueCount} invoice${summary.overdueCount === 1 ? "" : "s"}`}
            tone="danger"
          />
          <SummaryMetric label="Paid this month" value={formatCurrency(summary.paidThisMonth)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters
            .filter((item) => !typeFilter || (item.value !== "receivable" && item.value !== "payable"))
            .map((item) => (
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

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_0.7fr_0.7fr_0.8fr_0.8fr_0.75fr]">
          <label className="relative lg:col-span-2">
            <span className="sr-only">Search invoices</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search number, party, tag, reference..."
              className="h-11 w-full rounded-lg border-ink-200 pl-10 text-sm focus:border-emerald-600 focus:ring-emerald-600"
            />
          </label>
          {!typeFilter ? (
            <select
              value={type}
              onChange={(event) => setType(event.target.value as InvoiceType | "All")}
              className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
              aria-label="Filter by invoice type"
            >
              <option value="All">All types</option>
              <option value="receivable">Collect</option>
              <option value="payable">Pay</option>
            </select>
          ) : null}
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
            <option value="all">All dates</option>
            <option value="due7">Due next 7 days</option>
            <option value="due30">Due next 30 days</option>
            <option value="issuedMonth">Issued this month</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-lg border-ink-200 text-sm focus:border-emerald-600 focus:ring-emerald-600"
            aria-label="Sort invoices"
          >
            <option value="dueDate">Sort by due date</option>
            <option value="amount">Sort by invoice total</option>
            <option value="balance">Sort by balance</option>
            <option value="partyName">Sort by customer / vendor</option>
            <option value="status">Sort by status</option>
          </select>
        </div>

        <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
          <SlidersHorizontal className="size-4" />
          Showing {visibleInvoices.length} of {invoices.filter((invoice) => !typeFilter || invoice.type === typeFilter).length} records
        </p>
      </div>

      {!visibleInvoices.length ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            title="No invoices match these filters"
            description="Clear the filters or add a new invoice to start building the ledger."
            href="/invoices/new"
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1060px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[10rem]" />
                <col className="w-[4.5rem]" />
                <col className="w-[9.5rem]" />
                <col className="w-[10rem]" />
                <col className="w-[9rem]" />
                <col className="w-[6rem]" />
                <col className="w-[6rem]" />
                <col className="w-[6.25rem]" />
                <col className="w-[4.75rem]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink-100 bg-ink-50 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-3 py-4">Invoice</th>
                  <th className="px-3 py-4">Type</th>
                  <th className="px-3 py-4">Customer / Vendor</th>
                  <th className="px-3 py-4">Dates</th>
                  <th className="px-3 py-4 text-right">Invoice total</th>
                  <th className="px-3 py-4">Status</th>
                  <th className="px-3 py-4">Priority</th>
                  <th className="px-3 py-4">Aging</th>
                  <th className="px-3 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleInvoices.map((invoice) => {
                  const displayStatus = getOperationalStatus(invoice);
                  return (
                    <tr
                      key={invoice.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openInvoice(invoice)}
                      onKeyDown={(event) => handleRowKeyDown(event, invoice)}
                      className={cn(
                        "cursor-pointer transition hover:bg-emerald-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-600",
                        displayStatus === "Overdue" && "bg-garnet-50/35"
                      )}
                    >
                      <td className="px-3 py-4 align-middle">
                        <p className="truncate whitespace-nowrap font-black text-ink-900">{invoice.invoiceNumber}</p>
                        <p className="mt-1 max-w-52 truncate text-sm text-ink-500">
                          {invoice.referenceNumber || invoice.category}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <TypeBadge type={invoice.type} />
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <p className="max-w-52 truncate font-semibold text-ink-900">{invoice.partyName}</p>
                        <p className="mt-1 max-w-52 truncate text-sm text-ink-500">
                          {getPartyLabel(invoice)} | {invoice.category}
                        </p>
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
                        <p className="whitespace-nowrap font-black text-ink-900">
                          {formatCurrency(invoice.amount, invoice.currency)}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-ink-500">{getBalanceLine(invoice)}</p>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <StatusBadge status={displayStatus} />
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <PriorityBadge priority={invoice.priority} />
                      </td>
                      <td className="px-3 py-4 align-middle text-sm font-semibold text-ink-700">
                        {getAgingLabel(invoice)}
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
                          <InvoiceActionMenu
                            invoice={invoice}
                            onMarkPaid={handleMarkPaid}
                            onReminder={handleReminder}
                            onArchive={setPendingDelete}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {visibleInvoices.map((invoice) => {
              const paid = percentage(invoice.amountPaid, invoice.amount);
              const displayStatus = getOperationalStatus(invoice);
              return (
                <article
                  key={invoice.id}
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
                      <span className="block truncate text-sm font-semibold text-ink-700">
                        {invoice.partyName}
                      </span>
                    </Link>
                    <StatusBadge status={displayStatus} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TypeBadge type={invoice.type} />
                    <PriorityBadge priority={invoice.priority} />
                    <span className="text-sm font-semibold text-ink-600">Aging: {getAgingLabel(invoice)}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <MobileField
                      label="Invoice total"
                      value={formatCurrency(invoice.amount, invoice.currency)}
                    />
                    <MobileField
                      label="Remaining"
                      value={formatCurrency(invoiceBalance(invoice), invoice.currency)}
                    />
                    <MobileField label="Issued" value={formatDate(invoice.invoiceDate)} />
                    <MobileField label="Due" value={formatDate(invoice.dueDate)} strong />
                  </div>

                  {!compact ? (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-semibold text-ink-500">
                        <span>{invoiceBalance(invoice) <= 0 ? "Paid in full" : "Payment progress"}</span>
                        <span>{paid}%</span>
                      </div>
                      <Progress value={paid} className="mt-2" />
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700"
                    >
                      View detail
                    </Link>
                    <InvoiceActionMenu
                      invoice={invoice}
                      onMarkPaid={handleMarkPaid}
                      onReminder={handleReminder}
                      onArchive={setPendingDelete}
                      align="right"
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archive this invoice?"
        description="This removes the invoice from the active demo ledger. You can reset demo data from Settings."
        confirmLabel="Archive invoice"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "danger" ? "border-garnet-100 bg-garnet-50/45" : "border-ink-100 bg-ink-50/70"
      )}
    >
      <p className={cn("text-xs font-bold uppercase tracking-[0.14em]", tone === "danger" ? "text-garnet-700" : "text-ink-500")}>
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-ink-900">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-ink-500">{detail}</p> : null}
    </div>
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

function InvoiceActionMenu({
  invoice,
  onMarkPaid,
  onReminder,
  onArchive,
  align = "left"
}: {
  invoice: Invoice;
  onMarkPaid: (invoice: Invoice) => void;
  onReminder: (invoice: Invoice) => void;
  onArchive: (invoice: Invoice) => void;
  align?: "left" | "right";
}) {
  const canPay = canReceivePayment(invoice);
  const open = isInvoiceOpen(invoice);

  return (
    <details className="group relative" onClick={stopEvent}>
      <summary
        aria-label={`More actions for ${invoice.invoiceNumber}`}
        title={`More actions for ${invoice.invoiceNumber}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-white hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div
        className={cn(
          "absolute z-30 mt-2 w-56 rounded-lg border border-ink-200 bg-white p-1.5 text-sm shadow-luxury",
          align === "right" ? "right-0" : "right-0"
        )}
      >
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Eye className="size-4" />}>
          View detail
        </MenuLink>
        <MenuLink href={`/invoices/${invoice.id}`} icon={<Pencil className="size-4" />}>
          Edit
        </MenuLink>
        {canPay ? (
          <MenuButton onClick={() => onMarkPaid(invoice)} icon={<CheckCircle2 className="size-4" />}>
            Mark as paid
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

  if (quickFilter === "receivable" || quickFilter === "payable") {
    return invoice.type === quickFilter;
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

function stopEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}
