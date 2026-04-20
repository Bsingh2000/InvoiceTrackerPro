"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Landmark } from "lucide-react";
import { useMemo } from "react";

import { StatCard } from "@/components/dashboard/stat-card";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { StatusBadge } from "@/components/invoices/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { ButtonLink } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAgingBuckets, sortInvoicesByUrgency } from "@/lib/analytics";
import { daysUntil, describeDueDate, formatCurrency, formatDate, invoiceBalance, isInvoiceOpen, isInvoiceOverdue } from "@/lib/format";
import type { InvoiceType } from "@/lib/types";

export function InvoiceWorkstreamView({ type }: { type: InvoiceType }) {
  const { invoices } = useInvoices();
  const label = type === "receivable" ? "Receivables" : "Payables";
  const noun = type === "receivable" ? "customer" : "vendor";
  const action = type === "receivable" ? "collect" : "pay";

  const data = useMemo(() => {
    const filtered = invoices.filter((invoice) => invoice.type === type);
    const open = filtered.filter(isInvoiceOpen);
    const overdue = filtered.filter(isInvoiceOverdue);
    const dueSoon = open.filter((invoice) => {
      const days = daysUntil(invoice.dueDate);
      return days >= 0 && days <= 7;
    });
    const paid = filtered.filter((invoice) => invoice.status === "Paid");
    const totalOpen = open.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const aging = getAgingBuckets(invoices, type);
    const urgent = sortInvoicesByUrgency(filtered).filter(isInvoiceOpen).slice(0, 6);

    return {
      filtered,
      open,
      overdue,
      dueSoon,
      paid,
      totalOpen,
      aging,
      urgent
    };
  }, [invoices, type]);

  const maxBucket = Math.max(...data.aging.map((bucket) => bucket.amount), 1);

  return (
    <>
      <PageHeader
        eyebrow={`${action} control`}
        title={label}
        description={`Monitor ${noun} balances, aging, deadlines, and payment history without leaving the workflow.`}
        action={<ButtonLink href="/invoices/new">Add invoice</ButtonLink>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Open ${label.toLowerCase()}`}
          value={formatCurrency(data.totalOpen)}
          detail={`${data.open.length} active invoice${data.open.length === 1 ? "" : "s"}.`}
          icon={<Landmark className="size-5" />}
          tone={type === "receivable" ? "emerald" : "peacock"}
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(data.overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0))}
          detail={`${data.overdue.length} record${data.overdue.length === 1 ? "" : "s"} past deadline.`}
          icon={<AlertTriangle className="size-5" />}
          tone="garnet"
        />
        <StatCard
          label="Due soon"
          value={String(data.dueSoon.length)}
          detail="Due within the next seven days."
          icon={<CalendarClock className="size-5" />}
          tone="citrine"
        />
        <StatCard
          label="Paid history"
          value={formatCurrency(data.paid.reduce((total, invoice) => total + invoice.amountPaid, 0))}
          detail={`${data.paid.length} completed invoice${data.paid.length === 1 ? "" : "s"}.`}
          icon={<CheckCircle2 className="size-5" />}
          tone="ink"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Aging overview" eyebrow="Balance risk">
          <div className="space-y-5">
            {data.aging.map((bucket) => (
              <div key={bucket.label}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink-900">{bucket.label}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-black text-ink-900">{formatCurrency(bucket.amount)}</p>
                </div>
                <Progress
                  value={(bucket.amount / maxBucket) * 100}
                  className="mt-3"
                  tone={bucket.label === "Current" ? "emerald" : "garnet"}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Priority movement" eyebrow="Action board">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.urgent.map((invoice) => (
              <div key={invoice.id} className="rounded-lg border border-ink-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900">{invoice.partyName}</p>
                    <p className="mt-1 text-xs text-ink-500">{invoice.invoiceNumber}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-4 text-xl font-black text-ink-900">
                  {formatCurrency(invoice.balanceRemaining, invoice.currency)}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink-600">
                  {describeDueDate(invoice.dueDate, invoice.status)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title={`Overdue ${label.toLowerCase()}`} eyebrow="Escalate">
          <MiniInvoiceList invoices={data.overdue.slice(0, 5)} />
        </SectionCard>
        <SectionCard title="Due soon" eyebrow="Next seven days">
          <MiniInvoiceList invoices={data.dueSoon.slice(0, 5)} />
        </SectionCard>
        <SectionCard title="Paid history" eyebrow="Completed">
          <MiniInvoiceList invoices={data.paid.slice(0, 5)} />
        </SectionCard>
      </section>

      <section className="mt-4">
        <InvoiceTable typeFilter={type} title={`${label} ledger`} />
      </section>
    </>
  );
}

function MiniInvoiceList({ invoices }: { invoices: ReturnType<typeof sortInvoicesByUrgency> }) {
  if (!invoices.length) {
    return <p className="text-sm leading-6 text-ink-500">No matching invoices right now.</p>;
  }

  return (
    <div className="space-y-4">
      {invoices.map((invoice) => (
        <div key={invoice.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">{invoice.partyName}</p>
            <p className="mt-1 text-xs text-ink-500">
              {invoice.invoiceNumber} - {formatDate(invoice.dueDate)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-black text-ink-900">
            {formatCurrency(invoice.balanceRemaining || invoice.amountPaid, invoice.currency)}
          </p>
        </div>
      ))}
    </div>
  );
}
