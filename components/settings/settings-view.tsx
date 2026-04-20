"use client";

import {
  BellRing,
  Building2,
  ChevronDown,
  Database,
  FileDown,
  Globe2,
  Mail,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  WalletCards
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/components/providers/auth-provider";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { currencies, formatCurrency, formatDateTime } from "@/lib/format";
import type {
  MonthEndInvoiceSnapshot,
  MonthEndSummary,
  RenderedMonthEndEmail
} from "@/lib/email/types";
import type { CurrencyCode, Invoice, InvoicePriority, InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "invoice-tracker:workspace-settings";
const ALERT_WORKFLOW_KEY = "invoice-tracker:alert-workflow";

const currencyNames: Record<CurrencyCode, string> = {
  TTD: "Trinidad and Tobago Dollar",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CAD: "Canadian Dollar",
  BOB: "Bolivian Boliviano"
};

type WorkspaceSettings = {
  businessName: string;
  financeEmail: string;
  baseCurrency: CurrencyCode;
  reportingCurrency: CurrencyCode;
  supportedCurrencies: CurrencyCode[];
  allowMultiCurrency: boolean;
  normalizeReports: boolean;
  defaultPaymentTerms: string;
  timeZone: string;
  dateFormat: string;
  invoicePrefix: string;
  defaultStatus: InvoiceStatus;
  defaultPriority: InvoicePriority;
  defaultReminderLeadDays: number;
  defaultPaymentMethod: string;
  defaultCategory: string;
  dueTodayAlerts: boolean;
  dueTomorrowAlerts: boolean;
  overdueAlerts: boolean;
  largeValueAlerts: boolean;
  reminderLeadDays: number;
  overdueEscalationDays: number;
  ttdLargeThreshold: number;
  usdLargeThreshold: number;
  collectReminderTone: string;
  payReminderTone: string;
  defaultExportFormat: string;
  includeNotesInExport: boolean;
  includeDismissedAlerts: boolean;
  exportCurrencyBehavior: string;
  exportDateFormat: string;
  numberFormat: string;
  saveFiltersByPage: boolean;
  restoreLastView: boolean;
};

type EmailToolMessage = {
  tone: "success" | "warning" | "info";
  title: string;
  description: string;
};

type EmailPreviewState = {
  summary: MonthEndSummary;
  email: RenderedMonthEndEmail;
} | null;

type WorkspaceUser = {
  id: string;
  membershipId: string;
  fullName: string;
  email: string;
  role: string;
  addedAt: string;
};

type WorkspaceUsersResponse = {
  users?: WorkspaceUser[];
  error?: string;
};

type InviteUserResponse = {
  invited?: boolean;
  user?: WorkspaceUser;
  error?: string;
};

const defaultSettings: WorkspaceSettings = {
  businessName: "Sterling Ledger Studio",
  financeEmail: "finance@example.com",
  baseCurrency: "TTD",
  reportingCurrency: "TTD",
  supportedCurrencies: ["TTD", "USD"],
  allowMultiCurrency: true,
  normalizeReports: false,
  defaultPaymentTerms: "Net 30",
  timeZone: "America/Port_of_Spain",
  dateFormat: "DD MMM YYYY",
  invoicePrefix: "INV",
  defaultStatus: "Pending",
  defaultPriority: "Medium",
  defaultReminderLeadDays: 3,
  defaultPaymentMethod: "Bank transfer",
  defaultCategory: "Operations",
  dueTodayAlerts: true,
  dueTomorrowAlerts: true,
  overdueAlerts: true,
  largeValueAlerts: true,
  reminderLeadDays: 3,
  overdueEscalationDays: 5,
  ttdLargeThreshold: 20000,
  usdLargeThreshold: 5000,
  collectReminderTone: "Send reminder",
  payReminderTone: "Schedule payment review",
  defaultExportFormat: "CSV",
  includeNotesInExport: true,
  includeDismissedAlerts: false,
  exportCurrencyBehavior: "Preserve invoice currency",
  exportDateFormat: "Workspace date format",
  numberFormat: "1,234.56",
  saveFiltersByPage: true,
  restoreLastView: true
};

export function SettingsView() {
  const { workspace } = useAuth();
  const { invoices, resetDemoData } = useInvoices();
  const { notify } = useToast();
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState(defaultSettings.financeEmail);
  const [emailPreview, setEmailPreview] = useState<EmailPreviewState>(null);
  const [emailToolMessage, setEmailToolMessage] = useState<EmailToolMessage | null>(null);
  const [emailLoading, setEmailLoading] = useState<"preview" | "send" | null>(null);
  const [lastEmailAttempt, setLastEmailAttempt] = useState<string | null>(null);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const canManageUsers = workspace.role === "owner" || workspace.role === "admin";

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const next = normalizeSettings(JSON.parse(stored) as Partial<WorkspaceSettings>);
        setSettings(next);
        setSavedSettings(next);
        setEmailRecipients(next.financeEmail);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setHydrated(true);
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings]
  );
  const emailStats = useMemo(() => getEmailToolStats(invoices), [invoices]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateSetting<Key extends keyof WorkspaceSettings>(
    key: Key,
    value: WorkspaceSettings[Key]
  ) {
    setSettings((current) => normalizeSettings({ ...current, [key]: value }));
  }

  function toggleCurrency(currency: CurrencyCode) {
    setSettings((current) => {
      const isRequired =
        currency === current.baseCurrency || currency === current.reportingCurrency;
      if (isRequired) {
        return current;
      }

      const exists = current.supportedCurrencies.includes(currency);
      const supportedCurrencies = exists
        ? current.supportedCurrencies.filter((item) => item !== currency)
        : [...current.supportedCurrencies, currency];

      return normalizeSettings({ ...current, supportedCurrencies });
    });
  }

  const loadWorkspaceUsers = useCallback(async () => {
    setUsersLoading(true);

    try {
      const response = await fetch("/api/workspace/users", {
        headers: {
          "X-Requested-With": "invoice-tracker-settings"
        }
      });
      const data = (await response.json()) as WorkspaceUsersResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Workspace users could not be loaded.");
      }

      setWorkspaceUsers(data.users ?? []);
    } catch (error) {
      notify({
        title: "Users could not be loaded",
        description: error instanceof Error ? error.message : "The users list is unavailable.",
        variant: "warning"
      });
    } finally {
      setUsersLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!canManageUsers) {
      return;
    }

    void loadWorkspaceUsers();
  }, [canManageUsers, loadWorkspaceUsers]);

  async function inviteWorkspaceUser() {
    setInviteLoading(true);

    try {
      const response = await fetch("/api/workspace/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "invoice-tracker-settings"
        },
        body: JSON.stringify({
          fullName: inviteFullName,
          email: inviteEmail,
          role: inviteRole
        })
      });
      const data = (await response.json()) as InviteUserResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Invite could not be sent.");
      }

      setInviteFullName("");
      setInviteEmail("");
      setInviteRole("member");
      await loadWorkspaceUsers();
      notify({
        title: data.invited ? "Invite sent" : "User added",
        description: data.invited
          ? `${data.user?.email ?? inviteEmail} was emailed a secure setup link.`
          : `${data.user?.email ?? inviteEmail} already has an account and can sign in.`,
        variant: "success"
      });
    } catch (error) {
      notify({
        title: "Invite failed",
        description: error instanceof Error ? error.message : "The user could not be invited.",
        variant: "warning"
      });
    } finally {
      setInviteLoading(false);
    }
  }

  function saveChanges() {
    const next = normalizeSettings(settings);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSettings(next);
    setSavedSettings(next);
    notify({
      title: "Settings saved",
      description: "Workspace defaults, alert rules, and export preferences were updated.",
      variant: "success"
    });
  }

  function resetChanges() {
    if (dirty && !window.confirm("Discard unsaved settings changes?")) {
      return;
    }

    setSettings(savedSettings);
    notify({
      title: "Changes discarded",
      description: "Settings were restored to the last saved version.",
      variant: "info"
    });
  }

  function resetSavedViews() {
    window.localStorage.removeItem(ALERT_WORKFLOW_KEY);
    window.dispatchEvent(new Event("invoice-tracker:alert-workflow-updated"));
    updateSetting("saveFiltersByPage", defaultSettings.saveFiltersByPage);
    updateSetting("restoreLastView", defaultSettings.restoreLastView);
    notify({
      title: "Saved views reset",
      description: "Stored alert workflow states and view preferences were cleared.",
      variant: "success"
    });
  }

  async function handleDemoReset() {
    if (!window.confirm("Reset invoices and local demo workflow data?")) {
      return;
    }

    try {
      await resetDemoData();
      window.localStorage.removeItem(ALERT_WORKFLOW_KEY);
      window.dispatchEvent(new Event("invoice-tracker:alert-workflow-updated"));
      notify({
        title: "Demo data reset",
        description: "Invoices and local workflow states were restored to the sample dataset.",
        variant: "success"
      });
    } catch (error) {
      notify({
        title: "Demo data could not be reset",
        description: error instanceof Error ? error.message : "Supabase could not restore the sample dataset.",
        variant: "warning"
      });
    }
  }

  async function previewMonthEndEmail() {
    setEmailLoading("preview");
    setEmailToolMessage(null);

    try {
      const result = await postEmailToolRequest("/api/internal/email/month-end-preview", {
        invoices: invoices.map(toMonthEndInvoiceSnapshot),
        snapshotDate: new Date().toISOString()
      });

      setEmailPreview({
        summary: result.summary,
        email: result.email
      });
      setEmailToolMessage({
        tone: "success",
        title: "Preview ready",
        description: "Review the month-end summary before sending a test email."
      });
    } catch (error) {
      setEmailToolMessage({
        tone: "warning",
        title: "Preview failed",
        description: error instanceof Error ? error.message : "The preview could not be generated."
      });
    } finally {
      setEmailLoading(null);
    }
  }

  async function sendMonthEndTestEmail() {
    const recipientResult = parseRecipients(emailRecipients);

    if (recipientResult.error) {
      setEmailToolMessage({
        tone: "warning",
        title: "Recipient needed",
        description: recipientResult.error
      });
      return;
    }

    const recipients = recipientResult.recipients;

    setEmailLoading("send");
    setEmailToolMessage(null);
    setLastEmailAttempt(new Date().toLocaleString());

    try {
      const result = await postEmailToolRequest("/api/internal/email/month-end-send-test", {
        recipients,
        invoices: invoices.map(toMonthEndInvoiceSnapshot),
        snapshotDate: new Date().toISOString()
      });

      setEmailPreview({
        summary: result.summary,
        email: result.email
      });
      setEmailToolMessage({
        tone: "success",
        title: "Test email sent",
        description: `Month-end summary sent to ${recipients.join(", ")}.`
      });
      notify({
        title: "Test email sent",
        description: "MailerSend accepted the month-end summary request.",
        variant: "success"
      });
    } catch (error) {
      setEmailToolMessage({
        tone: "warning",
        title: "Send failed",
        description: error instanceof Error ? error.message : "MailerSend could not send the email."
      });
    } finally {
      setEmailLoading(null);
    }
  }

  const headerAction = (
    <>
      <Button variant="secondary" onClick={resetChanges} disabled={!dirty}>
        Reset changes
      </Button>
      <Button onClick={saveChanges} disabled={!dirty || !hydrated}>
        <Save className="size-4" />
        Save changes
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow="Workspace settings"
        title="Settings"
        description="Configure business defaults, TTD and USD currency behavior, invoice rules, alerts, and export preferences."
        action={headerAction}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <SectionCard
            title="Business defaults"
            eyebrow="Trinidad and Tobago workspace"
            action={<SectionIcon icon={<Building2 className="size-5" />} />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Company / business name">
                <input
                  className="field-control"
                  value={settings.businessName}
                  onChange={(event) => updateSetting("businessName", event.target.value)}
                />
              </Field>
              <Field label="Finance contact email">
                <input
                  type="email"
                  className="field-control"
                  value={settings.financeEmail}
                  onChange={(event) => updateSetting("financeEmail", event.target.value)}
                />
              </Field>
              <Field label="Default/base currency" helper="TTD and USD are prioritized throughout the app.">
                <select
                  className="field-control"
                  value={settings.baseCurrency}
                  onChange={(event) => updateSetting("baseCurrency", event.target.value as CurrencyCode)}
                >
                  {currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency} - {currencyNames[currency]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred reporting currency">
                <select
                  className="field-control"
                  value={settings.reportingCurrency}
                  onChange={(event) => updateSetting("reportingCurrency", event.target.value as CurrencyCode)}
                >
                  {currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency} - {currencyNames[currency]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="lg:col-span-2">
                <FieldBlock
                  label="Supported currencies"
                  helper="Primary workspace currencies are first. Base and reporting currencies stay enabled."
                >
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {currencies.map((currency) => {
                      const locked =
                        currency === settings.baseCurrency ||
                        currency === settings.reportingCurrency;
                      return (
                        <CurrencyOption
                          key={currency}
                          currency={currency}
                          checked={settings.supportedCurrencies.includes(currency)}
                          locked={locked}
                          onChange={() => toggleCurrency(currency)}
                        />
                      );
                    })}
                  </div>
                </FieldBlock>
              </div>
              <Field label="Default payment terms">
                <select
                  className="field-control"
                  value={settings.defaultPaymentTerms}
                  onChange={(event) => updateSetting("defaultPaymentTerms", event.target.value)}
                >
                  {["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Custom"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Time zone">
                <select
                  className="field-control"
                  value={settings.timeZone}
                  onChange={(event) => updateSetting("timeZone", event.target.value)}
                >
                  {["America/Port_of_Spain", "America/New_York", "America/La_Paz", "UTC"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date format">
                <select
                  className="field-control"
                  value={settings.dateFormat}
                  onChange={(event) => updateSetting("dateFormat", event.target.value)}
                >
                  {["DD MMM YYYY", "MMM D, YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice number prefix / format">
                <input
                  className="field-control uppercase"
                  maxLength={10}
                  value={settings.invoicePrefix}
                  onChange={(event) => updateSetting("invoicePrefix", event.target.value.toUpperCase())}
                />
              </Field>
              <div className="lg:col-span-2">
                <FieldBlock label="Currency behavior">
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <ToggleRow
                      title="Allow multi-currency invoices"
                      description="Users can create invoices in any enabled currency."
                      checked={settings.allowMultiCurrency}
                      onChange={(checked) => updateSetting("allowMultiCurrency", checked)}
                    />
                    <ToggleRow
                      title="Normalize reports to reporting currency"
                      description="Future reporting can convert values to the preferred currency."
                      checked={settings.normalizeReports}
                      onChange={(checked) => updateSetting("normalizeReports", checked)}
                    />
                  </div>
                </FieldBlock>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Invoice defaults"
            eyebrow="Creation workflow"
            action={<SectionIcon icon={<WalletCards className="size-5" />} />}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Default invoice status">
                <select
                  className="field-control"
                  value={settings.defaultStatus}
                  onChange={(event) => updateSetting("defaultStatus", event.target.value as InvoiceStatus)}
                >
                  {["Draft", "Pending", "Due Soon", "Overdue", "Paid", "Partially Paid", "Cancelled"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default priority">
                <select
                  className="field-control"
                  value={settings.defaultPriority}
                  onChange={(event) => updateSetting("defaultPriority", event.target.value as InvoicePriority)}
                >
                  {["Low", "Medium", "High", "Critical"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default reminder lead time">
                <NumberInput
                  value={settings.defaultReminderLeadDays}
                  suffix="days"
                  onChange={(value) => updateSetting("defaultReminderLeadDays", value)}
                />
              </Field>
              <Field label="Default payment method">
                <select
                  className="field-control"
                  value={settings.defaultPaymentMethod}
                  onChange={(event) => updateSetting("defaultPaymentMethod", event.target.value)}
                >
                  {["Bank transfer", "ACH", "Wire", "Credit card", "Corporate card", "Cash", "Other"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default category">
                <input
                  className="field-control"
                  value={settings.defaultCategory}
                  onChange={(event) => updateSetting("defaultCategory", event.target.value)}
                />
              </Field>
              <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
                  Default preview
                </p>
                <p className="mt-2 text-sm font-semibold text-ink-900">
                  {settings.invoicePrefix}-2026-001
                </p>
                <p className="mt-1 text-sm leading-5 text-ink-600">
                  {settings.defaultStatus} invoice in {settings.baseCurrency}, due {settings.defaultPaymentTerms.toLowerCase()}.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Alert rules"
            eyebrow="Reminder policy"
            action={<SectionIcon icon={<BellRing className="size-5" />} />}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid gap-3">
                <ToggleRow
                  title="Due today alerts"
                  description="Highlight same-day collections and vendor payments."
                  checked={settings.dueTodayAlerts}
                  onChange={(checked) => updateSetting("dueTodayAlerts", checked)}
                />
                <ToggleRow
                  title="Due tomorrow alerts"
                  description="Prepare next-day follow-up before the deadline arrives."
                  checked={settings.dueTomorrowAlerts}
                  onChange={(checked) => updateSetting("dueTomorrowAlerts", checked)}
                />
                <ToggleRow
                  title="Overdue alerts"
                  description="Escalate invoices after they pass the due date."
                  checked={settings.overdueAlerts}
                  onChange={(checked) => updateSetting("overdueAlerts", checked)}
                />
                <ToggleRow
                  title="Large-value alerts"
                  description="Flag high-value invoices using separate TTD and USD thresholds."
                  checked={settings.largeValueAlerts}
                  onChange={(checked) => updateSetting("largeValueAlerts", checked)}
                />
              </div>

              <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4">
                <p className="text-sm font-black text-ink-900">Materiality thresholds</p>
                <p className="mt-1 text-sm leading-5 text-ink-600">
                  Thresholds are currency-specific so alerts are not ambiguous.
                </p>
                {settings.largeValueAlerts ? (
                  <div className="mt-4 space-y-4">
                    <Field label="Large-value threshold (TTD)">
                      <CurrencyInput
                        currency="TTD"
                        value={settings.ttdLargeThreshold}
                        onChange={(value) => updateSetting("ttdLargeThreshold", value)}
                      />
                    </Field>
                    <Field label="Large-value threshold (USD)">
                      <CurrencyInput
                        currency="USD"
                        value={settings.usdLargeThreshold}
                        onChange={(value) => updateSetting("usdLargeThreshold", value)}
                      />
                    </Field>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-ink-100 bg-white p-3 text-sm font-semibold text-ink-500">
                    Large-value alerts are off.
                  </p>
                )}
              </div>

              <div className="grid gap-4 lg:col-span-2 md:grid-cols-2">
                <Field label="Reminder lead time">
                  <NumberInput
                    value={settings.reminderLeadDays}
                    suffix="days before due"
                    onChange={(value) => updateSetting("reminderLeadDays", value)}
                  />
                </Field>
                <Field label="Escalate after overdue">
                  <NumberInput
                    value={settings.overdueEscalationDays}
                    suffix="days overdue"
                    onChange={(value) => updateSetting("overdueEscalationDays", value)}
                  />
                </Field>
                <Field label="Collect alert action">
                  <select
                    className="field-control"
                    value={settings.collectReminderTone}
                    onChange={(event) => updateSetting("collectReminderTone", event.target.value)}
                  >
                    {["Send reminder", "Call customer", "Record payment", "Review dispute"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Pay alert action">
                  <select
                    className="field-control"
                    value={settings.payReminderTone}
                    onChange={(event) => updateSetting("payReminderTone", event.target.value)}
                  >
                    {["Schedule payment review", "Mark as paid", "Await approval", "Upload payment proof"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Export and preferences"
            eyebrow="Working view"
            action={<SectionIcon icon={<FileDown className="size-5" />} />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Default export format">
                <select
                  className="field-control"
                  value={settings.defaultExportFormat}
                  onChange={(event) => updateSetting("defaultExportFormat", event.target.value)}
                >
                  {["CSV", "XLSX", "PDF (future-ready)"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Export currency behavior">
                <select
                  className="field-control"
                  value={settings.exportCurrencyBehavior}
                  onChange={(event) => updateSetting("exportCurrencyBehavior", event.target.value)}
                >
                  {[
                    "Preserve invoice currency",
                    `Normalize to ${settings.reportingCurrency}`,
                    "Include both invoice and reporting currency"
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Export date format">
                <select
                  className="field-control"
                  value={settings.exportDateFormat}
                  onChange={(event) => updateSetting("exportDateFormat", event.target.value)}
                >
                  {["Workspace date format", "YYYY-MM-DD", "DD/MM/YYYY", "MMM D, YYYY"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Number formatting">
                <select
                  className="field-control"
                  value={settings.numberFormat}
                  onChange={(event) => updateSetting("numberFormat", event.target.value)}
                >
                  {["1,234.56", "1 234.56", "1.234,56"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 lg:col-span-2 md:grid-cols-2">
                <ToggleRow
                  title="Include notes in export"
                  description="Add invoice notes and internal remarks when exporting."
                  checked={settings.includeNotesInExport}
                  onChange={(checked) => updateSetting("includeNotesInExport", checked)}
                />
                <ToggleRow
                  title="Include dismissed alerts"
                  description="Keep resolved alert history available for audit exports."
                  checked={settings.includeDismissedAlerts}
                  onChange={(checked) => updateSetting("includeDismissedAlerts", checked)}
                />
                <ToggleRow
                  title="Save filters by page"
                  description="Remember ledger, alert, and analytics filters per workspace page."
                  checked={settings.saveFiltersByPage}
                  onChange={(checked) => updateSetting("saveFiltersByPage", checked)}
                />
                <ToggleRow
                  title="Restore last working view"
                  description="Return users to the last operational view when they reopen the app."
                  checked={settings.restoreLastView}
                  onChange={(checked) => updateSetting("restoreLastView", checked)}
                />
              </div>
              <div className="lg:col-span-2">
                <Button variant="secondary" onClick={resetSavedViews}>
                  <RotateCcw className="size-4" />
                  Reset saved views
                </Button>
              </div>
            </div>
          </SectionCard>

          <UserManagement
            canManageUsers={canManageUsers}
            users={workspaceUsers}
            usersLoading={usersLoading}
            inviteFullName={inviteFullName}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            inviteLoading={inviteLoading}
            onInviteFullNameChange={setInviteFullName}
            onInviteEmailChange={setInviteEmail}
            onInviteRoleChange={setInviteRole}
            onInvite={inviteWorkspaceUser}
            onRefresh={loadWorkspaceUsers}
          />

          <EmailTools
            recipients={emailRecipients}
            onRecipientsChange={setEmailRecipients}
            stats={emailStats}
            preview={emailPreview}
            message={emailToolMessage}
            loading={emailLoading}
            lastAttempt={lastEmailAttempt}
            onPreview={previewMonthEndEmail}
            onSendTest={sendMonthEndTestEmail}
          />

          <AdvancedTools onDemoReset={handleDemoReset} />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Workspace summary
                </p>
                <h2 className="mt-1 text-lg font-black text-ink-900">
                  Operating defaults
                </h2>
              </div>
              <Globe2 className="size-5 text-emerald-700" />
            </div>
            <div className="mt-5 space-y-3">
              <SummaryLine label="Base currency" value={settings.baseCurrency} />
              <SummaryLine label="Reporting" value={settings.reportingCurrency} />
              <SummaryLine
                label="Supported"
                value={settings.supportedCurrencies.join(", ")}
              />
              <SummaryLine label="Terms" value={settings.defaultPaymentTerms} />
              <SummaryLine label="Time zone" value={settings.timeZone} />
            </div>
            <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-sm font-black text-emerald-900">
                {formatCurrency(settings.ttdLargeThreshold, "TTD")} TTD threshold
              </p>
              <p className="mt-1 text-sm leading-5 text-emerald-800">
                USD materiality starts at {formatCurrency(settings.usdLargeThreshold, "USD")}.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-black text-ink-900">Save status</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {dirty
                ? "You have unsaved changes. Save or reset them before leaving the workspace."
                : "All settings are saved locally for this workspace."}
            </p>
            <div className="mt-4 grid gap-2">
              <Button onClick={saveChanges} disabled={!dirty || !hydrated} className="w-full">
                Save changes
              </Button>
              <Button variant="secondary" onClick={resetChanges} disabled={!dirty} className="w-full">
                Reset changes
              </Button>
            </div>
          </Card>
        </aside>
      </section>

      <div className="sticky bottom-20 z-20 mt-4 rounded-lg border border-ink-200 bg-white/95 p-3 shadow-luxury backdrop-blur xl:hidden">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={saveChanges} disabled={!dirty || !hydrated} className="w-full">
            Save changes
          </Button>
          <Button variant="secondary" onClick={resetChanges} disabled={!dirty} className="w-full">
            Reset changes
          </Button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      {children}
      {helper ? <p className="mt-1.5 text-xs leading-5 text-ink-500">{helper}</p> : null}
    </label>
  );
}

function FieldBlock({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      {children}
      {helper ? <p className="mt-1.5 text-xs leading-5 text-ink-500">{helper}</p> : null}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border border-ink-200 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/35">
      <input
        type="checkbox"
        className="mt-1 rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-900">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-ink-600">{description}</span>
      </span>
    </label>
  );
}

function UserManagement({
  canManageUsers,
  users,
  usersLoading,
  inviteFullName,
  inviteEmail,
  inviteRole,
  inviteLoading,
  onInviteFullNameChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onRefresh
}: {
  canManageUsers: boolean;
  users: WorkspaceUser[];
  usersLoading: boolean;
  inviteFullName: string;
  inviteEmail: string;
  inviteRole: string;
  inviteLoading: boolean;
  onInviteFullNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: string) => void;
  onInvite: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onInvite();
  }

  return (
    <SectionCard
      title="Users"
      eyebrow="Invite-only access"
      action={<SectionIcon icon={<Users className="size-5" />} />}
    >
      {canManageUsers ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form className="grid gap-4" onSubmit={submitInvite}>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-sm font-black text-emerald-900">Admin invite flow</p>
              <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                Invited users receive a secure setup email, set a password, then sign in.
              </p>
            </div>

            <Field label="Full name">
              <input
                className="field-control"
                value={inviteFullName}
                onChange={(event) => onInviteFullNameChange(event.target.value)}
                autoComplete="name"
                required
              />
            </Field>

            <Field label="Email address">
              <input
                className="field-control"
                type="email"
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Workspace role">
              <select
                className="field-control"
                value={inviteRole}
                onChange={(event) => onInviteRoleChange(event.target.value)}
              >
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </Field>

            <Button type="submit" disabled={inviteLoading}>
              <UserPlus className="size-4" />
              {inviteLoading ? "Sending invite..." : "Invite user"}
            </Button>
          </form>

          <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-ink-900">Workspace users</p>
                <p className="mt-1 text-sm leading-5 text-ink-600">
                  {users.length} user{users.length === 1 ? "" : "s"} can access this workspace.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onRefresh()}
                disabled={usersLoading}
              >
                {usersLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {usersLoading && !users.length ? (
                <p className="rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm font-semibold text-ink-500">
                  Loading users...
                </p>
              ) : null}

              {!usersLoading && !users.length ? (
                <p className="rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm font-semibold text-ink-500">
                  No workspace users loaded yet.
                </p>
              ) : null}

              {users.map((user) => (
                <div
                  key={user.membershipId}
                  className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-ink-50/65 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink-900">
                      {user.fullName || user.email || "Invited user"}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-ink-500">
                      {user.email || "Email pending"}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Added {formatDateTime(user.addedAt)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-ink-600">
                    {user.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-citrine-100 bg-citrine-50/60 p-4">
          <p className="text-sm font-black text-citrine-900">Owner or admin access required</p>
          <p className="mt-1 text-sm leading-6 text-citrine-900/80">
            Your role can use the workspace, but only owners and admins can invite users.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function EmailTools({
  recipients,
  onRecipientsChange,
  stats,
  preview,
  message,
  loading,
  lastAttempt,
  onPreview,
  onSendTest
}: {
  recipients: string;
  onRecipientsChange: (value: string) => void;
  stats: EmailToolStats;
  preview: EmailPreviewState;
  message: EmailToolMessage | null;
  loading: "preview" | "send" | null;
  lastAttempt: string | null;
  onPreview: () => void;
  onSendTest: () => void;
}) {
  return (
    <SectionCard
      title="Email tools"
      eyebrow="Internal testing"
      action={<SectionIcon icon={<Mail className="size-5" />} />}
    >
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <Field
            label="Recipient email"
            helper="Use commas, semicolons, or new lines for multiple internal recipients."
          >
            <textarea
              rows={3}
              className="field-control min-h-24 resize-y"
              placeholder="finance@example.com"
              value={recipients}
              onChange={(event) => onRecipientsChange(event.target.value)}
            />
          </Field>

          <div className="rounded-lg border border-citrine-100 bg-citrine-50/55 p-4">
            <p className="text-sm font-bold text-citrine-900">
              Manual test flow
            </p>
            <p className="mt-1 text-sm leading-6 text-citrine-900/80">
              This uses the current in-app invoice dataset from your browser. Automatic month-end sending should wait until invoices are stored in server-accessible persistence.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <EmailStatCard
              label="Open receivables"
              count={stats.receivables.count}
              ttd={stats.receivables.totals.TTD}
              usd={stats.receivables.totals.USD}
            />
            <EmailStatCard
              label="Open payables"
              count={stats.payables.count}
              ttd={stats.payables.totals.TTD}
              usd={stats.payables.totals.USD}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={onPreview}
              disabled={loading !== null}
              className="w-full"
            >
              {loading === "preview" ? "Building preview..." : "Preview month-end summary"}
            </Button>
            <Button onClick={onSendTest} disabled={loading !== null} className="w-full">
              <Send className="size-4" />
              {loading === "send" ? "Sending..." : "Send test email"}
            </Button>
          </div>

          {message ? <EmailToolMessageCard message={message} /> : null}

          {lastAttempt ? (
            <p className="text-xs font-semibold text-ink-500">
              Last send attempt: {lastAttempt}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 rounded-lg border border-ink-100 bg-ink-50/65 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Month-end preview
              </p>
              <h3 className="mt-1 text-base font-black text-ink-900">
                {preview?.summary.monthLabel ?? "Generate a preview"}
              </h3>
            </div>
            {preview ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink-600">
                {preview.summary.snapshotDateLabel}
              </span>
            ) : null}
          </div>

          {preview ? (
            <div className="mt-4 space-y-4">
              <EmailPreviewSummary summary={preview.summary} />
              <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <iframe
                  title="Month-end email preview"
                  srcDoc={preview.email.html}
                  className="h-[520px] w-full bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-ink-100 bg-white p-4">
              <p className="text-sm font-bold text-ink-900">
                No preview generated yet
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Preview will show who owes you, what you need to pay, overdue groups, and separate TTD and USD totals.
              </p>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function EmailStatCard({
  label,
  count,
  ttd,
  usd
}: {
  label: string;
  count: number;
  ttd: number;
  usd: number;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3">
      <p className="text-sm font-bold text-ink-900">{label}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
        {count} open
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <CurrencyLine currency="TTD" value={formatCurrency(ttd, "TTD")} />
        <CurrencyLine currency="USD" value={formatCurrency(usd, "USD")} />
      </div>
    </div>
  );
}

function CurrencyLine({ currency, value }: { currency: CurrencyCode; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-bold text-ink-500">{currency}</span>
      <span className="text-right font-black text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}

function EmailToolMessageCard({ message }: { message: EmailToolMessage }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        message.tone === "success" && "border-emerald-100 bg-emerald-50 text-emerald-900",
        message.tone === "warning" && "border-citrine-100 bg-citrine-50 text-citrine-900",
        message.tone === "info" && "border-ink-100 bg-ink-50 text-ink-700"
      )}
    >
      <p className="font-black">{message.title}</p>
      <p className="mt-1 whitespace-pre-line leading-5">{message.description}</p>
    </div>
  );
}

function EmailPreviewSummary({ summary }: { summary: MonthEndSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <EmailPreviewSection label="Receivables" section={summary.sections.receivables} />
      <EmailPreviewSection label="Payables" section={summary.sections.payables} />
    </div>
  );
}

function EmailPreviewSection({
  label,
  section
}: {
  label: string;
  section: MonthEndSummary["sections"]["receivables"];
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-3">
      <p className="text-sm font-black text-ink-900">{label}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
        {section.openCount} open | {section.overdue.length} overdue
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <CurrencyLine currency="TTD" value={formatCurrency(section.totalsByCurrency.TTD, "TTD")} />
        <CurrencyLine currency="USD" value={formatCurrency(section.totalsByCurrency.USD, "USD")} />
      </div>
    </div>
  );
}

function CurrencyOption({
  currency,
  checked,
  locked,
  onChange
}: {
  currency: CurrencyCode;
  checked: boolean;
  locked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg border p-3 transition",
        checked
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-ink-200 bg-white hover:border-ink-300",
        locked && "cursor-not-allowed opacity-80"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={onChange}
        className="rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-black text-ink-900">{currency}</span>
        <span className="block truncate text-xs font-semibold text-ink-500">
          {currencyNames[currency]}
        </span>
      </span>
      {locked ? (
        <span className="ml-auto rounded-full bg-white px-2 py-1 text-[11px] font-bold text-ink-500">
          Required
        </span>
      ) : null}
    </label>
  );
}

function CurrencyInput({
  currency,
  value,
  onChange
}: {
  currency: CurrencyCode;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-ink-500">
        {currency}
      </span>
      <input
        inputMode="decimal"
        className="field-control pl-14 font-black"
        value={value}
        onChange={(event) => onChange(parsePositiveNumber(event.target.value))}
      />
    </div>
  );
}

function NumberInput({
  value,
  suffix,
  onChange
}: {
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        className="field-control pr-24 font-black"
        value={value}
        onChange={(event) => onChange(parsePositiveNumber(event.target.value))}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-500">
        {suffix}
      </span>
    </div>
  );
}

function SectionIcon({ icon }: { icon: ReactNode }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
      {icon}
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="max-w-44 text-right text-sm font-black text-ink-900">{value}</p>
    </div>
  );
}

function AdvancedTools({ onDemoReset }: { onDemoReset: () => void }) {
  return (
    <Card className="overflow-hidden">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-500">
              Advanced
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">
              Developer and demo tools
            </h2>
          </div>
          <ChevronDown className="size-5 shrink-0 text-ink-500" />
        </summary>
        <div className="grid gap-4 border-t border-ink-100 p-4 sm:p-5 lg:grid-cols-2">
          <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-4">
            <Database className="size-5 text-ink-600" />
            <p className="mt-3 text-sm font-black text-ink-900">
              Persistence status
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Invoices are stored in Supabase for the active workspace. Settings and alert view preferences still use this browser.
            </p>
          </div>
          <div className="rounded-lg border border-garnet-100 bg-garnet-50/40 p-4">
            <ShieldCheck className="size-5 text-garnet-700" />
            <p className="mt-3 text-sm font-black text-ink-900">
              Demo controls
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Reset sample invoices and local workflow state. Keep this collapsed outside demo or admin use.
            </p>
            <Button variant="danger" className="mt-4" onClick={onDemoReset}>
              <RotateCcw className="size-4" />
              Reset demo data
            </Button>
          </div>
        </div>
      </details>
    </Card>
  );
}

type EmailToolStats = {
  receivables: {
    count: number;
    totals: {
      TTD: number;
      USD: number;
    };
  };
  payables: {
    count: number;
    totals: {
      TTD: number;
      USD: number;
    };
  };
};

type EmailToolApiResponse = {
  ok: boolean;
  summary?: MonthEndSummary;
  email?: RenderedMonthEndEmail;
  error?: string;
  details?: unknown;
  status?: number;
  mailerSendError?: {
    status: number;
    message: string;
    code?: string;
    fieldErrors: Array<{
      field: string;
      messages: string[];
    }>;
    payloadShape?: {
      from?: {
        emailPresent?: boolean;
        namePresent?: boolean;
        domain?: string;
      };
      toCount?: number;
      firstToDomain?: string;
      subjectPresent?: boolean;
      hasHtml?: boolean;
      hasText?: boolean;
      hasTemplateId?: boolean;
    };
  };
};

async function postEmailToolRequest(
  path: string,
  body: Record<string, unknown>
): Promise<{ summary: MonthEndSummary; email: RenderedMonthEndEmail }> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "invoice-tracker-settings"
    },
    body: JSON.stringify(body)
  });
  const data = (await response.json()) as EmailToolApiResponse;

  if (!response.ok || !data.ok || !data.summary || !data.email) {
    throw new Error(formatEmailToolApiError(data));
  }

  return {
    summary: data.summary,
    email: data.email
  };
}

function formatEmailToolApiError(data: EmailToolApiResponse) {
  const mailerSendError = data.mailerSendError;

  if (!mailerSendError) {
    return data.error || "Email tool request failed.";
  }

  const lines = [
    data.error || mailerSendError.message,
    `HTTP ${mailerSendError.status}`,
    mailerSendError.code ? `Code: ${mailerSendError.code}` : "",
    mailerSendError.message ? `MailerSend: ${mailerSendError.message}` : "",
    ...mailerSendError.fieldErrors.map(
      (field) => `${field.field}: ${field.messages.join(" ")}`
    )
  ].filter(Boolean);

  return lines.join("\n");
}

function parseRecipients(value: string): { recipients: string[]; error?: string } {
  const recipients = Array.from(
    new Set(
      value
        .split(/[;,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  if (!recipients.length) {
    return {
      recipients: [],
      error: "Enter at least one internal recipient email before sending."
    };
  }

  const invalid = recipients.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  if (invalid.length) {
    return {
      recipients: [],
      error: `Check recipient email format: ${invalid.join(", ")}.`
    };
  }

  return { recipients };
}

function toMonthEndInvoiceSnapshot(invoice: Invoice): MonthEndInvoiceSnapshot {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    partyName: invoice.partyName,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    amountPaid: invoice.amountPaid,
    balanceRemaining: invoice.balanceRemaining
  };
}

function getEmailToolStats(invoices: Invoice[]): EmailToolStats {
  const stats: EmailToolStats = {
    receivables: {
      count: 0,
      totals: {
        TTD: 0,
        USD: 0
      }
    },
    payables: {
      count: 0,
      totals: {
        TTD: 0,
        USD: 0
      }
    }
  };

  invoices.forEach((invoice) => {
    if (!isEmailOpenInvoice(invoice)) {
      return;
    }

    const target = invoice.type === "receivable" ? stats.receivables : stats.payables;
    target.count += 1;

    if (invoice.currency === "TTD" || invoice.currency === "USD") {
      target.totals[invoice.currency] += invoice.balanceRemaining;
    }
  });

  return stats;
}

function isEmailOpenInvoice(invoice: Invoice) {
  if (invoice.status === "Paid" || invoice.status === "Cancelled") {
    return false;
  }

  return invoice.balanceRemaining > 0;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

function normalizeSettings(input: Partial<WorkspaceSettings>) {
  const next: WorkspaceSettings = {
    ...defaultSettings,
    ...input
  };

  next.baseCurrency = isCurrencyCode(next.baseCurrency) ? next.baseCurrency : "TTD";
  next.reportingCurrency = isCurrencyCode(next.reportingCurrency)
    ? next.reportingCurrency
    : next.baseCurrency;

  const activeCurrencies = next.supportedCurrencies.filter(isCurrencyCode);
  next.supportedCurrencies = sortCurrencies(
    Array.from(new Set([...activeCurrencies, next.baseCurrency, next.reportingCurrency]))
  );

  next.defaultReminderLeadDays = Math.max(0, Number(next.defaultReminderLeadDays) || 0);
  next.reminderLeadDays = Math.max(0, Number(next.reminderLeadDays) || 0);
  next.overdueEscalationDays = Math.max(0, Number(next.overdueEscalationDays) || 0);
  next.ttdLargeThreshold = Math.max(0, Number(next.ttdLargeThreshold) || 0);
  next.usdLargeThreshold = Math.max(0, Number(next.usdLargeThreshold) || 0);

  return next;
}

function sortCurrencies(values: CurrencyCode[]) {
  return currencies.filter((currency) => values.includes(currency));
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencies.includes(value as CurrencyCode);
}
