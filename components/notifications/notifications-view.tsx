"use client";

import {
  BellRing,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Eye,
  FileCheck2,
  MoreHorizontal,
  Send,
  Siren,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PriorityBadge } from "@/components/invoices/priority-badge";
import { TypeBadge } from "@/components/invoices/type-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { addDaysToDateOnly, getAppTodayString } from "@/lib/date-utils";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  invoiceBalance,
  isInvoiceOpen
} from "@/lib/format";
import type { Invoice, InvoicePriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "invoice-tracker:alert-workflow";
const largeValueThreshold = 20000;
const dueSoonWindow = 7;

const filters = [
  { label: "All", value: "all" },
  { label: "Overdue", value: "overdue" },
  { label: "Due today", value: "dueToday" },
  { label: "Due tomorrow", value: "dueTomorrow" },
  { label: "Due soon", value: "dueSoon" },
  { label: "Large value", value: "large" },
  { label: "Collect", value: "collect" },
  { label: "Pay", value: "pay" },
  { label: "Critical", value: "critical" },
  { label: "Dismissed", value: "dismissed" }
] as const;

const sortOptions = [
  { label: "Highest priority", value: "priority" },
  { label: "Most overdue", value: "overdue" },
  { label: "Largest amount", value: "amount" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" }
] as const;

type AlertKind = "overdue" | "due-today" | "due-tomorrow" | "due-soon" | "large-value";
type AlertWorkflowState = "active" | "snoozed" | "resolved" | "dismissed" | "reviewed";
type AlertFilter = (typeof filters)[number]["value"];
type AlertSort = (typeof sortOptions)[number]["value"];
type AlertStateMap = Record<string, { state: AlertWorkflowState; updatedAt: string; snoozeUntil?: string }>;

type AlertRecord = {
  id: string;
  invoice: Invoice;
  kind: AlertKind;
  title: string;
  description: string;
  amount: number;
  dueDate: string;
  priority: InvoicePriority;
  createdAt: string;
  workflow: AlertWorkflowState;
  snoozeUntil?: string;
};

const alertMeta: Record<AlertKind, {
  label: string;
  group: string;
  tone: "garnet" | "citrine" | "peacock" | "ink" | "emerald";
  icon: typeof Siren;
}> = {
  overdue: {
    label: "Overdue",
    group: "Overdue",
    tone: "garnet",
    icon: Siren
  },
  "due-today": {
    label: "Due today",
    group: "Due today",
    tone: "citrine",
    icon: BellRing
  },
  "due-tomorrow": {
    label: "Due tomorrow",
    group: "Due tomorrow",
    tone: "peacock",
    icon: CalendarClock
  },
  "due-soon": {
    label: "Due soon",
    group: "Due soon",
    tone: "emerald",
    icon: Clock3
  },
  "large-value": {
    label: "Large value",
    group: "Large value",
    tone: "ink",
    icon: Sparkles
  }
};

export function NotificationsView() {
  const { invoices, markAsPaid } = useInvoices();
  const { notify } = useToast();
  const [alertStates, setAlertStates] = useState<AlertStateMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AlertFilter>("all");
  const [sort, setSort] = useState<AlertSort>("priority");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setAlertStates(JSON.parse(stored) as AlertStateMap);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alertStates));
    }
  }, [alertStates, hydrated]);

  const alerts = useMemo(() => buildAlerts(invoices, alertStates), [alertStates, invoices]);
  const activeAlerts = alerts.filter((alert) => alert.workflow === "active" || alert.workflow === "reviewed");
  const dismissedAlerts = alerts.filter((alert) => ["dismissed", "resolved", "snoozed"].includes(alert.workflow));
  const visibleAlerts = useMemo(() => {
    return alerts
      .filter((alert) => matchesFilter(alert, activeFilter))
      .sort((a, b) => sortAlerts(a, b, sort));
  }, [activeFilter, alerts, sort]);
  const groupedAlerts = useMemo(() => groupAlerts(visibleAlerts), [visibleAlerts]);
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) ?? visibleAlerts[0] ?? null;
  const selectedAlerts = alerts.filter((alert) => selectedIds.includes(alert.id));
  const summary = {
    overdue: activeAlerts.filter((alert) => alert.kind === "overdue"),
    dueToday: activeAlerts.filter((alert) => alert.kind === "due-today"),
    critical: activeAlerts.filter((alert) => alert.priority === "Critical")
  };

  function updateAlerts(ids: string[], state: AlertWorkflowState, snoozeUntil?: string) {
    const updatedAt = new Date().toISOString();
    setAlertStates((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        next[id] = { state, updatedAt, snoozeUntil };
      });
      return next;
    });
    setSelectedIds([]);
    window.dispatchEvent(new Event("invoice-tracker:alert-workflow-updated"));
  }

  function clearAlertState(ids: string[]) {
    setAlertStates((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setSelectedIds([]);
    window.dispatchEvent(new Event("invoice-tracker:alert-workflow-updated"));
  }

  function sendReminder(alert: AlertRecord) {
    notify({
      title: "Reminder queued",
      description: `${alert.invoice.invoiceNumber} reminder is ready for ${alert.invoice.partyName}.`,
      variant: "info"
    });
  }

  function schedulePayment(alert: AlertRecord) {
    notify({
      title: "Payment scheduled",
      description: `${alert.invoice.invoiceNumber} is queued for ${alert.invoice.paymentMethod || "payment release"}.`,
      variant: "info"
    });
  }

  function recordPayment(alert: AlertRecord) {
    markAsPaid(alert.invoice.id);
    updateAlerts([alert.id], "resolved");
    notify({
      title: alert.invoice.type === "receivable" ? "Payment recorded" : "Payable marked paid",
      description: `${alert.invoice.invoiceNumber} is now resolved.`,
      variant: "success"
    });
  }

  function markAllReviewed() {
    updateAlerts(activeAlerts.map((alert) => alert.id), "reviewed");
    notify({
      title: "Alerts marked reviewed",
      description: `${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"} marked reviewed.`,
      variant: "success"
    });
  }

  function restoreDismissed() {
    clearAlertState(dismissedAlerts.map((alert) => alert.id));
    notify({
      title: "Alert history restored",
      description: `${dismissedAlerts.length} alert${dismissedAlerts.length === 1 ? "" : "s"} returned to active triage.`,
      variant: "success"
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance triage"
        title="Alerts"
        description="Work through overdue, due-today, due-soon, and high-value invoice alerts with context-aware next actions."
        action={
          <>
            <Button variant="secondary" onClick={() => setActiveFilter(activeFilter === "dismissed" ? "all" : "dismissed")}>
              {activeFilter === "dismissed" ? "View active" : "View dismissed"}
            </Button>
            <Button variant="secondary" onClick={() => setShowRules((current) => !current)}>
              <SlidersHorizontal className="size-4" />
              Manage rules
            </Button>
            <Button variant="secondary" onClick={markAllReviewed} disabled={!activeAlerts.length}>
              Mark all reviewed
            </Button>
            <ButtonLink href="/invoices/new" variant="secondary">
              Add invoice
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <AlertStat title="Overdue" alerts={summary.overdue} tone="garnet" detail="Open exposure past terms" />
        <AlertStat title="Due today" alerts={summary.dueToday} tone="citrine" detail="Needs same-day action" />
        <AlertStat title="Critical" alerts={summary.critical} tone="ink" detail="Highest priority active alerts" />
      </section>

      {showRules ? (
        <section className="mt-4">
          <RulesPanel />
        </section>
      ) : null}

      <section className="mt-4">
        <AlertControls
          activeFilter={activeFilter}
          sort={sort}
          selectedCount={selectedIds.length}
          dismissedCount={dismissedAlerts.length}
          onFilterChange={setActiveFilter}
          onSortChange={setSort}
          onBulkSnooze={() => updateAlerts(selectedIds, "snoozed", addDaysToDateOnly(getAppTodayString(), 2))}
          onBulkResolve={() => updateAlerts(selectedIds, "resolved")}
          onBulkReview={() => updateAlerts(selectedIds, "reviewed")}
          onBulkDismiss={() => updateAlerts(selectedIds, "dismissed")}
          onRestoreDismissed={restoreDismissed}
        />
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                Active triage queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink-900">
                {visibleAlerts.length} alert{visibleAlerts.length === 1 ? "" : "s"}
              </h2>
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700">
              <input
                type="checkbox"
                className="rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
                checked={visibleAlerts.length > 0 && visibleAlerts.every((alert) => selectedIds.includes(alert.id))}
                onChange={(event) => setSelectedIds(event.target.checked ? visibleAlerts.map((alert) => alert.id) : [])}
              />
              Select visible
            </label>
          </div>

          {!visibleAlerts.length ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title={activeFilter === "dismissed" ? "No dismissed alerts" : "No alerts match this view"}
                description="Adjust filters or wait for invoices to cross alert rules."
                href="/invoices"
              />
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {groupedAlerts.map((group) => (
                <AlertGroup
                  key={group.label}
                  label={group.label}
                  alerts={group.alerts}
                  selectedIds={selectedIds}
                  onSelect={(id, checked) => {
                    setSelectedIds((current) =>
                      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)
                    );
                  }}
                  onOpen={setSelectedAlertId}
                  onReminder={sendReminder}
                  onSchedule={schedulePayment}
                  onRecordPayment={recordPayment}
                  onSnooze={(alert) => updateAlerts([alert.id], "snoozed", addDaysToDateOnly(getAppTodayString(), 2))}
                  onResolve={(alert) => updateAlerts([alert.id], "resolved")}
                  onReview={(alert) => updateAlerts([alert.id], "reviewed")}
                  onDismiss={(alert) => updateAlerts([alert.id], "dismissed")}
                  onRestore={(alert) => clearAlertState([alert.id])}
                />
              ))}
            </div>
          )}
        </Card>

        <SelectedAlertPanel
          alert={selectedAlert}
          selectedCount={selectedIds.length}
          onReminder={sendReminder}
          onSchedule={schedulePayment}
          onRecordPayment={recordPayment}
          onSnooze={(alert) => updateAlerts([alert.id], "snoozed", addDaysToDateOnly(getAppTodayString(), 2))}
          onResolve={(alert) => updateAlerts([alert.id], "resolved")}
          onReview={(alert) => updateAlerts([alert.id], "reviewed")}
          onDismiss={(alert) => updateAlerts([alert.id], "dismissed")}
          selectedAlerts={selectedAlerts}
        />
      </section>
    </>
  );
}

function AlertControls({
  activeFilter,
  sort,
  selectedCount,
  dismissedCount,
  onFilterChange,
  onSortChange,
  onBulkSnooze,
  onBulkResolve,
  onBulkReview,
  onBulkDismiss,
  onRestoreDismissed
}: {
  activeFilter: AlertFilter;
  sort: AlertSort;
  selectedCount: number;
  dismissedCount: number;
  onFilterChange: (filter: AlertFilter) => void;
  onSortChange: (sort: AlertSort) => void;
  onBulkSnooze: () => void;
  onBulkResolve: () => void;
  onBulkReview: () => void;
  onBulkDismiss: () => void;
  onRestoreDismissed: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            aria-label="Sort alerts"
            className="h-10 rounded-lg border-ink-200 text-sm font-semibold focus:border-emerald-600 focus:ring-emerald-600"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as AlertSort)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {dismissedCount > 0 ? (
            <Button variant="secondary" onClick={onRestoreDismissed}>
              <RotateCcw className="size-4" />
              Restore dismissed
            </Button>
          ) : null}
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/70 p-3">
          <p className="mr-2 text-sm font-bold text-ink-900">
            {selectedCount} selected
          </p>
          <Button variant="secondary" size="sm" onClick={onBulkReview}>Mark reviewed</Button>
          <Button variant="secondary" size="sm" onClick={onBulkSnooze}>Snooze 2 days</Button>
          <Button variant="secondary" size="sm" onClick={onBulkResolve}>Resolve</Button>
          <Button variant="danger" size="sm" onClick={onBulkDismiss}>Dismiss</Button>
        </div>
      ) : null}
    </Card>
  );
}

function AlertGroup({
  label,
  alerts,
  selectedIds,
  onSelect,
  onOpen,
  onReminder,
  onSchedule,
  onRecordPayment,
  onSnooze,
  onResolve,
  onReview,
  onDismiss,
  onRestore
}: {
  label: string;
  alerts: AlertRecord[];
  selectedIds: string[];
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
  onReminder: (alert: AlertRecord) => void;
  onSchedule: (alert: AlertRecord) => void;
  onRecordPayment: (alert: AlertRecord) => void;
  onSnooze: (alert: AlertRecord) => void;
  onResolve: (alert: AlertRecord) => void;
  onReview: (alert: AlertRecord) => void;
  onDismiss: (alert: AlertRecord) => void;
  onRestore: (alert: AlertRecord) => void;
}) {
  return (
    <div>
      <div className="border-b border-ink-100 bg-ink-50/70 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{label}</p>
          <p className="text-xs font-black text-ink-500">{alerts.length}</p>
        </div>
      </div>
      <div className="divide-y divide-ink-100">
        {alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            selected={selectedIds.includes(alert.id)}
            onSelect={(checked) => onSelect(alert.id, checked)}
            onOpen={() => onOpen(alert.id)}
            onReminder={() => onReminder(alert)}
            onSchedule={() => onSchedule(alert)}
            onRecordPayment={() => onRecordPayment(alert)}
            onSnooze={() => onSnooze(alert)}
            onResolve={() => onResolve(alert)}
            onReview={() => onReview(alert)}
            onDismiss={() => onDismiss(alert)}
            onRestore={() => onRestore(alert)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  selected,
  onSelect,
  onOpen,
  onReminder,
  onSchedule,
  onRecordPayment,
  onSnooze,
  onResolve,
  onReview,
  onDismiss,
  onRestore
}: {
  alert: AlertRecord;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
  onReminder: () => void;
  onSchedule: () => void;
  onRecordPayment: () => void;
  onSnooze: () => void;
  onResolve: () => void;
  onReview: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const meta = alertMeta[alert.kind];
  const Icon = meta.icon;
  const nextAction = getNextAction(alert);
  const closed = ["dismissed", "resolved", "snoozed"].includes(alert.workflow);

  return (
    <article
      className={cn(
        "grid gap-3 p-4 sm:p-5 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto]",
        alert.kind === "overdue" && alert.workflow !== "dismissed" && "bg-garnet-50/35",
        alert.workflow === "dismissed" && "bg-ink-50/70 opacity-80"
      )}
    >
      <div className="flex items-start gap-3 lg:contents">
        <input
          aria-label={`Select ${alert.invoice.invoiceNumber}`}
          type="checkbox"
          className="mt-2 rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <button
          type="button"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg",
            meta.tone === "garnet" && "bg-garnet-50 text-garnet-700",
            meta.tone === "citrine" && "bg-citrine-50 text-citrine-800",
            meta.tone === "peacock" && "bg-peacock-50 text-peacock-700",
            meta.tone === "emerald" && "bg-emerald-50 text-emerald-700",
            meta.tone === "ink" && "bg-ink-900 text-white"
          )}
          onClick={onOpen}
          aria-label={`Open alert detail for ${alert.invoice.invoiceNumber}`}
        >
          <Icon className="size-5" />
        </button>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <TypeBadge type={alert.invoice.type} />
          <PriorityBadge priority={alert.priority} />
          {alert.workflow !== "active" ? <WorkflowBadge workflow={alert.workflow} snoozeUntil={alert.snoozeUntil} /> : null}
        </div>
        <button type="button" className="mt-2 block text-left" onClick={onOpen}>
          <h3 className="text-base font-black text-ink-900">{alert.title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-600">{alert.description}</p>
        </button>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-ink-700">
          <span>{alert.invoice.invoiceNumber}</span>
          <span>{formatDate(alert.dueDate)}</span>
          <span>{getTimingDetail(alert)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:items-end">
        <div className="lg:text-right">
          <p className="text-lg font-black text-ink-900">{formatCurrency(alert.amount, alert.invoice.currency)}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-ink-400">{nextAction.label}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <ButtonLink href={`/invoices/${alert.invoice.id}`} variant="secondary" size="sm">
            <Eye className="size-4" />
            View
          </ButtonLink>
          {!closed && nextAction.kind === "reminder" ? (
            <Button variant="secondary" size="sm" onClick={onReminder}>
              <Send className="size-4" />
              Reminder
            </Button>
          ) : null}
          {!closed && nextAction.kind === "schedule" ? (
            <Button variant="secondary" size="sm" onClick={onSchedule}>
              <CalendarClock className="size-4" />
              Schedule
            </Button>
          ) : null}
          {!closed && nextAction.kind === "payment" ? (
            <Button variant="secondary" size="sm" onClick={onRecordPayment}>
              <CircleDollarSign className="size-4" />
              Paid
            </Button>
          ) : null}
          {closed ? (
            <Button variant="secondary" size="sm" onClick={onRestore}>
              <RotateCcw className="size-4" />
              Restore
            </Button>
          ) : (
            <AlertOverflow
              onSnooze={onSnooze}
              onResolve={onResolve}
              onReview={onReview}
              onDismiss={onDismiss}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function AlertOverflow({
  onSnooze,
  onResolve,
  onReview,
  onDismiss
}: {
  onSnooze: () => void;
  onResolve: () => void;
  onReview: () => void;
  onDismiss: () => void;
}) {
  return (
    <details className="group relative">
      <summary
        aria-label="More alert actions"
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-white hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-ink-200 bg-white p-1.5 text-sm shadow-luxury">
        <MenuButton onClick={onSnooze} icon={<Clock3 className="size-4" />}>Snooze 2 days</MenuButton>
        <MenuButton onClick={onResolve} icon={<FileCheck2 className="size-4" />}>Resolve</MenuButton>
        <MenuButton onClick={onReview} icon={<Check className="size-4" />}>Mark reviewed</MenuButton>
        <div className="my-1 border-t border-ink-100" />
        <MenuButton danger onClick={onDismiss} icon={<X className="size-4" />}>Dismiss</MenuButton>
      </div>
    </details>
  );
}

function SelectedAlertPanel({
  alert,
  selectedCount,
  selectedAlerts,
  onReminder,
  onSchedule,
  onRecordPayment,
  onSnooze,
  onResolve,
  onReview,
  onDismiss
}: {
  alert: AlertRecord | null;
  selectedCount: number;
  selectedAlerts: AlertRecord[];
  onReminder: (alert: AlertRecord) => void;
  onSchedule: (alert: AlertRecord) => void;
  onRecordPayment: (alert: AlertRecord) => void;
  onSnooze: (alert: AlertRecord) => void;
  onResolve: (alert: AlertRecord) => void;
  onReview: (alert: AlertRecord) => void;
  onDismiss: (alert: AlertRecord) => void;
}) {
  if (!alert) {
    return (
      <SectionCard title="Alert detail" eyebrow="Triage context">
        <p className="text-sm leading-6 text-ink-500">Select an alert to inspect due state, exposure, and next best action.</p>
      </SectionCard>
    );
  }

  const nextAction = getNextAction(alert);

  return (
    <SectionCard
      title="Alert detail"
      eyebrow="Triage context"
      action={selectedCount ? <Badge tone="neutral">{selectedCount} selected</Badge> : null}
    >
      <div className="space-y-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={alertMeta[alert.kind].tone}>{alertMeta[alert.kind].label}</Badge>
            <TypeBadge type={alert.invoice.type} />
            <PriorityBadge priority={alert.priority} />
          </div>
          <h3 className="mt-3 text-lg font-black text-ink-900">{alert.invoice.partyName}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-600">{alert.description}</p>
        </div>

        <div className="grid gap-3 rounded-lg border border-ink-100 bg-ink-50/60 p-3 text-sm">
          <PanelMetric label="Invoice" value={alert.invoice.invoiceNumber} />
          <PanelMetric label="Amount" value={formatCurrency(alert.amount, alert.invoice.currency)} />
          <PanelMetric label="Due date" value={formatDate(alert.dueDate)} />
          <PanelMetric label="Timing" value={getTimingDetail(alert)} />
          <PanelMetric label="Next action" value={nextAction.label} />
        </div>

        <div className="grid gap-2">
          <ButtonLink href={`/invoices/${alert.invoice.id}`} variant="secondary" className="w-full">
            View invoice
          </ButtonLink>
          {nextAction.kind === "reminder" ? <Button variant="secondary" onClick={() => onReminder(alert)}>Send reminder</Button> : null}
          {nextAction.kind === "schedule" ? <Button variant="secondary" onClick={() => onSchedule(alert)}>Schedule payment</Button> : null}
          {nextAction.kind === "payment" ? <Button variant="secondary" onClick={() => onRecordPayment(alert)}>Record / mark paid</Button> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onSnooze(alert)}>Snooze</Button>
            <Button variant="secondary" onClick={() => onResolve(alert)}>Resolve</Button>
            <Button variant="secondary" onClick={() => onReview(alert)}>Reviewed</Button>
            <Button variant="danger" onClick={() => onDismiss(alert)}>Dismiss</Button>
          </div>
        </div>

        {selectedAlerts.length ? (
          <div className="rounded-lg border border-ink-100 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Bulk selection</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              {selectedAlerts.length} alert{selectedAlerts.length === 1 ? "" : "s"} selected for bulk triage from the control bar.
            </p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function RulesPanel() {
  return (
    <SectionCard title="Alert rules" eyebrow="Triage settings">
      <div className="grid gap-3 text-sm leading-6 text-ink-600 md:grid-cols-3">
        <div className="rounded-lg border border-ink-100 p-4">
          <p className="font-bold text-ink-900">Large-value threshold</p>
          <p className="mt-1">{formatCurrency(largeValueThreshold)} open balance.</p>
        </div>
        <div className="rounded-lg border border-ink-100 p-4">
          <p className="font-bold text-ink-900">Due-soon window</p>
          <p className="mt-1">{dueSoonWindow} days before due date.</p>
        </div>
        <div className="rounded-lg border border-ink-100 p-4">
          <p className="font-bold text-ink-900">Snooze behavior</p>
          <p className="mt-1">Snoozed alerts move to history for 2 days.</p>
        </div>
      </div>
    </SectionCard>
  );
}

function AlertStat({
  title,
  alerts,
  tone,
  detail
}: {
  title: string;
  alerts: AlertRecord[];
  tone: "garnet" | "citrine" | "ink";
  detail: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm font-semibold text-ink-500">{title}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-black",
          tone === "garnet" && "text-garnet-700",
          tone === "citrine" && "text-citrine-800",
          tone === "ink" && "text-ink-900"
        )}
      >
        {alerts.length}
      </p>
      <p className="mt-2 text-sm font-bold text-ink-900">
        {alerts.length} alert{alerts.length === 1 ? "" : "s"} | {formatCurrency(sumAlertAmount(alerts))}
      </p>
      <p className="mt-1 text-sm leading-5 text-ink-600">{detail}</p>
    </Card>
  );
}

function WorkflowBadge({ workflow, snoozeUntil }: { workflow: AlertWorkflowState; snoozeUntil?: string }) {
  if (workflow === "snoozed") {
    return <Badge tone="neutral">Snoozed{ snoozeUntil ? ` until ${formatDate(snoozeUntil)}` : ""}</Badge>;
  }

  if (workflow === "resolved") {
    return <Badge tone="emerald">Resolved</Badge>;
  }

  if (workflow === "dismissed") {
    return <Badge tone="neutral">Dismissed</Badge>;
  }

  if (workflow === "reviewed") {
    return <Badge tone="peacock">Reviewed</Badge>;
  }

  return null;
}

function PanelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 pb-2 last:border-0 last:pb-0">
      <p className="text-ink-500">{label}</p>
      <p className="text-right font-bold text-ink-900">{value}</p>
    </div>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  danger = false
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
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

function buildAlerts(invoices: Invoice[], states: AlertStateMap): AlertRecord[] {
  return invoices
    .filter(isInvoiceOpen)
    .map((invoice) => {
      const kind = getAlertKind(invoice);
      if (!kind) {
        return null;
      }

      const id = `${kind}-${invoice.id}`;
      const stored = states[id];
      const activeAfterSnooze =
        stored?.state === "snoozed" &&
        stored.snoozeUntil &&
        stored.snoozeUntil <= getAppTodayString();
      const workflow = activeAfterSnooze ? "active" : stored?.state ?? "active";

      return {
        id,
        invoice,
        kind,
        title: `${invoice.partyName} ${alertTitleSuffix(kind, invoice.type)}`,
        description: getAlertDescription(kind, invoice),
        amount: invoiceBalance(invoice),
        dueDate: invoice.dueDate,
        priority: invoice.priority,
        createdAt: invoice.updatedAt,
        workflow,
        snoozeUntil: activeAfterSnooze ? undefined : stored?.snoozeUntil
      };
    })
    .filter(Boolean) as AlertRecord[];
}

function getAlertKind(invoice: Invoice): AlertKind | null {
  const days = daysUntil(invoice.dueDate);
  const balance = invoiceBalance(invoice);

  if (days < 0) {
    return "overdue";
  }

  if (days === 0) {
    return "due-today";
  }

  if (days === 1) {
    return "due-tomorrow";
  }

  if (days <= dueSoonWindow) {
    return "due-soon";
  }

  if (balance >= largeValueThreshold && days <= 14) {
    return "large-value";
  }

  return null;
}

function alertTitleSuffix(kind: AlertKind, type: Invoice["type"]) {
  if (kind === "overdue") {
    return type === "receivable" ? "needs collection follow-up" : "needs payment handling";
  }

  if (kind === "due-today") {
    return type === "receivable" ? "is due to collect today" : "is due to pay today";
  }

  if (kind === "due-tomorrow") {
    return "is due tomorrow";
  }

  if (kind === "large-value") {
    return "requires high-value review";
  }

  return "is approaching deadline";
}

function getAlertDescription(kind: AlertKind, invoice: Invoice) {
  const typeLabel = invoice.type === "receivable" ? "Collect" : "Pay";
  return `${typeLabel} alert for ${invoice.invoiceNumber}. ${getTimingDetail({ kind, dueDate: invoice.dueDate } as AlertRecord)} on ${formatDate(invoice.dueDate)}.`;
}

function getTimingDetail(alert: Pick<AlertRecord, "kind" | "dueDate">) {
  const days = daysUntil(alert.dueDate);

  if (alert.kind === "overdue") {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }

  if (alert.kind === "due-today") {
    return "Due today";
  }

  if (alert.kind === "due-tomorrow") {
    return "Due tomorrow";
  }

  if (alert.kind === "large-value") {
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }

  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function getNextAction(alert: AlertRecord) {
  if (alert.invoice.type === "receivable") {
    if (alert.kind === "overdue" || alert.kind === "due-today" || alert.kind === "due-tomorrow") {
      return { label: "Send reminder", kind: "reminder" as const };
    }

    return { label: "Record payment", kind: "payment" as const };
  }

  if (alert.kind === "overdue" || alert.kind === "due-today") {
    return { label: "Mark paid", kind: "payment" as const };
  }

  return { label: "Schedule payment", kind: "schedule" as const };
}

function matchesFilter(alert: AlertRecord, filter: AlertFilter) {
  if (filter === "dismissed") {
    return ["dismissed", "resolved", "snoozed"].includes(alert.workflow);
  }

  if (["dismissed", "resolved", "snoozed"].includes(alert.workflow)) {
    return false;
  }

  if (filter === "overdue") {
    return alert.kind === "overdue";
  }

  if (filter === "dueToday") {
    return alert.kind === "due-today";
  }

  if (filter === "dueTomorrow") {
    return alert.kind === "due-tomorrow";
  }

  if (filter === "dueSoon") {
    return alert.kind === "due-soon";
  }

  if (filter === "large") {
    return alert.kind === "large-value";
  }

  if (filter === "collect") {
    return alert.invoice.type === "receivable";
  }

  if (filter === "pay") {
    return alert.invoice.type === "payable";
  }

  if (filter === "critical") {
    return alert.priority === "Critical";
  }

  return true;
}

function sortAlerts(a: AlertRecord, b: AlertRecord, sort: AlertSort) {
  if (sort === "amount") {
    return b.amount - a.amount;
  }

  if (sort === "newest") {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  if (sort === "oldest") {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  if (sort === "overdue") {
    return daysUntil(a.dueDate) - daysUntil(b.dueDate);
  }

  return alertScore(b) - alertScore(a);
}

function alertScore(alert: AlertRecord) {
  const priorityScore: Record<InvoicePriority, number> = {
    Critical: 400,
    High: 260,
    Medium: 120,
    Low: 0
  };
  const kindScore: Record<AlertKind, number> = {
    overdue: 500,
    "due-today": 390,
    "due-tomorrow": 290,
    "due-soon": 180,
    "large-value": 150
  };

  return kindScore[alert.kind] + priorityScore[alert.priority] + Math.min(alert.amount / 100, 300);
}

function groupAlerts(alerts: AlertRecord[]) {
  const groups = ["Overdue", "Due today", "Due tomorrow", "Due soon", "Large value", "Reviewed", "Dismissed"];

  return groups
    .map((label) => ({
      label,
      alerts: alerts.filter((alert) => getGroupLabel(alert) === label)
    }))
    .filter((group) => group.alerts.length > 0);
}

function getGroupLabel(alert: AlertRecord) {
  if (alert.workflow === "reviewed") {
    return "Reviewed";
  }

  if (["dismissed", "resolved", "snoozed"].includes(alert.workflow)) {
    return "Dismissed";
  }

  return alertMeta[alert.kind].group;
}

function sumAlertAmount(alerts: AlertRecord[]) {
  return alerts.reduce((total, alert) => total + alert.amount, 0);
}
