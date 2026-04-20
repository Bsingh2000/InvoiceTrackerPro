import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameMonth,
  startOfMonth,
  subMonths
} from "date-fns";

import { getAppToday, parseAppDate } from "@/lib/date-utils";
import {
  daysUntil,
  invoiceBalance,
  isInvoiceOpen,
  isInvoiceOverdue,
  percentage
} from "@/lib/format";
import type { AppNotification, Invoice, InvoiceStatus, InvoiceType } from "@/lib/types";

type ChartRow = Record<string, string | number>;

const statusRank: Record<InvoiceStatus, number> = {
  Overdue: 0,
  "Due Soon": 1,
  "Partially Paid": 2,
  Pending: 3,
  Draft: 4,
  Paid: 5,
  Cancelled: 6
};

export function sortInvoicesByUrgency(invoices: Invoice[]) {
  return [...invoices].sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return parseAppDate(a.dueDate).getTime() - parseAppDate(b.dueDate).getTime();
  });
}

export function sumBalances(invoices: Invoice[], type?: InvoiceType) {
  return invoices
    .filter((invoice) => (type ? invoice.type === type : true))
    .filter(isInvoiceOpen)
    .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
}

export function getDashboardMetrics(invoices: Invoice[]) {
  const now = getAppToday();
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const openInvoices = invoices.filter(isInvoiceOpen);
  const overdue = invoices.filter(isInvoiceOverdue);
  const dueThisWeek = openInvoices.filter((invoice) => {
    const dueDate = parseAppDate(invoice.dueDate);
    return !isBefore(dueDate, now) && !isAfter(dueDate, weekEnd);
  });
  const dueToday = openInvoices.filter((invoice) => daysUntil(invoice.dueDate) === 0);
  const paidThisMonth = invoices.filter(
    (invoice) =>
      invoice.status === "Paid" && !isBefore(parseAppDate(invoice.updatedAt), monthStart)
  );
  const outstandingThisMonth = openInvoices.filter((invoice) =>
    isSameMonth(parseAppDate(invoice.dueDate), now)
  );
  const forecastLimit = addDays(now, 30);

  const collectionForecast = openInvoices
    .filter(
      (invoice) =>
        invoice.type === "receivable" && !isAfter(parseAppDate(invoice.dueDate), forecastLimit)
    )
    .reduce((total, invoice) => total + invoiceBalance(invoice), 0);

  const paymentsForecast = openInvoices
    .filter(
      (invoice) =>
        invoice.type === "payable" && !isAfter(parseAppDate(invoice.dueDate), forecastLimit)
    )
    .reduce((total, invoice) => total + invoiceBalance(invoice), 0);

  return {
    totalInvoices: invoices.length,
    totalReceivables: sumBalances(invoices, "receivable"),
    totalPayables: sumBalances(invoices, "payable"),
    overdueCount: overdue.length,
    dueThisWeekCount: dueThisWeek.length,
    dueTodayCount: dueToday.length,
    paidThisMonth: paidThisMonth.reduce((total, invoice) => total + invoice.amountPaid, 0),
    outstandingThisMonth: outstandingThisMonth.reduce(
      (total, invoice) => total + invoiceBalance(invoice),
      0
    ),
    collectionForecast,
    paymentsForecast,
    openAmount: openInvoices.reduce((total, invoice) => total + invoiceBalance(invoice), 0),
    paidRatio: percentage(
      invoices.filter((invoice) => invoice.status === "Paid").length,
      invoices.length
    )
  };
}

export function getMonthlyInvoiceTotals(invoices: Invoice[]): ChartRow[] {
  return lastSixMonths().map((month) => {
    const monthInvoices = invoices.filter((invoice) =>
      isSameMonth(parseAppDate(invoice.invoiceDate), month.date)
    );

    return {
      month: month.label,
      invoices: monthInvoices.reduce((total, invoice) => total + invoice.amount, 0),
      count: monthInvoices.length
    };
  });
}

export function getReceivablePayableSeries(invoices: Invoice[]): ChartRow[] {
  return lastSixMonths().map((month) => {
    const monthInvoices = invoices.filter((invoice) =>
      isSameMonth(parseAppDate(invoice.invoiceDate), month.date)
    );

    return {
      month: month.label,
      receivables: monthInvoices
        .filter((invoice) => invoice.type === "receivable")
        .reduce((total, invoice) => total + invoice.amount, 0),
      payables: monthInvoices
        .filter((invoice) => invoice.type === "payable")
        .reduce((total, invoice) => total + invoice.amount, 0)
    };
  });
}

export function getPaidUnpaidDistribution(invoices: Invoice[]) {
  const paid = invoices.filter((invoice) => invoice.status === "Paid").length;

  return [
    { name: "Paid", value: paid },
    { name: "Open", value: invoices.length - paid }
  ];
}

export function getStatusDistribution(invoices: Invoice[]) {
  const counts = invoices.reduce<Record<InvoiceStatus, number>>(
    (acc, invoice) => {
      acc[invoice.status] += 1;
      return acc;
    },
    {
      Draft: 0,
      Pending: 0,
      "Due Soon": 0,
      Overdue: 0,
      Paid: 0,
      "Partially Paid": 0,
      Cancelled: 0
    }
  );

  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
}

export function getUpcomingDueByWeek(invoices: Invoice[]): ChartRow[] {
  const openInvoices = invoices.filter(isInvoiceOpen);
  const now = getAppToday();

  return [0, 1, 2, 3].map((week) => {
    const start = addDays(now, week * 7);
    const end = addDays(start, 6);
    const weekInvoices = openInvoices.filter((invoice) => {
      const dueDate = parseAppDate(invoice.dueDate);
      return !isBefore(dueDate, start) && !isAfter(dueDate, end);
    });

    return {
      week: week === 0 ? "This week" : `Week ${week + 1}`,
      receivables: weekInvoices
        .filter((invoice) => invoice.type === "receivable")
        .reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      payables: weekInvoices
        .filter((invoice) => invoice.type === "payable")
        .reduce((total, invoice) => total + invoiceBalance(invoice), 0)
    };
  });
}

export function getPartyBreakdown(invoices: Invoice[], type?: InvoiceType, limit = 5) {
  const totals = invoices
    .filter((invoice) => (type ? invoice.type === type : true))
    .reduce<Record<string, number>>((acc, invoice) => {
      acc[invoice.partyName] = (acc[invoice.partyName] ?? 0) + invoice.amount;
      return acc;
    }, {});

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

export function getAgingBuckets(invoices: Invoice[], type: InvoiceType) {
  const open = invoices.filter((invoice) => invoice.type === type && isInvoiceOpen(invoice));
  const buckets = [
    { label: "Current", amount: 0, count: 0 },
    { label: "1-15 days", amount: 0, count: 0 },
    { label: "16-30 days", amount: 0, count: 0 },
    { label: "31+ days", amount: 0, count: 0 }
  ];

  open.forEach((invoice) => {
    const days = daysUntil(invoice.dueDate);
    const balance = invoiceBalance(invoice);
    let index = 0;

    if (days < 0 && Math.abs(days) <= 15) {
      index = 1;
    } else if (days < 0 && Math.abs(days) <= 30) {
      index = 2;
    } else if (days < 0) {
      index = 3;
    }

    buckets[index].amount += balance;
    buckets[index].count += 1;
  });

  return buckets;
}

export function getNotifications(invoices: Invoice[]): AppNotification[] {
  const open = invoices.filter(isInvoiceOpen);
  const notifications: AppNotification[] = [];

  open.forEach((invoice) => {
    const dueIn = daysUntil(invoice.dueDate);
    const common = {
      invoiceId: invoice.id,
      dueDate: invoice.dueDate,
      amount: invoiceBalance(invoice),
      currency: invoice.currency,
      priority: invoice.priority
    };

    if (dueIn < 0) {
      notifications.push({
        ...common,
        id: `overdue-${invoice.id}`,
        type: "overdue",
        title: `${invoice.partyName} is overdue`,
        description: `${invoice.invoiceNumber} is ${Math.abs(dueIn)} day${
          Math.abs(dueIn) === 1 ? "" : "s"
        } past deadline.`
      });
    } else if (dueIn === 0) {
      notifications.push({
        ...common,
        id: `today-${invoice.id}`,
        type: "due-today",
        title: `${invoice.partyName} is due today`,
        description: `${invoice.invoiceNumber} needs attention before close of business.`
      });
    } else if (dueIn === 1) {
      notifications.push({
        ...common,
        id: `tomorrow-${invoice.id}`,
        type: "due-tomorrow",
        title: `${invoice.partyName} is due tomorrow`,
        description: `${invoice.invoiceNumber} is approaching its payment deadline.`
      });
    } else if (dueIn <= 7) {
      notifications.push({
        ...common,
        id: `deadline-${invoice.id}`,
        type: "deadline",
        title: `${invoice.partyName} is due soon`,
        description: `${invoice.invoiceNumber} is due in ${dueIn} days.`
      });
    }

    if (invoiceBalance(invoice) >= 20000 && dueIn <= 14) {
      notifications.push({
        ...common,
        id: `large-${invoice.id}`,
        type: "large-value",
        title: `Large-value invoice needs review`,
        description: `${invoice.invoiceNumber} carries a material balance for ${invoice.partyName}.`
      });
    }
  });

  const severity = {
    overdue: 0,
    "due-today": 1,
    "large-value": 2,
    "due-tomorrow": 3,
    deadline: 4
  };

  return notifications.sort((a, b) => severity[a.type] - severity[b.type]);
}

export function getRecentInvoices(invoices: Invoice[], limit = 5) {
  return [...invoices]
    .sort((a, b) => parseAppDate(b.updatedAt).getTime() - parseAppDate(a.updatedAt).getTime())
    .slice(0, limit);
}

export function getAveragePaymentDelay(invoices: Invoice[]) {
  const paid = invoices.filter((invoice) => invoice.status === "Paid");
  if (!paid.length) {
    return 0;
  }

  const total = paid.reduce((sum, invoice) => {
    return (
      sum +
      Math.max(0, differenceInCalendarDays(parseAppDate(invoice.updatedAt), parseAppDate(invoice.dueDate)))
    );
  }, 0);

  return Math.round(total / paid.length);
}

export function getAverageCollectionTime(invoices: Invoice[]) {
  const paidReceivables = invoices.filter(
    (invoice) => invoice.type === "receivable" && invoice.status === "Paid"
  );

  if (!paidReceivables.length) {
    return 0;
  }

  const total = paidReceivables.reduce((sum, invoice) => {
    return sum + differenceInCalendarDays(parseAppDate(invoice.dueDate), parseAppDate(invoice.invoiceDate));
  }, 0);

  return Math.round(total / paidReceivables.length);
}

export function getOutstandingOverTime(invoices: Invoice[]): ChartRow[] {
  return lastSixMonths().map((month) => {
    const monthInvoices = invoices.filter((invoice) =>
      isSameMonth(parseAppDate(invoice.dueDate), month.date)
    );

    return {
      month: month.label,
      outstanding: monthInvoices
        .filter(isInvoiceOpen)
        .reduce((total, invoice) => total + invoiceBalance(invoice), 0),
      paid: monthInvoices.reduce((total, invoice) => total + invoice.amountPaid, 0)
    };
  });
}

export function getMonthComparison(invoices: Invoice[], type: InvoiceType) {
  const now = getAppToday();
  const lastMonth = subMonths(now, 1);

  const current = invoices
    .filter((invoice) => invoice.type === type && isSameMonth(parseAppDate(invoice.invoiceDate), now))
    .reduce((total, invoice) => total + invoice.amount, 0);

  const previous = invoices
    .filter(
      (invoice) => invoice.type === type && isSameMonth(parseAppDate(invoice.invoiceDate), lastMonth)
    )
    .reduce((total, invoice) => total + invoice.amount, 0);

  const delta = current - previous;
  const change = previous === 0 ? 100 : Math.round((delta / previous) * 100);

  return { current, previous, delta, change };
}

function lastSixMonths() {
  return Array.from({ length: 6 })
    .map((_, index) => {
      const date = subMonths(getAppToday(), 5 - index);
      return {
        date,
        label: format(date, "MMM")
      };
    });
}
