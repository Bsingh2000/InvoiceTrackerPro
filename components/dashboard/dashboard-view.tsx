"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  ReceiptText,
  Send,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";

import {
  MonthlyTotalsChart,
  ReceivablePayableChart
} from "@/components/dashboard/dashboard-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/invoices/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getAgingBuckets,
  getAverageCollectionTime,
  getDashboardMetrics,
  getMonthlyInvoiceTotals,
  getReceivablePayableSeries,
  getRecentInvoices
} from "@/lib/analytics";
import {
  daysUntil,
  describeDueDate,
  formatCurrency,
  formatDate,
  formatShortDate,
  invoiceBalance,
  isInvoiceOpen
} from "@/lib/format";
import type { Invoice, InvoicePriority, InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const priorityRank: Record<InvoicePriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3
};

export function DashboardView() {
  const { invoices, markAsPaid } = useInvoices();
  const { notify } = useToast();

  const data = useMemo(() => {
    const metrics = getDashboardMetrics(invoices);
    const open = invoices.filter(isInvoiceOpen);
    const overdue = open.filter((invoice) => daysUntil(invoice.dueDate) < 0);
    const dueToday = open.filter((invoice) => daysUntil(invoice.dueDate) === 0);
    const dueThisWeek = open.filter((invoice) => {
      const days = daysUntil(invoice.dueDate);
      return days >= 0 && days <= 7;
    });
    const dueNext30 = open.filter((invoice) => {
      const days = daysUntil(invoice.dueDate);
      return days >= 0 && days <= 30;
    });
    const urgent = [...open]
      .sort((a, b) => {
        const dueDelta = daysUntil(a.dueDate) - daysUntil(b.dueDate);
        if (dueDelta !== 0) {
          return dueDelta;
        }

        return priorityRank[a.priority] - priorityRank[b.priority];
      })
      .slice(0, 4);

    const overdueReceivables = overdue
      .filter((invoice) => invoice.type === "receivable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const overduePayables = overdue
      .filter((invoice) => invoice.type === "payable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const dueThisWeekAmount = dueThisWeek.reduce(
      (total, invoice) => total + invoiceBalance(invoice),
      0
    );
    const overdueAmount = overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const next7Receivables = dueThisWeek
      .filter((invoice) => invoice.type === "receivable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const next7Payables = dueThisWeek
      .filter((invoice) => invoice.type === "payable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const next30Receivables = dueNext30
      .filter((invoice) => invoice.type === "receivable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const next30Payables = dueNext30
      .filter((invoice) => invoice.type === "payable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);

    return {
      metrics,
      overdue,
      dueToday,
      dueThisWeek,
      dueNext30,
      urgent,
      overdueReceivables,
      overduePayables,
      overdueAmount,
      dueThisWeekAmount,
      next7Receivables,
      next7Payables,
      next30Receivables,
      next30Payables,
      averageCollection: getAverageCollectionTime(invoices),
      receivableAging: getAgingBuckets(invoices, "receivable"),
      monthlyTotals: getMonthlyInvoiceTotals(invoices),
      receivablePayable: getReceivablePayableSeries(invoices),
      recentActivity: buildRecentActivity(invoices, urgent)
    };
  }, [invoices]);

  function sendReminder(invoice?: Invoice) {
    notify({
      title: "Reminder queued",
      description: invoice
        ? `${invoice.invoiceNumber} reminder is ready for ${invoice.partyName}.`
        : "A reminder batch is ready for urgent invoices.",
      variant: "info"
    });
  }

  function handleMarkPaid(invoice: Invoice) {
    markAsPaid(invoice.id);
    notify({
      title: "Invoice marked paid",
      description: `${invoice.invoiceNumber} now has a zero balance.`,
      variant: "success"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Invoice operations"
        title="Dashboard"
        description="Today's deadlines, overdue balances, cash movement, and the invoices that need action."
        action={
          <>
            <label className="sr-only" htmlFor="dashboard-window">
              Dashboard date range
            </label>
            <select
              id="dashboard-window"
              className="h-10 rounded-lg border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 focus:border-emerald-600 focus:ring-emerald-600"
              defaultValue="30"
            >
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="month">This month</option>
            </select>
            <ButtonLink href="/analytics" variant="secondary">
              View analytics
            </ButtonLink>
            <ButtonLink href="/invoices/new">Add invoice</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Total invoices"
          value={String(data.metrics.totalInvoices)}
          detail="All active records"
          icon={<FileText className="size-4" />}
          tone="ink"
        />
        <StatCard
          label="Receivables"
          value={formatCurrency(data.metrics.totalReceivables)}
          detail="Open to collect"
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Payables"
          value={formatCurrency(data.metrics.totalPayables)}
          detail="Open to pay"
          icon={<CreditCard className="size-4" />}
          tone="peacock"
        />
        <StatCard
          label="Overdue amount"
          value={formatCurrency(data.overdueAmount)}
          detail={`${data.overdue.length} invoices`}
          icon={<AlertTriangle className="size-4" />}
          tone="garnet"
        />
        <StatCard
          label="Due this week"
          value={formatCurrency(data.dueThisWeekAmount)}
          detail={`${data.dueToday.length} due today`}
          icon={<CalendarClock className="size-4" />}
          tone="citrine"
        />
        <StatCard
          label="Paid this month"
          value={formatCurrency(data.metrics.paidThisMonth)}
          detail="Closed cash flow"
          icon={<CheckCircle2 className="size-4" />}
          tone="emerald"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <ExecutiveSummaryCard
          overdueReceivables={data.overdueReceivables}
          overduePayables={data.overduePayables}
          dueTodayCount={data.dueToday.length}
          dueThisWeekCount={data.dueThisWeek.length}
          onSendReminder={() => sendReminder()}
        />
        <PriorityQueue
          invoices={data.urgent}
          onMarkPaid={handleMarkPaid}
          onSendReminder={sendReminder}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <ReceivablePayableChart data={data.receivablePayable} />
        <MonthlyTotalsChart data={data.monthlyTotals} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <RecentActivity activity={data.recentActivity} />
        <ForecastAndAgingCard
          next7Receivables={data.next7Receivables}
          next7Payables={data.next7Payables}
          next30Receivables={data.next30Receivables}
          next30Payables={data.next30Payables}
          overdueReceivables={data.overdueReceivables}
          overduePayables={data.overduePayables}
          followUpCount={data.overdue.length}
          averageCollection={data.averageCollection}
          agingBuckets={data.receivableAging}
        />
      </section>

      <section className="mt-4">
        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              More detail
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">Deeper analytics are one click away</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Trends, customer concentration, vendor spend, and status distribution live on the Analytics page.
            </p>
          </div>
          <ButtonLink href="/analytics" variant="secondary">
            Open analytics
            <ArrowRight className="size-4" />
          </ButtonLink>
        </Card>
      </section>
    </>
  );
}

function ExecutiveSummaryCard({
  overdueReceivables,
  overduePayables,
  dueTodayCount,
  dueThisWeekCount,
  onSendReminder
}: {
  overdueReceivables: number;
  overduePayables: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  onSendReminder: () => void;
}) {
  return (
    <Card className="self-start p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Today
          </p>
          <h2 className="mt-1 text-xl font-black text-ink-900">Action summary</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Focus on overdue balances and deadlines that can affect cash this week.
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          {dueTodayCount} due today
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryMetric
          label="Overdue receivables"
          value={formatCurrency(overdueReceivables)}
          tone="danger"
          icon={<WalletCards className="size-4" />}
        />
        <SummaryMetric
          label="Overdue payables"
          value={formatCurrency(overduePayables)}
          tone="warning"
          icon={<CreditCard className="size-4" />}
        />
        <SummaryMetric
          label="Due this week"
          value={String(dueThisWeekCount)}
          helper="Invoices with deadlines"
          icon={<CalendarClock className="size-4" />}
        />
        <SummaryMetric
          label="Reminder batch"
          value={String(Math.max(0, dueTodayCount + dueThisWeekCount))}
          helper="Ready to review"
          icon={<BellRing className="size-4" />}
        />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <ButtonLink href="/invoices/new">Add invoice</ButtonLink>
        <ButtonLink href="/invoices" variant="secondary">
          Record payment
        </ButtonLink>
        <Button variant="secondary" onClick={onSendReminder}>
          Send reminder
        </Button>
      </div>
    </Card>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  helper?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "danger" | "warning";
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-500">{label}</p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            tone === "danger" && "bg-garnet-50 text-garnet-700",
            tone === "warning" && "bg-citrine-50 text-citrine-800",
            tone === "neutral" && "bg-white text-emerald-700"
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-black text-ink-900">{value}</p>
      {helper ? <p className="mt-1 text-xs font-medium text-ink-500">{helper}</p> : null}
    </div>
  );
}

function PriorityQueue({
  invoices,
  onMarkPaid,
  onSendReminder
}: {
  invoices: Invoice[];
  onMarkPaid: (invoice: Invoice) => void;
  onSendReminder: (invoice: Invoice) => void;
}) {
  return (
    <SectionCard
      title="Priority queue"
      eyebrow="Urgent actions"
      action={
        <ButtonLink href="/invoices" variant="secondary">
          View all urgent invoices
        </ButtonLink>
      }
    >
      <div className="space-y-3">
        {invoices.map((invoice) => {
          const displayStatus = getOperationalStatus(invoice);
          return (
            <div key={invoice.id} className="rounded-lg border border-ink-100 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-black text-ink-900">{invoice.partyName}</p>
                    <StatusBadge status={displayStatus} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                    <span>{invoice.invoiceNumber}</span>
                    <span className="font-semibold text-ink-700">
                      {invoice.type === "receivable" ? "Collect" : "Pay"}
                    </span>
                    <span>Due {formatShortDate(invoice.dueDate)}</span>
                  </div>
                </div>
                <div className="shrink-0 lg:text-right">
                  <p className="text-lg font-black text-ink-900">
                    {formatCurrency(invoiceBalance(invoice), invoice.currency)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-600">
                    {describeDueDate(invoice.dueDate, displayStatus)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Clock3 className="size-4" />
                  <span>Priority: {invoice.priority}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
                  >
                    <Eye className="size-4" />
                    View
                  </Link>
                  <Button
                    variant="secondary"
                    className="min-h-10 px-3"
                    onClick={() => onMarkPaid(invoice)}
                    disabled={invoice.status === "Paid"}
                  >
                    Paid
                  </Button>
                  <Button
                    variant="secondary"
                    className="min-h-10 px-3"
                    onClick={() => onSendReminder(invoice)}
                  >
                    <Send className="size-4" />
                    <span className="hidden sm:inline">Reminder</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  return (
    <SectionCard title="Recent activity" eyebrow="Latest changes">
      <div className="space-y-4">
        {activity.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/invoices/${item.invoiceId}`}
              className="group flex gap-3 rounded-lg border border-transparent p-2 transition hover:border-ink-100 hover:bg-ink-50"
            >
              <div
                className={cn(
                  "mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg",
                  item.tone === "success" && "bg-emerald-50 text-emerald-700",
                  item.tone === "warning" && "bg-citrine-50 text-citrine-800",
                  item.tone === "danger" && "bg-garnet-50 text-garnet-700",
                  item.tone === "neutral" && "bg-peacock-50 text-peacock-700"
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-ink-900">{item.title}</p>
                  <span className="shrink-0 text-xs font-semibold text-ink-400">{item.timestamp}</span>
                </div>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
                  {item.invoiceNumber}
                </p>
                <p className="mt-1 text-sm leading-5 text-ink-600">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ForecastAndAgingCard({
  next7Receivables,
  next7Payables,
  next30Receivables,
  next30Payables,
  overdueReceivables,
  overduePayables,
  followUpCount,
  averageCollection,
  agingBuckets
}: {
  next7Receivables: number;
  next7Payables: number;
  next30Receivables: number;
  next30Payables: number;
  overdueReceivables: number;
  overduePayables: number;
  followUpCount: number;
  averageCollection: number;
  agingBuckets: Array<{ label: string; amount: number; count: number }>;
}) {
  const maxAging = Math.max(...agingBuckets.map((bucket) => bucket.amount), 1);

  return (
    <SectionCard title="Forecast and aging" eyebrow="Operations">
      <div className="grid gap-3 sm:grid-cols-2">
        <ForecastMetric label="Next 7 days in" value={formatCurrency(next7Receivables)} />
        <ForecastMetric label="Next 7 days out" value={formatCurrency(next7Payables)} />
        <ForecastMetric label="Next 30 days in" value={formatCurrency(next30Receivables)} />
        <ForecastMetric label="Next 30 days out" value={formatCurrency(next30Payables)} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-garnet-100 bg-garnet-50/50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-garnet-700">
            Overdue collect
          </p>
          <p className="mt-2 text-lg font-black text-ink-900">{formatCurrency(overdueReceivables)}</p>
        </div>
        <div className="rounded-lg border border-citrine-100 bg-citrine-50/60 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-citrine-800">
            Overdue pay
          </p>
          <p className="mt-2 text-lg font-black text-ink-900">{formatCurrency(overduePayables)}</p>
        </div>
        <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
            Follow-up
          </p>
          <p className="mt-2 text-lg font-black text-ink-900">{followUpCount} invoices</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink-900">Receivables aging</p>
          <p className="text-sm font-semibold text-ink-500">{averageCollection} day avg collect</p>
        </div>
        <div className="mt-4 space-y-3">
          {agingBuckets.map((bucket) => (
            <div key={bucket.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-semibold text-ink-700">{bucket.label}</p>
                <p className="font-bold text-ink-900">{formatCurrency(bucket.amount)}</p>
              </div>
              <Progress
                value={(bucket.amount / maxAging) * 100}
                className="mt-2"
                tone={bucket.label === "Current" ? "emerald" : "garnet"}
              />
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function ForecastMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <p className="mt-2 text-lg font-black text-ink-900">{value}</p>
    </div>
  );
}

type ActivityItem = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  title: string;
  description: string;
  timestamp: string;
  tone: "success" | "warning" | "danger" | "neutral";
  icon: LucideIcon;
};

function buildRecentActivity(invoices: Invoice[], urgent: Invoice[]): ActivityItem[] {
  const recent = getRecentInvoices(invoices, 4);
  const items: ActivityItem[] = [];

  if (urgent[0]) {
    items.push({
      id: `reminder-${urgent[0].id}`,
      invoiceId: urgent[0].id,
      invoiceNumber: urgent[0].invoiceNumber,
      title: "Reminder sent",
      description: `${urgent[0].partyName} is in the urgent queue.`,
      timestamp: "Today",
      tone: "warning",
      icon: Send
    });
  }

  recent.forEach((invoice, index) => {
    const displayStatus = getOperationalStatus(invoice);
    const paid = invoice.status === "Paid";
    const overdue = displayStatus === "Overdue";
    const title = paid
      ? "Payment recorded"
      : overdue
        ? "Status changed"
        : index % 2 === 0
          ? "Invoice updated"
          : "Invoice created";

    items.push({
      id: `${title}-${invoice.id}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      title,
      description: paid
        ? `${formatCurrency(invoice.amountPaid, invoice.currency)} was applied for ${invoice.partyName}.`
        : overdue
          ? `${invoice.partyName} is now ${describeDueDate(invoice.dueDate, displayStatus).toLowerCase()}.`
          : `${invoice.partyName} has a ${formatCurrency(invoiceBalance(invoice), invoice.currency)} remaining balance.`,
      timestamp: formatDate(invoice.updatedAt),
      tone: paid ? "success" : overdue ? "danger" : "neutral",
      icon: paid ? CheckCircle2 : overdue ? AlertTriangle : ReceiptText
    });
  });

  return items.slice(0, 5);
}

function getOperationalStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "Paid" || invoice.status === "Cancelled") {
    return invoice.status;
  }

  const days = daysUntil(invoice.dueDate);
  if (days < 0) {
    return "Overdue";
  }

  if (days <= 7) {
    return "Due Soon";
  }

  if (invoice.status === "Overdue" || invoice.status === "Due Soon") {
    return "Pending";
  }

  return invoice.status;
}
