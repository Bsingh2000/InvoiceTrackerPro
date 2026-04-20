"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Plus,
  Send
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TypeBadge } from "@/components/invoices/type-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { getAppToday, parseAppDate } from "@/lib/date-utils";
import {
  daysUntil,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatShortDate,
  invoiceBalance,
  isInvoiceOpen
} from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

const largeThreshold = 20000;
const weekStartsOn = 1 as const;

const filters = [
  { label: "All", value: "all" },
  { label: "Collect", value: "collect" },
  { label: "Pay", value: "pay" },
  { label: "Overdue", value: "overdue" },
  { label: "Large value", value: "large" },
  { label: "This week", value: "thisWeek" }
] as const;

const viewModes = ["month", "week", "agenda"] as const;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarFilter = (typeof filters)[number]["value"];
type ViewMode = (typeof viewModes)[number];
type TimingState = {
  label: "Current" | "Due soon" | "Due today" | "Overdue";
  detail: string;
  tone: "neutral" | "emerald" | "citrine" | "garnet";
};

export function CalendarView() {
  const { invoices, markAsPaid } = useInvoices();
  const { notify } = useToast();
  const today = useMemo(() => getAppToday(), []);
  const [cursorMonth, setCursorMonth] = useState(startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("all");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setViewMode("agenda");
    }
  }, []);

  const data = useMemo(() => {
    const open = invoices.filter(isInvoiceOpen);
    const filteredOpen = open.filter((invoice) => matchesFilter(invoice, activeFilter, today));
    const monthStart = startOfMonth(cursorMonth);
    const monthEnd = endOfMonth(cursorMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const weekStart = startOfWeek(selectedDate, { weekStartsOn });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const overdue = open
      .filter((invoice) => getTimingState(invoice).label === "Overdue")
      .sort(sortByUrgency);
    const dueToday = open
      .filter((invoice) => isSameDay(parseAppDate(invoice.dueDate), today))
      .sort(sortByUrgency);
    const dueThisWeek = open
      .filter((invoice) => {
        const daysToDue = daysUntil(invoice.dueDate);
        return daysToDue >= 0 && daysToDue <= 7;
      })
      .sort(sortByUrgency);
    const dueThisMonth = open
      .filter((invoice) => isSameMonth(parseAppDate(invoice.dueDate), cursorMonth))
      .sort(sortByUrgency);
    const largeUpcoming = open
      .filter((invoice) => invoiceBalance(invoice) >= largeThreshold)
      .sort(sortByUrgency);
    const selectedInvoices = filteredOpen
      .filter((invoice) => isSameDay(parseAppDate(invoice.dueDate), selectedDate))
      .sort(sortByUrgency);
    const agenda = filteredOpen.sort(sortByUrgency);

    return {
      open,
      filteredOpen,
      days,
      weekDays,
      overdue,
      dueToday,
      dueThisWeek,
      dueThisMonth,
      largeUpcoming,
      selectedInvoices,
      agenda
    };
  }, [activeFilter, cursorMonth, invoices, selectedDate, today]);

  function goToToday() {
    setCursorMonth(startOfMonth(today));
    setSelectedDate(today);
    setExpandedDate(null);
  }

  function handleDaySelect(day: Date) {
    setSelectedDate(day);
    setExpandedDate(null);
  }

  function handleMore(day: Date) {
    setSelectedDate(day);
    setExpandedDate(format(day, "yyyy-MM-dd"));
  }

  function sendReminder(invoice: Invoice) {
    notify({
      title: "Reminder queued",
      description: `${invoice.invoiceNumber} reminder is ready for ${invoice.partyName}.`,
      variant: "info"
    });
  }

  function schedulePayment(invoice: Invoice) {
    notify({
      title: "Payment scheduled",
      description: `${invoice.invoiceNumber} is queued for ${invoice.paymentMethod || "payment release"}.`,
      variant: "info"
    });
  }

  function recordPayment(invoice: Invoice) {
    markAsPaid(invoice.id);
    notify({
      title: invoice.type === "receivable" ? "Payment recorded" : "Payable marked paid",
      description: `${invoice.invoiceNumber} is now settled.`,
      variant: "success"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Due date planning"
        title="Calendar"
        description="Plan collection deadlines, vendor payments, overdue follow-up, and material cash movements from one scheduling workspace."
        action={
          <ButtonLink href="/invoices/new">
            <Plus className="size-4" />
            Add invoice
          </ButtonLink>
        }
      />

      <section className="mb-4">
        <CalendarControls
          cursorMonth={cursorMonth}
          viewMode={viewMode}
          activeFilter={activeFilter}
          onPrevious={() => setCursorMonth((current) => subMonths(current, 1))}
          onNext={() => setCursorMonth((current) => addMonths(current, 1))}
          onToday={goToToday}
          onViewChange={setViewMode}
          onFilterChange={setActiveFilter}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SignalCard
          title="Due today"
          count={data.dueToday.length}
          amount={sumBalance(data.dueToday)}
          detail="Needs same-day action"
          tone="citrine"
        />
        <SignalCard
          title="Due this week"
          count={data.dueThisWeek.length}
          amount={sumBalance(data.dueThisWeek)}
          detail="Next 7 calendar days"
          tone="emerald"
        />
        <SignalCard
          title="Overdue"
          count={data.overdue.length}
          amount={sumBalance(data.overdue)}
          detail="Pulled forward until closed"
          tone="garnet"
        />
        <SignalCard
          title="Due this month"
          count={data.dueThisMonth.length}
          amount={sumBalance(data.dueThisMonth)}
          detail={formatNetFlow(data.dueThisMonth)}
          tone="peacock"
        />
      </section>

      {data.overdue.length ? (
        <section className="mt-4">
          <OverdueRibbon invoices={data.overdue} onReminder={sendReminder} onRecordPayment={recordPayment} />
        </section>
      ) : null}

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <div className="space-y-4">
          {viewMode === "month" ? (
            <MonthWorkspace
              cursorMonth={cursorMonth}
              today={today}
              days={data.days}
              invoices={data.filteredOpen}
              selectedDate={selectedDate}
              expandedDate={expandedDate}
              onDaySelect={handleDaySelect}
              onMore={handleMore}
            />
          ) : null}

          {viewMode === "week" ? (
            <WeekWorkspace
              days={data.weekDays}
              today={today}
              invoices={data.filteredOpen}
              selectedDate={selectedDate}
              onDaySelect={handleDaySelect}
            />
          ) : null}

          {viewMode === "agenda" ? (
            <AgendaWorkspace
              invoices={data.agenda}
              onReminder={sendReminder}
              onRecordPayment={recordPayment}
              onSchedulePayment={schedulePayment}
            />
          ) : null}

          <MaterialItems invoices={data.largeUpcoming} />
        </div>

        <ActionAgenda
          selectedDate={selectedDate}
          selectedInvoices={data.selectedInvoices}
          overdue={data.overdue}
          dueToday={data.dueToday}
          dueThisWeek={data.dueThisWeek}
          onReminder={sendReminder}
          onRecordPayment={recordPayment}
          onSchedulePayment={schedulePayment}
        />
      </section>
    </>
  );
}

function CalendarControls({
  cursorMonth,
  viewMode,
  activeFilter,
  onPrevious,
  onNext,
  onToday,
  onViewChange,
  onFilterChange
}: {
  cursorMonth: Date;
  viewMode: ViewMode;
  activeFilter: CalendarFilter;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (viewMode: ViewMode) => void;
  onFilterChange: (filter: CalendarFilter) => void;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onPrevious} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-h-9 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-black text-ink-900">
            {format(cursorMonth, "MMMM yyyy")}
          </div>
          <Button variant="secondary" size="sm" onClick={onNext} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={onToday}>
            Today
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {viewModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "min-h-9 rounded-lg border px-3 text-sm font-semibold capitalize transition",
                viewMode === mode
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              )}
              onClick={() => onViewChange(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={cn(
              "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
              activeFilter === filter.value
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            )}
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function MonthWorkspace({
  cursorMonth,
  today,
  days,
  invoices,
  selectedDate,
  expandedDate,
  onDaySelect,
  onMore
}: {
  cursorMonth: Date;
  today: Date;
  days: Date[];
  invoices: Invoice[];
  selectedDate: Date;
  expandedDate: string | null;
  onDaySelect: (day: Date) => void;
  onMore: (day: Date) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            Month plan
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-900">{format(cursorMonth, "MMMM yyyy")}</h2>
        </div>
        <CalendarLegend />
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
          {weekdays.map((day) => (
            <div key={day} className="px-1 py-3">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayInvoices = getInvoicesForDay(invoices, day);
            return (
              <CalendarDayCell
                key={day.toISOString()}
                day={day}
                cursorMonth={cursorMonth}
                today={today}
                selected={isSameDay(day, selectedDate)}
                invoices={dayInvoices}
                expanded={expandedDate === format(day, "yyyy-MM-dd")}
                onSelect={() => onDaySelect(day)}
                onMore={() => onMore(day)}
              />
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 p-4 md:hidden">
        {days
          .filter((day) => isSameMonth(day, cursorMonth))
          .filter((day) => getInvoicesForDay(invoices, day).length > 0 || isSameDay(day, today))
          .map((day) => (
            <MobileDayCard
              key={day.toISOString()}
              day={day}
              today={today}
              selected={isSameDay(day, selectedDate)}
              invoices={getInvoicesForDay(invoices, day)}
              onSelect={() => onDaySelect(day)}
            />
          ))}
      </div>
    </Card>
  );
}

function CalendarDayCell({
  day,
  cursorMonth,
  today,
  selected,
  invoices,
  expanded,
  onSelect,
  onMore
}: {
  day: Date;
  cursorMonth: Date;
  today: Date;
  selected: boolean;
  invoices: Invoice[];
  expanded: boolean;
  onSelect: () => void;
  onMore: () => void;
}) {
  const inMonth = isSameMonth(day, cursorMonth);
  const visibleInvoices = expanded ? invoices : invoices.slice(0, 2);
  const dayTotal = sumBalance(invoices);
  const isWeekend = [0, 6].includes(day.getDay());
  const todayCell = isSameDay(day, today);

  return (
    <div
      className={cn(
        "min-h-32 border-b border-r border-ink-100 p-2 transition",
        inMonth ? "bg-white" : "bg-ink-50/70",
        isWeekend && inMonth && "bg-ink-50/35",
        selected && "ring-2 ring-inset ring-emerald-500",
        todayCell && "bg-emerald-50/45"
      )}
    >
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={onSelect}>
        <span className={cn("text-xs font-black", inMonth ? "text-ink-900" : "text-ink-400")}>
          {format(day, "d")}
        </span>
        {todayCell ? (
          <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            Today
          </span>
        ) : null}
      </button>

      {invoices.length ? (
        <div className="mt-2">
          <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            {invoices.length} due | {formatCompactCurrency(dayTotal)}
          </p>
          <div className="space-y-1">
            {visibleInvoices.map((invoice) => (
              <CalendarEventChip key={invoice.id} invoice={invoice} />
            ))}
            {invoices.length > visibleInvoices.length ? (
              <button
                type="button"
                className="text-[11px] font-bold text-ink-600 transition hover:text-ink-900"
                onClick={onMore}
              >
                +{invoices.length - visibleInvoices.length} more
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarEventChip({ invoice }: { invoice: Invoice }) {
  const timing = getTimingState(invoice);

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className={cn(
        "block rounded-md border px-1.5 py-1 text-[11px] font-bold leading-4 transition hover:shadow-soft",
        invoice.type === "receivable" && "border-emerald-100 bg-emerald-50 text-emerald-900",
        invoice.type === "payable" && "border-peacock-100 bg-peacock-50 text-peacock-900",
        timing.label === "Overdue" && "border-garnet-200 bg-garnet-50 text-garnet-900",
        timing.label === "Due today" && "border-citrine-200 bg-citrine-50 text-citrine-900"
      )}
    >
      <span className="block truncate">{shortPartyName(invoice.partyName)} | {formatCompactCurrency(invoiceBalance(invoice), invoice.currency)}</span>
    </Link>
  );
}

function WeekWorkspace({
  days,
  today,
  invoices,
  selectedDate,
  onDaySelect
}: {
  days: Date[];
  today: Date;
  invoices: Invoice[];
  selectedDate: Date;
  onDaySelect: (day: Date) => void;
}) {
  return (
    <SectionCard title="Week plan" eyebrow="Seven day timing" action={<CalendarLegend />}>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => (
          <MobileDayCard
            key={day.toISOString()}
            day={day}
            today={today}
            selected={isSameDay(day, selectedDate)}
            invoices={getInvoicesForDay(invoices, day)}
            onSelect={() => onDaySelect(day)}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function MobileDayCard({
  day,
  today,
  selected,
  invoices,
  onSelect
}: {
  day: Date;
  today: Date;
  selected: boolean;
  invoices: Invoice[];
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-ink-100 p-3",
        selected && "border-emerald-300 bg-emerald-50/35",
        isSameDay(day, today) && "bg-emerald-50/45"
      )}
    >
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={onSelect}>
        <div>
          <p className="text-sm font-black text-ink-900">{format(day, "EEE, MMM d")}</p>
          <p className="mt-1 text-xs font-semibold text-ink-500">
            {invoices.length ? `${invoices.length} due | ${formatCompactCurrency(sumBalance(invoices))}` : "No due items"}
          </p>
        </div>
        {isSameDay(day, today) ? <Badge tone="emerald">Today</Badge> : null}
      </button>
      {invoices.length ? (
        <div className="mt-3 space-y-2">
          {invoices.slice(0, 3).map((invoice) => (
            <CalendarEventRow key={invoice.id} invoice={invoice} compact />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgendaWorkspace({
  invoices,
  onReminder,
  onRecordPayment,
  onSchedulePayment
}: {
  invoices: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onSchedulePayment: (invoice: Invoice) => void;
}) {
  const groups = groupAgenda(invoices);

  return (
    <SectionCard title="Agenda view" eyebrow="Action order">
      <div className="space-y-4">
        {groups.map((group) => (
          <AgendaGroup
            key={group.label}
            label={group.label}
            invoices={group.invoices}
            onReminder={onReminder}
            onRecordPayment={onRecordPayment}
            onSchedulePayment={onSchedulePayment}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ActionAgenda({
  selectedDate,
  selectedInvoices,
  overdue,
  dueToday,
  dueThisWeek,
  onReminder,
  onRecordPayment,
  onSchedulePayment
}: {
  selectedDate: Date;
  selectedInvoices: Invoice[];
  overdue: Invoice[];
  dueToday: Invoice[];
  dueThisWeek: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onSchedulePayment: (invoice: Invoice) => void;
}) {
  const grouped = [
    { label: "Selected day", invoices: selectedInvoices },
    { label: "Overdue", invoices: overdue.slice(0, 5) },
    { label: "Today", invoices: dueToday.slice(0, 5) },
    { label: "Next 7 days", invoices: dueThisWeek.slice(0, 6) }
  ];

  return (
    <SectionCard
      title="Action agenda"
      eyebrow="Next steps"
      action={<p className="text-sm font-semibold text-ink-500">{format(selectedDate, "MMM d")}</p>}
    >
      <div className="space-y-4">
        {grouped.map((group) => (
          <AgendaGroup
            key={group.label}
            label={group.label}
            invoices={group.invoices}
            onReminder={onReminder}
            onRecordPayment={onRecordPayment}
            onSchedulePayment={onSchedulePayment}
            emptyText={group.label === "Selected day" ? "No items due on the selected day." : "Nothing in this group."}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function AgendaGroup({
  label,
  invoices,
  onReminder,
  onRecordPayment,
  onSchedulePayment,
  emptyText = "No invoices in this group."
}: {
  label: string;
  invoices: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onSchedulePayment: (invoice: Invoice) => void;
  emptyText?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{label}</p>
        <p className="text-xs font-black text-ink-500">{invoices.length}</p>
      </div>
      {invoices.length ? (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <AgendaItem
              key={`${label}-${invoice.id}`}
              invoice={invoice}
              onReminder={onReminder}
              onRecordPayment={onRecordPayment}
              onSchedulePayment={onSchedulePayment}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-ink-100 bg-ink-50/60 p-3 text-sm leading-6 text-ink-500">{emptyText}</p>
      )}
    </div>
  );
}

function AgendaItem({
  invoice,
  onReminder,
  onRecordPayment,
  onSchedulePayment
}: {
  invoice: Invoice;
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onSchedulePayment: (invoice: Invoice) => void;
}) {
  const timing = getTimingState(invoice);
  const action = getNextAction(invoice);

  return (
    <div
      className={cn(
        "rounded-lg border border-ink-100 p-3",
        timing.label === "Overdue" && "border-garnet-200 bg-garnet-50/45",
        timing.label === "Due today" && "border-citrine-200 bg-citrine-50/45"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
          <p className="mt-1 text-xs font-semibold text-ink-500">
            {formatShortDate(invoice.dueDate)} | {timing.detail}
          </p>
        </div>
        <TimingBadge timing={timing} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={invoice.type} />
          <p className="text-sm font-black text-ink-900">{formatCurrency(invoiceBalance(invoice), invoice.currency)}</p>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
          {action.label}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href={`/invoices/${invoice.id}`} variant="secondary" size="sm">
          <Eye className="size-4" />
          View
        </ButtonLink>
        {action.kind === "reminder" ? (
          <Button variant="secondary" size="sm" onClick={() => onReminder(invoice)}>
            <Send className="size-4" />
            Reminder
          </Button>
        ) : null}
        {action.kind === "schedule" ? (
          <Button variant="secondary" size="sm" onClick={() => onSchedulePayment(invoice)}>
            <CalendarClock className="size-4" />
            Schedule
          </Button>
        ) : null}
        {action.kind === "payment" ? (
          <Button variant="secondary" size="sm" onClick={() => onRecordPayment(invoice)}>
            <CircleDollarSign className="size-4" />
            Record paid
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OverdueRibbon({
  invoices,
  onReminder,
  onRecordPayment
}: {
  invoices: Invoice[];
  onReminder: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
}) {
  return (
    <Card className="border-garnet-200 bg-garnet-50/45 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-garnet-700">Overdue carry-forward</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-900">
            {invoices.length} overdue item{invoices.length === 1 ? "" : "s"} need action
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {formatCurrency(sumBalance(invoices))} remains open and is kept visible regardless of calendar month.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoices.slice(0, 3).map((invoice) => (
            <Button
              key={invoice.id}
              variant="secondary"
              size="sm"
              onClick={() => (invoice.type === "receivable" ? onReminder(invoice) : onRecordPayment(invoice))}
            >
              {invoice.type === "receivable" ? "Send reminder" : "Mark paid"}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MaterialItems({ invoices }: { invoices: Invoice[] }) {
  return (
    <SectionCard
      title="Material cash movements"
      eyebrow={`Large value | ${formatCurrency(largeThreshold)}`}
      action={<ButtonLink href="/analytics" variant="secondary" size="sm">View analytics</ButtonLink>}
    >
      {invoices.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {invoices.slice(0, 4).map((invoice) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="rounded-lg border border-ink-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-500">
                    {invoice.type === "receivable" ? "Incoming" : "Outgoing"} | Due {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <TypeBadge type={invoice.type} />
              </div>
              <p className="mt-3 text-lg font-black text-ink-900">
                {formatCurrency(invoiceBalance(invoice), invoice.currency)}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-600">{getTimingState(invoice).detail}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink-500">No open invoices above the materiality threshold.</p>
      )}
    </SectionCard>
  );
}

function CalendarEventRow({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const timing = getTimingState(invoice);

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="block rounded-lg border border-ink-100 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/35"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink-900">{invoice.partyName}</p>
          <p className="mt-1 text-xs font-semibold text-ink-500">{timing.detail}</p>
        </div>
        <TypeBadge type={invoice.type} />
      </div>
      {!compact ? (
        <p className="mt-2 text-sm font-black text-ink-900">{formatCurrency(invoiceBalance(invoice), invoice.currency)}</p>
      ) : null}
    </Link>
  );
}

function SignalCard({
  title,
  count,
  amount,
  detail,
  tone = "emerald"
}: {
  title: string;
  count: number;
  amount: number;
  detail: string;
  tone?: "emerald" | "garnet" | "citrine" | "peacock";
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm font-semibold text-ink-500">{title}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-black",
          tone === "garnet" && "text-garnet-700",
          tone === "citrine" && "text-citrine-800",
          tone === "emerald" && "text-emerald-800",
          tone === "peacock" && "text-peacock-800"
        )}
      >
        {count}
      </p>
      <p className="mt-2 text-sm font-bold text-ink-900">
        {count} invoice{count === 1 ? "" : "s"} | {formatCurrency(amount)}
      </p>
      <p className="mt-1 text-sm leading-5 text-ink-600">{detail}</p>
    </Card>
  );
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink-600">
      <LegendDot label="Collect" className="bg-emerald-600" />
      <LegendDot label="Pay" className="bg-peacock-600" />
      <LegendDot label="Overdue" className="bg-garnet-600" />
      <LegendDot label="Due today" className="bg-citrine-500" />
      <LegendDot label="Large value" className="bg-ink-900" />
    </div>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function TimingBadge({ timing }: { timing: TimingState }) {
  return (
    <Badge
      tone={
        timing.label === "Overdue"
          ? "garnet"
          : timing.label === "Due today"
            ? "citrine"
            : timing.label === "Due soon"
              ? "citrine"
              : "neutral"
      }
    >
      {timing.label}
    </Badge>
  );
}

function getTimingState(invoice: Invoice): TimingState {
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
    tone: "neutral"
  };
}

function getNextAction(invoice: Invoice) {
  const timing = getTimingState(invoice);

  if (invoice.type === "receivable") {
    if (timing.label === "Overdue" || timing.label === "Due today") {
      return { label: "Send reminder", kind: "reminder" as const };
    }

    return { label: "Record payment", kind: "payment" as const };
  }

  if (timing.label === "Overdue" || timing.label === "Due today") {
    return { label: "Mark as paid", kind: "payment" as const };
  }

  return { label: "Schedule payment", kind: "schedule" as const };
}

function matchesFilter(invoice: Invoice, activeFilter: CalendarFilter, today: Date) {
  if (activeFilter === "collect") {
    return invoice.type === "receivable";
  }

  if (activeFilter === "pay") {
    return invoice.type === "payable";
  }

  if (activeFilter === "overdue") {
    return getTimingState(invoice).label === "Overdue";
  }

  if (activeFilter === "large") {
    return invoiceBalance(invoice) >= largeThreshold;
  }

  if (activeFilter === "thisWeek") {
    const due = parseAppDate(invoice.dueDate);
    return due >= startOfWeek(today, { weekStartsOn }) && due <= endOfWeek(today, { weekStartsOn });
  }

  return true;
}

function groupAgenda(invoices: Invoice[]) {
  return [
    {
      label: "Overdue",
      invoices: invoices.filter((invoice) => getTimingState(invoice).label === "Overdue").slice(0, 8)
    },
    {
      label: "Today",
      invoices: invoices.filter((invoice) => getTimingState(invoice).label === "Due today").slice(0, 8)
    },
    {
      label: "Next 7 days",
      invoices: invoices.filter((invoice) => {
        const timing = getTimingState(invoice).label;
        return timing === "Due soon";
      }).slice(0, 10)
    },
    {
      label: "Later",
      invoices: invoices.filter((invoice) => getTimingState(invoice).label === "Current").slice(0, 10)
    }
  ];
}

function sortByUrgency(a: Invoice, b: Invoice) {
  const timingRank = {
    Overdue: 0,
    "Due today": 1,
    "Due soon": 2,
    Current: 3
  };
  const rankDelta = timingRank[getTimingState(a).label] - timingRank[getTimingState(b).label];

  if (rankDelta !== 0) {
    return rankDelta;
  }

  const dateDelta = parseAppDate(a.dueDate).getTime() - parseAppDate(b.dueDate).getTime();

  if (dateDelta !== 0) {
    return dateDelta;
  }

  return invoiceBalance(b) - invoiceBalance(a);
}

function getInvoicesForDay(invoices: Invoice[], day: Date) {
  return invoices
    .filter((invoice) => isSameDay(parseAppDate(invoice.dueDate), day))
    .sort(sortByUrgency);
}

function sumBalance(invoices: Invoice[]) {
  return invoices.reduce((total, invoice) => total + invoiceBalance(invoice), 0);
}

function formatNetFlow(invoices: Invoice[]) {
  const incoming = invoices
    .filter((invoice) => invoice.type === "receivable")
    .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
  const outgoing = invoices
    .filter((invoice) => invoice.type === "payable")
    .reduce((total, invoice) => total + invoiceBalance(invoice), 0);
  const net = incoming - outgoing;

  return `Net ${net >= 0 ? "+" : ""}${formatCurrency(net)} this month`;
}

function shortPartyName(name: string) {
  return name.split(" ").slice(0, 2).join(" ");
}
