"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { type ReactNode, useEffect, useState } from "react";

import { SectionCard } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

type ChartRow = Record<string, string | number>;

const chartPalette = ["#0a876b", "#17accb", "#77dfbd", "#78e0f2", "#d9d8d3"];
const statusPalette: Record<string, string> = {
  Paid: "#0a876b",
  "Due Soon": "#d99a08",
  Overdue: "#c91f43",
  Draft: "#939086",
  Pending: "#17accb",
  "Partially Paid": "#7c3aed",
  Cancelled: "#42403b",
  Open: "#17accb"
};
const responsiveChartProps = {
  initialDimension: { width: 640, height: 288 },
  minWidth: 1,
  minHeight: 288
};

export function ChartFrame({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-72 min-w-0 animate-pulse items-center justify-center rounded-lg bg-ink-50 text-sm font-semibold text-ink-400">
        Preparing chart
      </div>
    );
  }

  return <div className="h-72 min-w-0">{children}</div>;
}

function MoneyTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 shadow-luxury">
      <p className="text-sm font-bold text-ink-900">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <p key={item.name} className="text-sm text-ink-600">
            <span className="font-semibold capitalize" style={{ color: item.color }}>
              {item.name}:
            </span>{" "}
            {formatCurrency(Number(item.value ?? 0))}
          </p>
        ))}
      </div>
    </div>
  );
}

export function MonthlyTotalsChart({ data }: { data: ChartRow[] }) {
  return (
    <SectionCard title="Monthly trend" eyebrow="Invoice volume">
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <AreaChart data={data} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="invoiceTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0a876b" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0a876b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ececea" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#59564f" }} />
            <YAxis
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              tickLine={false}
              axisLine={false}
              width={58}
              tick={{ fill: "#59564f" }}
            />
            <Tooltip content={<MoneyTooltip />} />
            <Area
              type="monotone"
              dataKey="invoices"
              stroke="#0a876b"
              strokeWidth={3}
              fill="url(#invoiceTotal)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

export function ReceivablePayableChart({ data }: { data: ChartRow[] }) {
  return (
    <SectionCard title="Cash flow" eyebrow="Receivables vs payables">
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <BarChart data={data} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#ececea" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#59564f" }} />
            <YAxis
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              tickLine={false}
              axisLine={false}
              width={58}
              tick={{ fill: "#59564f" }}
            />
            <Tooltip content={<MoneyTooltip />} />
            <Legend
              iconType="circle"
              wrapperStyle={{ paddingTop: 12, fontSize: 12, fontWeight: 700 }}
            />
            <Bar dataKey="receivables" fill="#0a876b" radius={[6, 6, 0, 0]} />
            <Bar dataKey="payables" fill="#17accb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

export function UpcomingDueChart({ data }: { data: ChartRow[] }) {
  return (
    <SectionCard title="Due schedule" eyebrow="Next four weeks">
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <BarChart data={data} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#ececea" vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: "#59564f" }} />
            <YAxis
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              tickLine={false}
              axisLine={false}
              width={58}
              tick={{ fill: "#59564f" }}
            />
            <Tooltip content={<MoneyTooltip />} />
            <Legend
              iconType="circle"
              wrapperStyle={{ paddingTop: 12, fontSize: 12, fontWeight: 700 }}
            />
            <Bar dataKey="receivables" stackId="due" fill="#0a876b" radius={[6, 6, 0, 0]} />
            <Bar dataKey="payables" stackId="due" fill="#17accb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

export function DistributionChart({
  title,
  eyebrow,
  data
}: {
  title: string;
  eyebrow: string;
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <SectionCard title={title} eyebrow={eyebrow}>
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" {...responsiveChartProps}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={4}
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={statusPalette[entry.name] ?? chartPalette[index % chartPalette.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend
              iconType="circle"
              wrapperStyle={{ paddingTop: 12, fontSize: 12, fontWeight: 700 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
    </SectionCard>
  );
}

export function PartyBreakdown({ data, title }: { data: Array<{ name: string; value: number }>; title: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <SectionCard title={title} eyebrow="Concentration">
      <div className="space-y-4">
        {data.map((item, index) => (
          <div key={item.name}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <p className="min-w-0 truncate font-semibold text-ink-800">{item.name}</p>
              <p className="shrink-0 font-bold text-ink-900">{formatCompactCurrency(item.value)}</p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-ink-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  backgroundColor: chartPalette[index % chartPalette.length]
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
