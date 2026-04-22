"use client";

import {
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  isSameMonth,
  startOfMonth,
  subDays,
  subMonths
} from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowUpRight,
  Clock,
  Download,
  Gauge,
  LineChart as LineChartIcon,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ChartFrame } from "@/components/dashboard/dashboard-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { getAppToday, formatDateOnly, parseAppDate } from "@/lib/date-utils";
import {
  daysUntil,
  formatCompactCurrency,
  formatCurrency,
  invoiceBalance,
  isInvoiceOpen,
  percentage
} from "@/lib/format";
import type { Invoice, InvoiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

type DateRangeKey = "30d" | "90d" | "12m" | "custom";
type TypeFilter = "all" | InvoiceType;
type StatusFilter = "all" | "open" | "paid" | "overdue";
type MetricBasis = "cash" | "invoice";
type MetricUnit = "amount" | "count";
type ConcentrationBasis = "outstanding" | "overdue" | "invoice" | "paid";
type ChartRow = Record<string, string | number>;
type DrillTarget = {
  title: string;
  description: string;
  invoices: Invoice[];
};

const responsiveChartProps = {
  initialDimension: { width: 640, height: 288 },
  minWidth: 1,
  minHeight: 288
};

const chartAxisWidth = 76;
const chartMargin = { left: 8, right: 12, top: 10, bottom: 0 };

const statusColors: Record<string, string> = {
  Draft: "#939086",
  Pending: "#17accb",
  "Partially Paid": "#7c3aed",
  Paid: "#0a876b",
  Cancelled: "#42403b"
};

const timingColors: Record<string, string> = {
  Current: "#0a876b",
  "Due Soon": "#d99a08",
  "Due Today": "#f0b429",
  Overdue: "#c91f43"
};

const typeLabels: Record<TypeFilter, string> = {
  all: "All",
  receivable: "Collect",
  payable: "Pay"
};

const statusLabels: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  paid: "Paid",
  overdue: "Overdue"
};

export function AnalyticsView() {
  const { invoices } = useInvoices();
  const { notify } = useToast();
  const today = useMemo(() => getAppToday(), []);
  const [dateRange, setDateRange] = useState<DateRangeKey>("90d");
  const [customStart, setCustomStart] = useState(formatDateOnly(subDays(today, 90)));
  const [customEnd, setCustomEnd] = useState(formatDateOnly(today));
  const [comparePeriod, setComparePeriod] = useState(true);
  const [metricBasis, setMetricBasis] = useState<MetricBasis>("cash");
  const [metricUnit, setMetricUnit] = useState<MetricUnit>("amount");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [concentrationBasis, setConcentrationBasis] = useState<ConcentrationBasis>("outstanding");
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);

  const period = useMemo(
    () => getPeriod(dateRange, today, customStart, customEnd),
    [customEnd, customStart, dateRange, today]
  );

  const analysis = useMemo(() => {
    const scoped = invoices
      .filter((invoice) => matchesType(invoice, typeFilter))
      .filter((invoice) => matchesStatus(invoice, statusFilter));
    const periodInvoices = scoped.filter((invoice) => isInPeriod(getBasisDate(invoice, metricBasis), period));
    const previous = comparePeriod ? getPreviousPeriod(period) : null;
    const previousInvoices = previous
      ? scoped.filter((invoice) => isInPeriod(getBasisDate(invoice, metricBasis), previous))
      : [];
    const open = scoped.filter(isInvoiceOpen);
    const overdue = open.filter((invoice) => getTimingBucket(invoice) === "Overdue");
    const paid = scoped.filter((invoice) => invoice.status === "Paid" || invoiceBalance(invoice) <= 0);
    const receivables = scoped.filter((invoice) => invoice.type === "receivable");
    const payables = scoped.filter((invoice) => invoice.type === "payable");
    const cashCollected = cashMovement(periodInvoices, "receivable");
    const cashPaid = cashMovement(periodInvoices, "payable");
    const previousCollected = cashMovement(previousInvoices, "receivable");
    const previousPaid = cashMovement(previousInvoices, "payable");
    const invoicedReceivables = invoiceActivity(periodInvoices, "receivable");
    const invoicedPayables = invoiceActivity(periodInvoices, "payable");
    const previousInvoicedReceivables = invoiceActivity(previousInvoices, "receivable");
    const previousInvoicedPayables = invoiceActivity(previousInvoices, "payable");
    const collectionForecast = open
      .filter((invoice) => invoice.type === "receivable" && daysUntil(invoice.dueDate) <= 30)
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const paymentForecast = open
      .filter((invoice) => invoice.type === "payable" && daysUntil(invoice.dueDate) <= 30)
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const openAmount = open.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const overdueAmount = overdue.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const paidRatio = percentage(paid.length, scoped.length);
    const overdueRatio = percentage(overdueAmount, openAmount);
    const averageDelay = getAveragePaymentDelay(paid);
    const averageTerms = getAveragePaymentTerms(receivables);
    const monthlyTrend = getMonthlyTrend(scoped, metricBasis, metricUnit, today);
    const exposure = getExposureSeries(scoped, today);
    const statusMix = getStatusMix(scoped, metricUnit);
    const timingMix = getTimingMix(open, metricUnit);
    const topCustomers = getConcentration(receivables, concentrationBasis, 6);
    const topVendors = getConcentration(payables, concentrationBasis, 6);
    const insights = getDynamicInsights({
      scoped,
      open,
      receivables,
      payables,
      topCustomers,
      topVendors,
      overdueAmount,
      openAmount,
      cashCollected,
      previousCollected,
      cashPaid,
      previousPaid
    });

    return {
      scoped,
      periodInvoices,
      previousInvoices,
      open,
      overdue,
      paid,
      averageDelay,
      averageTerms,
      cashCollected,
      cashPaid,
      previousCollected,
      previousPaid,
      invoicedReceivables,
      invoicedPayables,
      previousInvoicedReceivables,
      previousInvoicedPayables,
      collectionForecast,
      paymentForecast,
      openAmount,
      paidRatio,
      overdueRatio,
      overdueAmount,
      monthlyTrend,
      exposure,
      statusMix,
      timingMix,
      topCustomers,
      topVendors,
      insights
    };
  }, [comparePeriod, invoices, metricBasis, metricUnit, period, statusFilter, typeFilter, today, concentrationBasis]);

  function exportAnalytics() {
    const headers = ["invoiceNumber", "type", "partyName", "invoiceDate", "dueDate", "amount", "amountPaid", "balanceRemaining", "status"];
    const rows = analysis.scoped.map((invoice) =>
      headers
        .map((header) => `"${String(invoice[header as keyof Invoice] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "analytics-invoice-export.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify({
      title: "Analytics export ready",
      description: `${analysis.scoped.length} invoice${analysis.scoped.length === 1 ? "" : "s"} exported from the current filter scope.`,
      variant: "success"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Financial intelligence"
        title="Analytics"
        description="Analyze cash movement, invoice activity, exposure, overdue risk, and counterparty concentration with clear metric definitions."
        action={
          <>
            <Button variant="secondary" onClick={exportAnalytics}>
              <Download className="size-4" />
              Export
            </Button>
            <ButtonLink href="/invoices" variant="secondary">
              Open ledger
            </ButtonLink>
          </>
        }
      />

      <AnalyticsControls
        dateRange={dateRange}
        customStart={customStart}
        customEnd={customEnd}
        comparePeriod={comparePeriod}
        metricBasis={metricBasis}
        metricUnit={metricUnit}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        onDateRangeChange={setDateRange}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        onCompareChange={setComparePeriod}
        onBasisChange={setMetricBasis}
        onUnitChange={setMetricUnit}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
      />

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net cash movement"
          value={formatCurrency(analysis.cashCollected - analysis.cashPaid)}
          detail={`${compareText(analysis.cashCollected - analysis.cashPaid, analysis.previousCollected - analysis.previousPaid, comparePeriod)}. Cash basis, current scope.`}
          icon={<LineChartIcon className="size-5" />}
          tone="emerald"
        />
        <StatCard
          label="Overdue exposure"
          value={formatCurrency(analysis.overdueAmount)}
          detail={`${analysis.overdue.length} open overdue invoice${analysis.overdue.length === 1 ? "" : "s"} | ${analysis.overdueRatio}% of open balance.`}
          icon={<ShieldAlert className="size-5" />}
          tone="garnet"
        />
        <StatCard
          label="Average payment delay"
          value={`${analysis.averageDelay.days} days`}
          detail={`Completed invoices only. ${analysis.averageDelay.sample} sample${analysis.averageDelay.sample === 1 ? "" : "s"} after due date.`}
          icon={<Clock className="size-5" />}
          tone="citrine"
        />
        <StatCard
          label="Average payment terms"
          value={`${analysis.averageTerms.days} days`}
          detail={`Receivable issue date to due date. ${analysis.averageTerms.sample} receivable${analysis.averageTerms.sample === 1 ? "" : "s"} measured.`}
          icon={<Gauge className="size-5" />}
          tone="peacock"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <TrendChart
          data={analysis.monthlyTrend}
          basis={metricBasis}
          unit={metricUnit}
          periodLabel={period.label}
          onMonthClick={(row) => {
            const month = String(row.month);
            setDrillTarget({
              title: `${month} ${metricBasis === "cash" ? "cash movement" : "invoice activity"}`,
              description: `${metricUnit === "amount" ? "Amount" : "Count"} basis for invoices in this period.`,
              invoices: analysis.scoped.filter((invoice) => format(parseAppDate(getBasisDate(invoice, metricBasis)), "MMM") === month)
            });
          }}
        />
        <ExposureChart
          data={analysis.exposure}
          onPointClick={(row) => {
            const month = String(row.month);
            setDrillTarget({
              title: `${month} exposure`,
              description: "Open receivable and payable balances due in this month.",
              invoices: analysis.open.filter((invoice) => format(parseAppDate(invoice.dueDate), "MMM") === month)
            });
          }}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <DistributionPanel
          title="Status mix"
          subtitle={`Status counts are separate from timing. ${metricUnit === "amount" ? "Values use invoice totals." : "Values use invoice counts."}`}
          data={analysis.statusMix}
          unit={metricUnit}
          colors={statusColors}
          onSliceClick={(name) => {
            setDrillTarget({
              title: `${name} invoices`,
              description: "Filtered by invoice status.",
              invoices: analysis.scoped.filter((invoice) => getStatusCategory(invoice) === name)
            });
          }}
        />
        <DistributionPanel
          title="Aging and timing mix"
          subtitle={`Timing buckets are based on open invoice due dates. ${metricUnit === "amount" ? "Values use open balances." : "Values use invoice counts."}`}
          data={analysis.timingMix}
          unit={metricUnit}
          colors={timingColors}
          onSliceClick={(name) => {
            setDrillTarget({
              title: `${name} timing`,
              description: "Open invoices in this timing bucket.",
              invoices: analysis.open.filter((invoice) => getTimingBucket(invoice) === name)
            });
          }}
        />
        <SectionCard title="Portfolio snapshot" eyebrow="Exposure summary">
          <div className="grid gap-3">
            <RatioTile title="Open amount" value={formatCurrency(analysis.openAmount)} detail="Unpaid balance across current filter scope." />
            <RatioTile title="Paid ratio" value={`${analysis.paidRatio}%`} detail="Completed invoice count divided by total invoices in scope." />
            <RatioTile title="30-day collection forecast" value={formatCurrency(analysis.collectionForecast)} detail="Open receivables due in the next 30 days." />
            <RatioTile title="30-day payment forecast" value={formatCurrency(analysis.paymentForecast)} detail="Open payables due in the next 30 days." />
          </div>
        </SectionCard>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <ConcentrationPanel
          title="Top customers by outstanding exposure"
          data={analysis.topCustomers}
          basis={concentrationBasis}
          onBasisChange={setConcentrationBasis}
          onSelect={(name) => {
            setDrillTarget({
              title: name,
              description: "Receivable concentration behind this customer.",
              invoices: analysis.scoped.filter((invoice) => invoice.type === "receivable" && invoice.partyName === name)
            });
          }}
        />
        <ConcentrationPanel
          title="Top vendors by payable exposure"
          data={analysis.topVendors}
          basis={concentrationBasis}
          onBasisChange={setConcentrationBasis}
          onSelect={(name) => {
            setDrillTarget({
              title: name,
              description: "Payable concentration behind this vendor.",
              invoices: analysis.scoped.filter((invoice) => invoice.type === "payable" && invoice.partyName === name)
            });
          }}
        />
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_24rem]">
        <DynamicInsights insights={analysis.insights} onOpen={setDrillTarget} />
        <DrilldownPanel target={drillTarget} onClear={() => setDrillTarget(null)} />
      </section>
    </>
  );
}

function AnalyticsControls({
  dateRange,
  customStart,
  customEnd,
  comparePeriod,
  metricBasis,
  metricUnit,
  typeFilter,
  statusFilter,
  onDateRangeChange,
  onCustomStartChange,
  onCustomEndChange,
  onCompareChange,
  onBasisChange,
  onUnitChange,
  onTypeChange,
  onStatusChange
}: {
  dateRange: DateRangeKey;
  customStart: string;
  customEnd: string;
  comparePeriod: boolean;
  metricBasis: MetricBasis;
  metricUnit: MetricUnit;
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  onDateRangeChange: (value: DateRangeKey) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onCompareChange: (value: boolean) => void;
  onBasisChange: (value: MetricBasis) => void;
  onUnitChange: (value: MetricUnit) => void;
  onTypeChange: (value: TypeFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
}) {
  return (
    <Card className="p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_0.85fr_0.75fr_0.75fr_0.8fr]">
        <ControlGroup label="Date range">
          <select aria-label="Date range" className="field-control mt-0" value={dateRange} onChange={(event) => onDateRangeChange(event.target.value as DateRangeKey)}>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
            <option value="custom">Custom</option>
          </select>
        </ControlGroup>
        <ControlGroup label="Metric basis">
          <SegmentedControl
            value={metricBasis}
            options={[
              { label: "Cash", value: "cash" },
              { label: "Invoice", value: "invoice" }
            ]}
            onChange={(value) => onBasisChange(value as MetricBasis)}
          />
        </ControlGroup>
        <ControlGroup label="Measure">
          <SegmentedControl
            value={metricUnit}
            options={[
              { label: "Amount", value: "amount" },
              { label: "Count", value: "count" }
            ]}
            onChange={(value) => onUnitChange(value as MetricUnit)}
          />
        </ControlGroup>
        <ControlGroup label="Type">
          <select aria-label="Type" className="field-control mt-0" value={typeFilter} onChange={(event) => onTypeChange(event.target.value as TypeFilter)}>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </ControlGroup>
        <ControlGroup label="Status">
          <select aria-label="Status" className="field-control mt-0" value={statusFilter} onChange={(event) => onStatusChange(event.target.value as StatusFilter)}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </ControlGroup>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {dateRange === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlGroup label="Start">
              <input aria-label="Start" type="date" className="field-control mt-0" value={customStart} onChange={(event) => onCustomStartChange(event.target.value)} />
            </ControlGroup>
            <ControlGroup label="End">
              <input aria-label="End" type="date" className="field-control mt-0" value={customEnd} onChange={(event) => onCustomEndChange(event.target.value)} />
            </ControlGroup>
          </div>
        ) : (
          <p className="text-sm leading-6 text-ink-600">
            Cash basis uses payment dates. Invoice basis uses invoice dates.
          </p>
        )}
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700">
          <input
            type="checkbox"
            className="rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
            checked={comparePeriod}
            onChange={(event) => onCompareChange(event.target.checked)}
          />
          Compare to previous period
        </label>
      </div>
    </Card>
  );
}

function TrendChart({
  data,
  basis,
  unit,
  periodLabel,
  onMonthClick
}: {
  data: ChartRow[];
  basis: MetricBasis;
  unit: MetricUnit;
  periodLabel: string;
  onMonthClick: (row: ChartRow) => void;
}) {
  return (
    <SectionCard
      title={basis === "cash" ? "Cash movement by month" : "Invoice activity by month"}
      eyebrow={periodLabel}
      action={<Badge tone="neutral">{unit === "amount" ? "Amount basis" : "Count basis"}</Badge>}
    >
      <p className="-mt-1 mb-3 text-sm leading-6 text-ink-600">
        {basis === "cash"
          ? "Collected receivables and paid payables based on completed payment dates."
          : "Recorded invoice totals based on invoice issue dates."}
      </p>
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <BarChart
            data={data}
            margin={chartMargin}
            onClick={(event) => {
              const row = getChartClickPayload(event);
              if (row) {
                onMonthClick(row);
              }
            }}
          >
            <CartesianGrid stroke="#ececea" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "#59564f" }} />
            <YAxis
              tickFormatter={(value) => formatAxisValue(Number(value), unit)}
              tickLine={false}
              axisLine={false}
              width={chartAxisWidth}
              tickMargin={10}
              tick={{ fill: "#59564f" }}
            />
            <Tooltip content={<AnalyticsTooltip unit={unit} definition={basis === "cash" ? "Cash basis: amount paid on completed invoices." : "Invoice basis: amount recorded by invoice date."} />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 700 }} />
            <Bar dataKey="receivables" fill="#0a876b" radius={[6, 6, 0, 0]} />
            <Bar dataKey="payables" fill="#17accb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

function ExposureChart({ data, onPointClick }: { data: ChartRow[]; onPointClick: (row: ChartRow) => void }) {
  return (
    <SectionCard title="Open exposure over time" eyebrow="Receivables vs payables">
      <p className="-mt-1 mb-3 text-sm leading-6 text-ink-600">
        Open receivable and payable balances grouped by due month, with net exposure shown as a line.
      </p>
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <LineChart
            data={data}
            margin={chartMargin}
            onClick={(event) => {
              const row = getChartClickPayload(event);
              if (row) {
                onPointClick(row);
              }
            }}
          >
            <CartesianGrid stroke="#ececea" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "#59564f" }} />
            <YAxis
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              tickLine={false}
              axisLine={false}
              width={chartAxisWidth}
              tickMargin={10}
              tick={{ fill: "#59564f" }}
            />
            <Tooltip content={<AnalyticsTooltip unit="amount" definition="Open balance by invoice due month." />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 700 }} />
            <Line type="linear" dataKey="openReceivables" stroke="#0a876b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="linear" dataKey="openPayables" stroke="#17accb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="linear" dataKey="netExposure" stroke="#42403b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

function DistributionPanel({
  title,
  subtitle,
  data,
  unit,
  colors,
  onSliceClick
}: {
  title: string;
  subtitle: string;
  data: Array<{ name: string; value: number }>;
  unit: MetricUnit;
  colors: Record<string, string>;
  onSliceClick: (name: string) => void;
}) {
  return (
    <SectionCard title={title} eyebrow="Classification">
      <p className="-mt-1 mb-3 text-sm leading-6 text-ink-600">{subtitle}</p>
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4} strokeWidth={0}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={colors[entry.name] ?? "#d9d8d3"} onClick={() => onSliceClick(entry.name)} className="cursor-pointer" />
              ))}
            </Pie>
            <Tooltip content={<AnalyticsTooltip unit={unit} definition="Click a segment to inspect matching invoices." />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 700 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

function ConcentrationPanel({
  title,
  data,
  basis,
  onBasisChange,
  onSelect
}: {
  title: string;
  data: Array<{ name: string; value: number; share: number; count: number }>;
  basis: ConcentrationBasis;
  onBasisChange: (basis: ConcentrationBasis) => void;
  onSelect: (name: string) => void;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <SectionCard
      title={title}
      eyebrow="Concentration"
      action={
        <select
          className="h-9 rounded-lg border-ink-200 text-sm font-semibold focus:border-emerald-600 focus:ring-emerald-600"
          value={basis}
          onChange={(event) => onBasisChange(event.target.value as ConcentrationBasis)}
        >
          <option value="outstanding">Outstanding</option>
          <option value="overdue">Overdue</option>
          <option value="invoice">Invoiced total</option>
          <option value="paid">Paid this period</option>
        </select>
      }
    >
      <div className="space-y-4">
        {data.length ? data.map((item) => (
          <button key={item.name} type="button" className="block w-full text-left" onClick={() => onSelect(item.name)}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-800">{item.name}</p>
                <p className="mt-1 text-xs font-semibold text-ink-500">{item.count} invoice{item.count === 1 ? "" : "s"} | {item.share}% share</p>
              </div>
              <p className="shrink-0 font-bold text-ink-900">{formatCompactCurrency(item.value)}</p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
            </div>
          </button>
        )) : (
          <p className="text-sm leading-6 text-ink-500">No concentration data for the current scope.</p>
        )}
      </div>
    </SectionCard>
  );
}

function DynamicInsights({
  insights,
  onOpen
}: {
  insights: Array<DrillTarget & { tone: "emerald" | "garnet" | "citrine" | "peacock" }>;
  onOpen: (target: DrillTarget) => void;
}) {
  return (
    <SectionCard title="Evidence-based insights" eyebrow="Readout">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => (
          <button
            key={insight.title}
            type="button"
            className="rounded-lg border border-ink-100 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/35"
            onClick={() => onOpen(insight)}
          >
            <div className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              insight.tone === "emerald" && "bg-emerald-50 text-emerald-700",
              insight.tone === "garnet" && "bg-garnet-50 text-garnet-700",
              insight.tone === "citrine" && "bg-citrine-50 text-citrine-800",
              insight.tone === "peacock" && "bg-peacock-50 text-peacock-700"
            )}>
              <ArrowUpRight className="size-4" />
            </div>
            <p className="mt-3 font-bold text-ink-900">{insight.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{insight.description}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
              {insight.invoices.length} linked invoice{insight.invoices.length === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function DrilldownPanel({ target, onClear }: { target: DrillTarget | null; onClear: () => void }) {
  return (
    <SectionCard
      title="Drill-through"
      eyebrow="Invoice detail"
      action={target ? <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button> : null}
    >
      {target ? (
        <div>
          <p className="font-bold text-ink-900">{target.title}</p>
          <p className="mt-1 text-sm leading-6 text-ink-600">{target.description}</p>
          <div className="mt-4 space-y-3">
            {target.invoices.slice(0, 8).map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="block rounded-lg border border-ink-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
                    <p className="mt-1 text-xs font-semibold text-ink-500">{invoice.invoiceNumber}</p>
                  </div>
                  <Badge tone={invoice.type === "receivable" ? "emerald" : "peacock"}>
                    {invoice.type === "receivable" ? "Collect" : "Pay"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-black text-ink-900">{formatCurrency(invoiceBalance(invoice) || invoice.amountPaid, invoice.currency)}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink-500">
          Click a chart segment, month, concentration row, or insight to inspect the invoices behind it.
        </p>
      )}
    </SectionCard>
  );
}

function RatioTile({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-4">
      <p className="text-sm font-semibold text-ink-500">{title}</p>
      <p className="mt-2 text-xl font-black text-ink-900">{value}</p>
      <p className="mt-2 text-sm leading-5 text-ink-600">{detail}</p>
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="field-label text-ink-600">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-h-11 grid-cols-2 rounded-lg border border-ink-200 bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "rounded-md px-2 text-sm font-semibold transition",
            value === option.value ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AnalyticsTooltip({
  active,
  payload,
  label,
  unit,
  definition
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  unit?: MetricUnit;
  definition?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="max-w-xs rounded-lg border border-ink-200 bg-white p-3 shadow-luxury">
      <p className="text-sm font-bold text-ink-900">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <p key={item.name} className="text-sm text-ink-600">
            <span className="font-semibold capitalize" style={{ color: item.color }}>
              {item.name}:
            </span>{" "}
            {unit === "count" ? Number(item.value ?? 0) : formatCurrency(Number(item.value ?? 0))}
          </p>
        ))}
      </div>
      {definition ? <p className="mt-2 text-xs leading-5 text-ink-500">{definition}</p> : null}
    </div>
  );
}

function getChartClickPayload(event: unknown): ChartRow | null {
  const payload = (event as { activePayload?: Array<{ payload?: ChartRow }> } | null)?.activePayload?.[0]?.payload;
  return payload ?? null;
}

function getPeriod(range: DateRangeKey, today: Date, customStart: string, customEnd: string) {
  if (range === "custom") {
    return {
      start: parseAppDate(customStart),
      end: parseAppDate(customEnd),
      label: `${customStart} to ${customEnd}`
    };
  }

  if (range === "30d") {
    return { start: subDays(today, 29), end: today, label: "Last 30 days" };
  }

  if (range === "12m") {
    return { start: subMonths(today, 11), end: today, label: "Last 12 months" };
  }

  return { start: subDays(today, 89), end: today, label: "Last 90 days" };
}

function getPreviousPeriod(period: { start: Date; end: Date; label: string }) {
  const days = differenceInCalendarDays(period.end, period.start) + 1;
  return {
    start: subDays(period.start, days),
    end: subDays(period.start, 1),
    label: "Previous period"
  };
}

function isInPeriod(dateValue: string, period: { start: Date; end: Date }) {
  const date = parseAppDate(dateValue);
  return !isBefore(date, period.start) && !isAfter(date, period.end);
}

function getBasisDate(invoice: Invoice, basis: MetricBasis) {
  return basis === "cash" && (invoice.status === "Paid" || invoice.amountPaid > 0)
    ? invoice.updatedAt
    : invoice.invoiceDate;
}

function matchesType(invoice: Invoice, typeFilter: TypeFilter) {
  return typeFilter === "all" || invoice.type === typeFilter;
}

function matchesStatus(invoice: Invoice, statusFilter: StatusFilter) {
  if (statusFilter === "open") {
    return isInvoiceOpen(invoice);
  }

  if (statusFilter === "paid") {
    return invoice.status === "Paid" || invoiceBalance(invoice) <= 0;
  }

  if (statusFilter === "overdue") {
    return isInvoiceOpen(invoice) && getTimingBucket(invoice) === "Overdue";
  }

  return true;
}

function cashMovement(invoices: Invoice[], type: InvoiceType) {
  return invoices
    .filter((invoice) => invoice.type === type)
    .reduce((total, invoice) => total + invoice.amountPaid, 0);
}

function invoiceActivity(invoices: Invoice[], type: InvoiceType) {
  return invoices
    .filter((invoice) => invoice.type === type)
    .reduce((total, invoice) => total + invoice.amount, 0);
}

function getAveragePaymentDelay(invoices: Invoice[]) {
  const paid = invoices.filter((invoice) => invoice.status === "Paid" || invoiceBalance(invoice) <= 0);
  const delayed = paid.map((invoice) =>
    Math.max(0, differenceInCalendarDays(parseAppDate(invoice.updatedAt), parseAppDate(invoice.dueDate)))
  );

  if (!delayed.length) {
    return { days: 0, sample: 0 };
  }

  return {
    days: Math.round(delayed.reduce((total, value) => total + value, 0) / delayed.length),
    sample: delayed.length
  };
}

function getAveragePaymentTerms(invoices: Invoice[]) {
  if (!invoices.length) {
    return { days: 0, sample: 0 };
  }

  const total = invoices.reduce(
    (sum, invoice) => sum + Math.max(0, differenceInCalendarDays(parseAppDate(invoice.dueDate), parseAppDate(invoice.invoiceDate))),
    0
  );

  return { days: Math.round(total / invoices.length), sample: invoices.length };
}

function getMonthlyTrend(invoices: Invoice[], basis: MetricBasis, unit: MetricUnit, today: Date) {
  return lastTwelveMonths(today).map((month) => {
    const monthInvoices = invoices.filter((invoice) => isSameMonth(parseAppDate(getBasisDate(invoice, basis)), month.date));

    return {
      month: month.label,
      receivables:
        unit === "count"
          ? monthInvoices.filter((invoice) => invoice.type === "receivable").length
          : basis === "cash"
            ? cashMovement(monthInvoices, "receivable")
            : invoiceActivity(monthInvoices, "receivable"),
      payables:
        unit === "count"
          ? monthInvoices.filter((invoice) => invoice.type === "payable").length
          : basis === "cash"
            ? cashMovement(monthInvoices, "payable")
            : invoiceActivity(monthInvoices, "payable")
    };
  });
}

function getExposureSeries(invoices: Invoice[], today: Date) {
  return lastTwelveMonths(today).map((month) => {
    const dueInMonth = invoices.filter((invoice) => isSameMonth(parseAppDate(invoice.dueDate), month.date) && isInvoiceOpen(invoice));
    const openReceivables = dueInMonth
      .filter((invoice) => invoice.type === "receivable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
    const openPayables = dueInMonth
      .filter((invoice) => invoice.type === "payable")
      .reduce((total, invoice) => total + invoiceBalance(invoice), 0);

    return {
      month: month.label,
      openReceivables,
      openPayables,
      netExposure: openReceivables - openPayables
    };
  });
}

function getStatusMix(invoices: Invoice[], unit: MetricUnit) {
  const included = ["Draft", "Pending", "Partially Paid", "Paid", "Cancelled"];
  return included
    .map((status) => {
      const matching = invoices.filter((invoice) => getStatusCategory(invoice) === status);
      return {
        name: status,
        value: unit === "count" ? matching.length : matching.reduce((total, invoice) => total + invoice.amount, 0)
      };
    })
    .filter((item) => item.value > 0);
}

function getStatusCategory(invoice: Invoice) {
  if (invoice.status === "Overdue" || invoice.status === "Due Soon") {
    return "Pending";
  }

  return invoice.status;
}

function getTimingMix(openInvoices: Invoice[], unit: MetricUnit) {
  const buckets = ["Current", "Due Soon", "Due Today", "Overdue"];
  return buckets
    .map((bucket) => {
      const matching = openInvoices.filter((invoice) => getTimingBucket(invoice) === bucket);
      return {
        name: bucket,
        value: unit === "count" ? matching.length : matching.reduce((total, invoice) => total + invoiceBalance(invoice), 0)
      };
    })
    .filter((item) => item.value > 0);
}

function getTimingBucket(invoice: Invoice) {
  const days = daysUntil(invoice.dueDate);

  if (days < 0) {
    return "Overdue";
  }

  if (days === 0) {
    return "Due Today";
  }

  if (days <= 7) {
    return "Due Soon";
  }

  return "Current";
}

function getConcentration(invoices: Invoice[], basis: ConcentrationBasis, limit: number) {
  const totals = invoices.reduce<Record<string, { value: number; count: number }>>((acc, invoice) => {
    const value = getConcentrationValue(invoice, basis);
    if (!acc[invoice.partyName]) {
      acc[invoice.partyName] = { value: 0, count: 0 };
    }
    acc[invoice.partyName].value += value;
    acc[invoice.partyName].count += 1;
    return acc;
  }, {});
  const grandTotal = Object.values(totals).reduce((total, item) => total + item.value, 0);

  return Object.entries(totals)
    .map(([name, item]) => ({
      name,
      value: item.value,
      count: item.count,
      share: percentage(item.value, grandTotal)
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function getConcentrationValue(invoice: Invoice, basis: ConcentrationBasis) {
  if (basis === "outstanding") {
    return isInvoiceOpen(invoice) ? invoiceBalance(invoice) : 0;
  }

  if (basis === "overdue") {
    return isInvoiceOpen(invoice) && getTimingBucket(invoice) === "Overdue" ? invoiceBalance(invoice) : 0;
  }

  if (basis === "paid") {
    return invoice.amountPaid;
  }

  return invoice.amount;
}

function getDynamicInsights({
  scoped,
  open,
  receivables,
  payables,
  topCustomers,
  topVendors,
  overdueAmount,
  openAmount,
  cashCollected,
  previousCollected,
  cashPaid,
  previousPaid
}: {
  scoped: Invoice[];
  open: Invoice[];
  receivables: Invoice[];
  payables: Invoice[];
  topCustomers: Array<{ name: string; value: number; share: number; count: number }>;
  topVendors: Array<{ name: string; value: number; share: number; count: number }>;
  overdueAmount: number;
  openAmount: number;
  cashCollected: number;
  previousCollected: number;
  cashPaid: number;
  previousPaid: number;
}) {
  const overdueReceivables = receivables.filter((invoice) => isInvoiceOpen(invoice) && getTimingBucket(invoice) === "Overdue");
  const overdueReceivableAmount = overdueReceivables.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
  const openReceivableAmount = receivables.filter(isInvoiceOpen).reduce((total, invoice) => total + invoiceBalance(invoice), 0);
  const duePayables7 = payables.filter((invoice) => isInvoiceOpen(invoice) && daysUntil(invoice.dueDate) >= 0 && daysUntil(invoice.dueDate) <= 7);
  const top3CustomerShare = topCustomers.slice(0, 3).reduce((total, item) => total + item.share, 0);
  const collectionChange = percentChange(cashCollected, previousCollected);
  const paymentChange = percentChange(cashPaid, previousPaid);

  return [
    {
      title: "Overdue receivable exposure",
      description: `${formatCurrency(overdueReceivableAmount)} is overdue, representing ${percentage(overdueReceivableAmount, openReceivableAmount)}% of open receivables.`,
      invoices: overdueReceivables,
      tone: "garnet" as const
    },
    {
      title: "Customer concentration",
      description: topCustomers.length
        ? `Top 3 customers represent ${top3CustomerShare}% of receivable exposure.`
        : "No customer exposure in the current scope.",
      invoices: scoped.filter((invoice) => invoice.type === "receivable" && topCustomers.slice(0, 3).some((item) => item.name === invoice.partyName)),
      tone: "peacock" as const
    },
    {
      title: "Collections movement",
      description: `Collections ${collectionChange >= 0 ? "rose" : "fell"} by ${Math.abs(collectionChange)}% versus the previous period.`,
      invoices: receivables.filter((invoice) => invoice.amountPaid > 0),
      tone: collectionChange >= 0 ? "emerald" as const : "citrine" as const
    },
    {
      title: "Payables due soon",
      description: `${formatCurrency(duePayables7.reduce((total, invoice) => total + invoiceBalance(invoice), 0))} is due in the next 7 days across ${new Set(duePayables7.map((invoice) => invoice.partyName)).size} vendors.`,
      invoices: duePayables7,
      tone: "citrine" as const
    },
    {
      title: "Vendor concentration",
      description: topVendors.length
        ? `${topVendors[0].name} is the largest payable exposure at ${topVendors[0].share}% of the vendor total.`
        : "No vendor exposure in the current scope.",
      invoices: scoped.filter((invoice) => invoice.type === "payable" && topVendors[0]?.name === invoice.partyName),
      tone: "peacock" as const
    },
    {
      title: "Open risk ratio",
      description: `${percentage(overdueAmount, openAmount)}% of open exposure is overdue. Payments ${paymentChange >= 0 ? "increased" : "decreased"} ${Math.abs(paymentChange)}% versus the previous period.`,
      invoices: open.filter((invoice) => getTimingBucket(invoice) === "Overdue"),
      tone: overdueAmount > 0 ? "garnet" as const : "emerald" as const
    }
  ];
}

function compareText(current: number, previous: number, enabled: boolean) {
  if (!enabled) {
    return "Comparison disabled";
  }

  const change = percentChange(current, previous);
  return `${change >= 0 ? "+" : ""}${change}% vs previous period`;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function formatAxisValue(value: number, unit: MetricUnit) {
  return unit === "count" ? String(value) : formatCompactCurrency(value);
}

function lastTwelveMonths(today: Date) {
  return Array.from({ length: 12 }).map((_, index) => {
    const date = startOfMonth(subMonths(today, 11 - index));
    return {
      date,
      label: format(date, "MMM")
    };
  });
}
