"use client";

import {
  BellRing,
  Building2,
  ChevronDown,
  Copy,
  Database,
  FileDown,
  Globe2,
  KeyRound,
  Mail,
  Pencil,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
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
import { createClient } from "@/lib/supabase/client";
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
  deliveryMethod?: "email_invite" | "temporary_password";
  ownershipTransferred?: boolean;
  temporaryPassword?: string;
  passwordResetRequired?: boolean;
  replacedExistingPassword?: boolean;
  user?: WorkspaceUser;
  error?: string;
};

type DeleteWorkspaceUserResponse = {
  removed?: boolean;
  accountDeleted?: boolean;
  authDeletionWarning?: string | null;
  user?: WorkspaceUser;
  error?: string;
};

type UpdateWorkspaceUserResponse = {
  updated?: boolean;
  ownershipTransferred?: boolean;
  user?: WorkspaceUser;
  error?: string;
};

type MonthEndAutomationRun = {
  id: string;
  runType: "manual_preview" | "manual_send" | "auto_check" | "auto_send";
  status: "success" | "skipped" | "failed";
  reason: string | null;
  recipientEmail: string | null;
  snapshotMonth: string | null;
  snapshotDate: string | null;
  timeZone: string | null;
  providerMessageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type MonthEndAutomationOverview = {
  enabled: boolean;
  scheduleUtc: string;
  workspaceId: string;
  workspaceName: string;
  businessEmail: string;
  timeZone: string;
  todayLocalDate: string;
  nextMonthEndDate: string;
  lastCheck: MonthEndAutomationRun | null;
  lastSuccessfulAutoSend: MonthEndAutomationRun | null;
  lastSuccessfulManualSend: MonthEndAutomationRun | null;
  recentRuns: MonthEndAutomationRun[];
};

type MonthEndAutomationOverviewResponse = {
  ok?: boolean;
  enabled?: boolean;
  scheduleUtc?: string;
  workspaceId?: string;
  workspaceName?: string;
  businessEmail?: string;
  timeZone?: string;
  todayLocalDate?: string;
  nextMonthEndDate?: string;
  lastCheck?: MonthEndAutomationRun | null;
  lastSuccessfulAutoSend?: MonthEndAutomationRun | null;
  lastSuccessfulManualSend?: MonthEndAutomationRun | null;
  recentRuns?: MonthEndAutomationRun[];
  error?: string;
};

type ProvisionMethod = "email_invite" | "temporary_password";

type TemporaryPasswordResult = {
  fullName: string;
  email: string;
  role: string;
  temporaryPassword: string;
  replacedExistingPassword: boolean;
};

type WorkspaceSettingsRow = {
  workspace_id: string;
  business_name: string;
  finance_email: string;
  base_currency: CurrencyCode;
  reporting_currency: CurrencyCode;
  supported_currencies: CurrencyCode[];
  allow_multi_currency: boolean;
  normalize_reports: boolean;
  default_payment_terms: string;
  time_zone: string;
  date_format: string;
  invoice_prefix: string;
  default_status: InvoiceStatus;
  default_priority: InvoicePriority;
  default_reminder_lead_days: number;
  default_payment_method: string;
  default_category: string;
  due_today_alerts: boolean;
  due_tomorrow_alerts: boolean;
  overdue_alerts: boolean;
  large_value_alerts: boolean;
  reminder_lead_days: number;
  overdue_escalation_days: number;
  ttd_large_threshold: number | string;
  usd_large_threshold: number | string;
  collect_reminder_tone: string;
  pay_reminder_tone: string;
  default_export_format: string;
  include_notes_in_export: boolean;
  include_dismissed_alerts: boolean;
  export_currency_behavior: string;
  export_date_format: string;
  number_format: string;
  save_filters_by_page: boolean;
  restore_last_view: boolean;
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
  const supabase = useMemo(() => createClient(), []);
  const { workspace, user } = useAuth();
  const { invoices, resetDemoData } = useInvoices();
  const { notify } = useToast();
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreviewState>(null);
  const [emailToolMessage, setEmailToolMessage] = useState<EmailToolMessage | null>(null);
  const [emailLoading, setEmailLoading] = useState<"preview" | "send" | null>(null);
  const [lastEmailAttempt, setLastEmailAttempt] = useState<string | null>(null);
  const [automationOverview, setAutomationOverview] = useState<MonthEndAutomationOverview | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [managingUser, setManagingUser] = useState<WorkspaceUser | null>(null);
  const [manageUserRole, setManageUserRole] = useState("member");
  const [userRoleSaving, setUserRoleSaving] = useState(false);
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [userProvisionLoading, setUserProvisionLoading] = useState<ProvisionMethod | null>(null);
  const [temporaryPasswordResult, setTemporaryPasswordResult] = useState<TemporaryPasswordResult | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const canManageUsers = workspace.role === "owner" || workspace.role === "admin";
  const canManageWorkspaceSettings = workspace.role === "owner" || workspace.role === "admin";
  const businessEmail = useMemo(() => savedSettings.financeEmail.trim().toLowerCase(), [savedSettings.financeEmail]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      const stored = readStoredWorkspaceSettings();
      const localSettings = stored ? normalizeSettings(stored) : null;
      const localHasCustomSettings =
        localSettings && !areSettingsEqual(localSettings, defaultSettings);

      try {
        const { data, error } = await supabase
          .from("workspace_settings")
          .select(
            "workspace_id, business_name, finance_email, base_currency, reporting_currency, supported_currencies, allow_multi_currency, normalize_reports, default_payment_terms, time_zone, date_format, invoice_prefix, default_status, default_priority, default_reminder_lead_days, default_payment_method, default_category, due_today_alerts, due_tomorrow_alerts, overdue_alerts, large_value_alerts, reminder_lead_days, overdue_escalation_days, ttd_large_threshold, usd_large_threshold, collect_reminder_tone, pay_reminder_tone, default_export_format, include_notes_in_export, include_dismissed_alerts, export_currency_behavior, export_date_format, number_format, save_filters_by_page, restore_last_view"
          )
          .eq("workspace_id", workspace.id)
          .maybeSingle<WorkspaceSettingsRow>();

        if (error) {
          throw error;
        }

        let next =
          data ? normalizeSettings(fromWorkspaceSettingsRow(data)) : localSettings ?? defaultSettings;
        const databaseSettings = data ? normalizeSettings(fromWorkspaceSettingsRow(data)) : null;
        const shouldMigrateLocalSettings =
          Boolean(localHasCustomSettings) &&
          canManageWorkspaceSettings &&
          (!databaseSettings || areSettingsEqual(databaseSettings, defaultSettings));

        if (shouldMigrateLocalSettings && localSettings) {
          const { error: saveError } = await supabase
            .from("workspace_settings")
            .upsert(toWorkspaceSettingsRow(localSettings, workspace.id));

          if (saveError) {
            throw saveError;
          }

          next = localSettings;
        }

        if (!active) {
          return;
        }

        setSettings(next);
        setSavedSettings(next);
      } catch (error) {
        if (!active) {
          return;
        }

        const fallback = localSettings ?? defaultSettings;
        setSettings(fallback);
        setSavedSettings(fallback);
        notify({
          title: "Settings sync unavailable",
          description:
            error instanceof Error
              ? error.message
              : "Workspace settings could not be loaded from Supabase.",
          variant: "warning"
        });
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, [canManageWorkspaceSettings, notify, supabase, workspace.id]);

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

  const loadMonthEndAutomationOverview = useCallback(async () => {
    if (!canManageWorkspaceSettings) {
      setAutomationOverview(null);
      return;
    }

    setAutomationLoading(true);

    try {
      const response = await fetch("/api/internal/email/month-end-automation-status", {
        headers: {
          "X-Requested-With": "invoice-tracker-settings"
        }
      });
      const data = (await response.json()) as MonthEndAutomationOverviewResponse;

      if (!response.ok || data.error || !data.workspaceId || !data.scheduleUtc || !data.timeZone || !data.todayLocalDate || !data.nextMonthEndDate) {
        throw new Error(data.error || "Month-end automation status could not be loaded.");
      }

      setAutomationOverview({
        enabled: Boolean(data.enabled),
        scheduleUtc: data.scheduleUtc,
        workspaceId: data.workspaceId,
        workspaceName: data.workspaceName ?? "",
        businessEmail: data.businessEmail ?? "",
        timeZone: data.timeZone,
        todayLocalDate: data.todayLocalDate,
        nextMonthEndDate: data.nextMonthEndDate,
        lastCheck: data.lastCheck ?? null,
        lastSuccessfulAutoSend: data.lastSuccessfulAutoSend ?? null,
        lastSuccessfulManualSend: data.lastSuccessfulManualSend ?? null,
        recentRuns: data.recentRuns ?? []
      });
    } catch (error) {
      notify({
        title: "Automation status unavailable",
        description:
          error instanceof Error
            ? error.message
            : "The month-end automation overview could not be loaded.",
        variant: "warning"
      });
    } finally {
      setAutomationLoading(false);
    }
  }, [canManageWorkspaceSettings, notify]);

  useEffect(() => {
    if (!canManageUsers) {
      return;
    }

    void loadWorkspaceUsers();
  }, [canManageUsers, loadWorkspaceUsers]);

  useEffect(() => {
    if (!canManageWorkspaceSettings) {
      return;
    }

    void loadMonthEndAutomationOverview();
  }, [canManageWorkspaceSettings, loadMonthEndAutomationOverview]);

  function openUserManager(target: WorkspaceUser) {
    setManagingUser(target);
    setManageUserRole(target.role);
  }

  function closeUserManager() {
    if (userRoleSaving || deletingUserId === managingUser?.id) {
      return;
    }

    setManagingUser(null);
  }

  async function updateWorkspaceUserRole() {
    if (!managingUser) {
      return;
    }

    setUserRoleSaving(true);

    try {
      const response = await fetch("/api/workspace/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "invoice-tracker-settings"
        },
        body: JSON.stringify({
          userId: managingUser.id,
          role: manageUserRole
        })
      });
      const data = (await response.json()) as UpdateWorkspaceUserResponse;

      if (!response.ok || data.error || !data.user) {
        throw new Error(data.error || "The workspace user role could not be updated.");
      }

      setWorkspaceUsers((current) =>
        current.map((item) => (item.id === data.user?.id ? data.user : item))
      );
      setManagingUser(null);

      notify({
        title: data.ownershipTransferred ? "Ownership transferred" : "Role updated",
        description: data.ownershipTransferred
          ? `${data.user.email} is now the workspace owner. Reloading your session role.`
          : `${data.user.fullName || data.user.email} is now ${formatWorkspaceRole(data.user.role)}.`,
        variant: "success"
      });

      if (data.ownershipTransferred) {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch (error) {
      notify({
        title: "Role update failed",
        description:
          error instanceof Error
            ? error.message
            : "The workspace user role could not be updated.",
        variant: "warning"
      });
    } finally {
      setUserRoleSaving(false);
    }
  }

  async function provisionWorkspaceUser(deliveryMethod: ProvisionMethod) {
    setUserProvisionLoading(deliveryMethod);

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
          role: inviteRole,
          deliveryMethod
        })
      });
      const data = (await response.json()) as InviteUserResponse;

      if (!response.ok || data.error) {
        throw new Error(
          data.error ||
            (deliveryMethod === "temporary_password"
              ? "Temporary password could not be generated."
              : "Invite could not be sent.")
        );
      }

      setInviteFullName("");
      setInviteEmail("");
      setInviteRole("member");
      await loadWorkspaceUsers();

      if (deliveryMethod === "temporary_password" && data.temporaryPassword) {
        setTemporaryPasswordResult({
          fullName: data.user?.fullName ?? inviteFullName,
          email: data.user?.email ?? inviteEmail,
          role: data.user?.role ?? inviteRole,
          temporaryPassword: data.temporaryPassword,
          replacedExistingPassword: Boolean(data.replacedExistingPassword)
        });
        notify({
          title: data.ownershipTransferred ? "Ownership transferred" : "Temporary password ready",
          description: data.ownershipTransferred
            ? `${data.user?.email ?? inviteEmail} is now the workspace owner. Share the password securely; your session role will reload.`
            : `${data.user?.email ?? inviteEmail} must change this password on first sign-in.`,
          variant: "success"
        });
        if (data.ownershipTransferred) {
          window.setTimeout(() => window.location.reload(), 900);
        }
        return;
      }

      setTemporaryPasswordResult(null);
      notify({
        title: data.ownershipTransferred
          ? "Ownership transferred"
          : data.invited
            ? "Invite sent"
            : "User added",
        description: data.ownershipTransferred
          ? `${data.user?.email ?? inviteEmail} is now the workspace owner. Reloading your session role.`
          : data.invited
            ? `${data.user?.email ?? inviteEmail} was emailed a secure setup link.`
            : `${data.user?.email ?? inviteEmail} already has an account and can sign in.`,
        variant: "success"
      });

      if (data.ownershipTransferred) {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch (error) {
      notify({
        title: deliveryMethod === "temporary_password" ? "Temporary password failed" : "Invite failed",
        description:
          error instanceof Error
            ? error.message
            : deliveryMethod === "temporary_password"
              ? "The temporary password could not be generated."
              : "The user could not be invited.",
        variant: "warning"
      });
    } finally {
      setUserProvisionLoading(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryPasswordResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(temporaryPasswordResult.temporaryPassword);
      notify({
        title: "Temporary password copied",
        description: "Share it securely with the user. It is only shown here once.",
        variant: "success"
      });
    } catch {
      notify({
        title: "Copy failed",
        description: "Copy the temporary password manually from the settings panel.",
        variant: "warning"
      });
    }
  }

  async function deleteWorkspaceUser(
    target: WorkspaceUser,
    options?: { skipConfirm?: boolean; closeManager?: boolean }
  ) {
    if (
      !options?.skipConfirm &&
      !window.confirm(
        `Delete ${target.fullName || target.email || "this user"} from the workspace?`
      )
    ) {
      return;
    }

    setDeletingUserId(target.id);

    try {
      const response = await fetch("/api/workspace/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "invoice-tracker-settings"
        },
        body: JSON.stringify({
          userId: target.id
        })
      });
      const data = (await response.json()) as DeleteWorkspaceUserResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "The user could not be deleted.");
      }

      setWorkspaceUsers((current) => current.filter((item) => item.id !== target.id));
      if (options?.closeManager || managingUser?.id === target.id) {
        setManagingUser(null);
      }

      notify({
        title: data.accountDeleted ? "User deleted" : "Workspace access removed",
        description: data.accountDeleted
          ? `${target.email || "The user"} was deleted from the system.`
          : data.authDeletionWarning
            ? `${target.email || "The user"} lost workspace access, but the auth account was kept: ${data.authDeletionWarning}`
            : `${target.email || "The user"} can no longer access this workspace.`,
        variant: "success"
      });
    } catch (error) {
      notify({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "The user could not be deleted.",
        variant: "warning"
      });
    } finally {
      setDeletingUserId(null);
    }
  }

  async function saveChanges() {
    const next = normalizeSettings(settings);
    setSettingsSaving(true);

    try {
      const { error } = await supabase
        .from("workspace_settings")
        .upsert(toWorkspaceSettingsRow(next, workspace.id));

      if (error) {
        throw error;
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSettings(next);
      setSavedSettings(next);
      notify({
        title: "Settings saved",
        description: "Workspace defaults, alert rules, and export preferences were updated.",
        variant: "success"
      });
    } catch (error) {
      notify({
        title: "Settings could not be saved",
        description:
          error instanceof Error
            ? error.message
            : "Workspace settings could not be saved to Supabase.",
        variant: "warning"
      });
    } finally {
      setSettingsSaving(false);
    }
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
      if (canManageWorkspaceSettings) {
        void loadMonthEndAutomationOverview();
      }
      setEmailLoading(null);
    }
  }

  async function sendMonthEndTestEmail() {
    if (!businessEmail) {
      setEmailToolMessage({
        tone: "warning",
        title: "Business email missing",
        description: "Add a valid business email in workspace settings before sending the month-end summary."
      });
      return;
    }

    const recipients = [businessEmail];

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
      if (canManageWorkspaceSettings) {
        void loadMonthEndAutomationOverview();
      }
      setEmailLoading(null);
    }
  }

  const headerAction = (
    <>
      <Button variant="secondary" onClick={resetChanges} disabled={!dirty}>
        Reset changes
      </Button>
      <Button onClick={() => void saveChanges()} disabled={!dirty || !hydrated || settingsSaving}>
        <Save className="size-4" />
        {settingsSaving ? "Saving..." : "Save changes"}
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
              <Field label="Business email">
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
            currentUserId={user.id}
            currentWorkspaceRole={workspace.role}
            users={workspaceUsers}
            usersLoading={usersLoading}
            deletingUserId={deletingUserId}
            managingUser={managingUser}
            manageUserRole={manageUserRole}
            userRoleSaving={userRoleSaving}
            inviteFullName={inviteFullName}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            provisionLoading={userProvisionLoading}
            temporaryPasswordResult={temporaryPasswordResult}
            onInviteFullNameChange={(value) => {
              setInviteFullName(value);
              setTemporaryPasswordResult(null);
            }}
            onInviteEmailChange={(value) => {
              setInviteEmail(value);
              setTemporaryPasswordResult(null);
            }}
            onInviteRoleChange={(value) => {
              setInviteRole(value);
              setTemporaryPasswordResult(null);
            }}
            onInvite={() => provisionWorkspaceUser("email_invite")}
            onGenerateTemporaryPassword={() => provisionWorkspaceUser("temporary_password")}
            onCopyTemporaryPassword={copyTemporaryPassword}
            onOpenUserManager={openUserManager}
            onManageUserRoleChange={setManageUserRole}
            onSaveUserRole={updateWorkspaceUserRole}
            onCloseUserManager={closeUserManager}
            onDeleteUser={deleteWorkspaceUser}
            onRefresh={loadWorkspaceUsers}
          />

          <EmailTools
            recipientEmail={businessEmail}
            stats={emailStats}
            preview={emailPreview}
            message={emailToolMessage}
            loading={emailLoading}
            lastAttempt={lastEmailAttempt}
            onPreview={previewMonthEndEmail}
            onSendTest={sendMonthEndTestEmail}
          />

          {canManageWorkspaceSettings ? (
            <MonthEndAutomationSection
              overview={automationOverview}
              loading={automationLoading}
              onRefresh={() => void loadMonthEndAutomationOverview()}
            />
          ) : null}

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
  currentUserId,
  currentWorkspaceRole,
  users,
  usersLoading,
  deletingUserId,
  managingUser,
  manageUserRole,
  userRoleSaving,
  inviteFullName,
  inviteEmail,
  inviteRole,
  provisionLoading,
  temporaryPasswordResult,
  onInviteFullNameChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onGenerateTemporaryPassword,
  onCopyTemporaryPassword,
  onOpenUserManager,
  onManageUserRoleChange,
  onSaveUserRole,
  onCloseUserManager,
  onDeleteUser,
  onRefresh
}: {
  canManageUsers: boolean;
  currentUserId: string;
  currentWorkspaceRole: string;
  users: WorkspaceUser[];
  usersLoading: boolean;
  deletingUserId: string | null;
  managingUser: WorkspaceUser | null;
  manageUserRole: string;
  userRoleSaving: boolean;
  inviteFullName: string;
  inviteEmail: string;
  inviteRole: string;
  provisionLoading: ProvisionMethod | null;
  temporaryPasswordResult: TemporaryPasswordResult | null;
  onInviteFullNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: string) => void;
  onInvite: () => Promise<void>;
  onGenerateTemporaryPassword: () => Promise<void>;
  onCopyTemporaryPassword: () => Promise<void>;
  onOpenUserManager: (user: WorkspaceUser) => void;
  onManageUserRoleChange: (value: string) => void;
  onSaveUserRole: () => Promise<void>;
  onCloseUserManager: () => void;
  onDeleteUser: (
    user: WorkspaceUser,
    options?: { skipConfirm?: boolean; closeManager?: boolean }
  ) => Promise<void>;
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

            <div className="rounded-lg border border-citrine-100 bg-citrine-50/55 p-4">
              <p className="text-sm font-black text-citrine-900">Temporary password fallback</p>
              <p className="mt-1 text-sm leading-6 text-citrine-900/80">
                Use this when email delivery is unavailable. The password is shown once and the user must replace it before the workspace opens.
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
                {currentWorkspaceRole === "owner" ? <option value="owner">Owner</option> : null}
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </Field>

            {currentWorkspaceRole === "owner" && inviteRole === "owner" ? (
              <div className="rounded-lg border border-citrine-100 bg-citrine-50/55 p-4">
                <p className="text-sm font-black text-citrine-900">Ownership transfer</p>
                <p className="mt-1 text-sm leading-6 text-citrine-900/80">
                  Inviting this user as Owner transfers workspace ownership to them and changes the current owner to Admin.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="submit" disabled={provisionLoading !== null} className="w-full">
                <UserPlus className="size-4" />
                {provisionLoading === "email_invite" ? "Sending invite..." : "Invite user"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={provisionLoading !== null}
                onClick={() => void onGenerateTemporaryPassword()}
                className="w-full"
              >
                <KeyRound className="size-4" />
                {provisionLoading === "temporary_password"
                  ? "Generating password..."
                  : "Generate temp password"}
              </Button>
            </div>

            {temporaryPasswordResult ? (
              <Card className="border-citrine-200 bg-citrine-50/45 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-citrine-950">Temporary password created</p>
                    <p className="mt-1 text-sm leading-6 text-citrine-950/80">
                      Share this securely with {temporaryPasswordResult.fullName || temporaryPasswordResult.email}. They will be forced to create a new password on first sign-in.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => void onCopyTemporaryPassword()}
                  >
                    <Copy className="size-4" />
                    Copy password
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-citrine-900/70">User</p>
                    <p className="mt-1 text-sm font-semibold text-ink-900">
                      {temporaryPasswordResult.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-citrine-900/70">Workspace role</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-ink-900">
                      {temporaryPasswordResult.role}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-citrine-200 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-citrine-900/70">Temporary password</p>
                  <p className="mt-1 break-all font-mono text-base font-black text-ink-900">
                    {temporaryPasswordResult.temporaryPassword}
                  </p>
                </div>

                {temporaryPasswordResult.replacedExistingPassword ? (
                  <p className="mt-3 text-sm font-semibold text-citrine-950/80">
                    This email already had an account. The existing password was replaced with this temporary one.
                  </p>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-citrine-950/80">
                    This account can sign in immediately with the temporary password above.
                  </p>
                )}
              </Card>
            ) : null}
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
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      <span className="w-fit rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-ink-600">
                        {user.role}
                      </span>

                      {canManageWorkspaceUser(user, currentUserId) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="size-9 px-0"
                          onClick={() => onOpenUserManager(user)}
                          aria-label={`Manage ${user.fullName || user.email || "workspace user"}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                    </div>

                    {!canManageWorkspaceUser(user, currentUserId) ? (
                      <p className="text-xs font-semibold text-ink-400">
                        {user.id === currentUserId
                          ? "Current account"
                          : user.role === "owner"
                            ? "Owner protected"
                            : ""}
                      </p>
                    ) : currentWorkspaceRole !== "owner" && user.role === "admin" ? (
                      <p className="text-xs font-semibold text-ink-400">Owner required to delete</p>
                    ) : null}
                  </div>
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

      <ManageWorkspaceUserDialog
        open={Boolean(managingUser)}
        user={managingUser}
        currentWorkspaceRole={currentWorkspaceRole}
        currentUserId={currentUserId}
        selectedRole={manageUserRole}
        saving={userRoleSaving}
        deleting={deletingUserId === managingUser?.id}
        onRoleChange={onManageUserRoleChange}
        onClose={onCloseUserManager}
        onSave={onSaveUserRole}
        onDelete={() =>
          managingUser
            ? onDeleteUser(managingUser, { skipConfirm: true, closeManager: true })
            : Promise.resolve()
        }
      />
    </SectionCard>
  );
}

function ManageWorkspaceUserDialog({
  open,
  user,
  currentWorkspaceRole,
  currentUserId,
  selectedRole,
  saving,
  deleting,
  onRoleChange,
  onClose,
  onSave,
  onDelete
}: {
  open: boolean;
  user: WorkspaceUser | null;
  currentWorkspaceRole: string;
  currentUserId: string;
  selectedRole: string;
  saving: boolean;
  deleting: boolean;
  onRoleChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  if (!open || !user) {
    return null;
  }

  const canDelete = canDeleteWorkspaceUser(user, currentUserId, currentWorkspaceRole);
  const canTransferOwnership = currentWorkspaceRole === "owner";
  const roleUnchanged = selectedRole === user.role;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-user-title"
        className="w-full max-w-lg rounded-lg border border-ink-200 bg-white p-5 shadow-luxury"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              User management
            </p>
            <h2 id="manage-user-title" className="mt-2 text-2xl font-black text-ink-900">
              Update workspace user
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Review the user role or remove access from this workspace.
            </p>
          </div>
          <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Added
            </p>
            <p className="mt-1 text-sm font-black text-ink-900">{formatDateTime(user.addedAt)}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4">
            <p className="text-sm font-black text-ink-900">{user.fullName || "Workspace user"}</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">{user.email || "Email pending"}</p>
          </div>

          <Field label="Workspace role">
            <select
              className="field-control"
              value={selectedRole}
              onChange={(event) => onRoleChange(event.target.value)}
              disabled={saving || deleting}
            >
              {canTransferOwnership ? <option value="owner">Owner</option> : null}
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

          {canTransferOwnership && selectedRole === "owner" ? (
            <div className="rounded-lg border border-citrine-100 bg-citrine-50/55 p-4">
              <p className="text-sm font-black text-citrine-900">Ownership transfer</p>
              <p className="mt-1 text-sm leading-6 text-citrine-900/80">
                Saving this change will make {user.fullName || user.email} the workspace owner and change the current owner to Admin.
              </p>
            </div>
          ) : null}

          {!canDelete ? (
            <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4">
              <p className="text-sm font-black text-ink-900">Delete access unavailable</p>
              <p className="mt-1 text-sm leading-6 text-ink-600">
                {user.role === "admin" && currentWorkspaceRole !== "owner"
                  ? "Only the workspace owner can delete another admin."
                  : "This account cannot be deleted from this panel."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            {canDelete ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void onDelete()}
                disabled={saving || deleting}
                className="w-full sm:w-auto"
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting..." : "Delete user"}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving || deleting}
              className="sm:min-w-32"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || deleting || roleUnchanged}
              className="sm:min-w-32"
            >
              {saving ? "Saving..." : "Save role"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailTools({
  recipientEmail,
  stats,
  preview,
  message,
  loading,
  lastAttempt,
  onPreview,
  onSendTest
}: {
  recipientEmail: string;
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
            label="Delivery email"
            helper="Manual month-end test sends go directly to the saved business email from workspace settings."
          >
            <input
              type="email"
              className="field-control"
              value={recipientEmail}
              placeholder="Business email required"
              readOnly
            />
          </Field>

          <div className="rounded-lg border border-citrine-100 bg-citrine-50/55 p-4">
            <p className="text-sm font-bold text-citrine-900">
              Manual test flow
            </p>
            <p className="mt-1 text-sm leading-6 text-citrine-900/80">
              This uses the current in-app invoice dataset from your browser and sends the summary to the business email shown above. The automatic month-end job runs server-side from the saved Supabase invoice data after deployment.
            </p>
          </div>

          {!recipientEmail ? (
            <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-4">
              <p className="text-sm font-black text-rose-900">Business email required</p>
              <p className="mt-1 text-sm leading-6 text-rose-900/80">
                Add a valid business email in workspace settings before using the month-end email tools.
              </p>
            </div>
          ) : null}

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

function MonthEndAutomationSection({
  overview,
  loading,
  onRefresh
}: {
  overview: MonthEndAutomationOverview | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestActivity =
    overview?.recentRuns[0] ??
    overview?.lastCheck ??
    overview?.lastSuccessfulAutoSend ??
    overview?.lastSuccessfulManualSend ??
    null;
  const historyRuns = latestActivity
    ? (overview?.recentRuns ?? []).filter((run) => run.id !== latestActivity.id)
    : (overview?.recentRuns ?? []);

  return (
    <SectionCard
      title="Month-end automation"
      eyebrow="Scheduler and activity log"
      action={<SectionIcon icon={<Database className="size-5" />} />}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-ink-900">Automatic business email delivery</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              The cron route checks once per day, then sends only on the last local day of the month for this workspace.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh activity"}
          </Button>
        </div>

        {overview ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AutomationMetricCard
                label="Automation status"
                value={overview.enabled ? "Active" : "Disabled"}
                helper={overview.enabled ? `UTC schedule ${overview.scheduleUtc}` : "Add CRON_SECRET in Vercel to enable automated delivery."}
                tone={overview.enabled ? "success" : "warning"}
              />
              <AutomationMetricCard
                label="Business email"
                value={overview.businessEmail || "Missing"}
                helper="Month-end email recipient"
              />
              <AutomationMetricCard
                label="Workspace time zone"
                value={overview.timeZone}
                helper={`Local today ${overview.todayLocalDate}`}
              />
              <AutomationMetricCard
                label="Next month-end"
                value={overview.nextMonthEndDate}
                helper="Local workspace date"
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <AutomationEventCard
                title="Last check"
                run={overview.lastCheck}
                emptyText="No automated checks recorded yet."
              />
              <AutomationEventCard
                title="Last automatic delivery"
                run={overview.lastSuccessfulAutoSend}
                emptyText="No successful automatic deliveries yet."
              />
              <AutomationEventCard
                title="Last manual test send"
                run={overview.lastSuccessfulManualSend}
                emptyText="No successful manual test sends yet."
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-black text-ink-900">Latest activity</p>
                <p className="mt-1 text-sm leading-5 text-ink-600">
                  The newest month-end event stays visible. Older checks and sends are available in the collapsible history below.
                </p>
              </div>

              {latestActivity ? (
                <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-ink-700">
                          {formatMonthEndRunType(latestActivity.runType)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]",
                            getMonthEndRunStatusClasses(latestActivity.status)
                          )}
                        >
                          {latestActivity.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-ink-900">
                        {formatDateTime(latestActivity.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                        <span>Period: {latestActivity.snapshotMonth || "Not set"}</span>
                        <span>Recipient: {latestActivity.recipientEmail || "Not set"}</span>
                        <span>Time zone: {latestActivity.timeZone || "Not set"}</span>
                      </div>
                      {latestActivity.reason ? (
                        <p className="mt-2 text-sm leading-6 text-ink-700">{latestActivity.reason}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-1 text-sm text-ink-500 lg:text-right">
                      <span>Snapshot date: {latestActivity.snapshotDate || "Not set"}</span>
                      <span>Message ID: {latestActivity.providerMessageId || "Not sent"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4 text-sm font-semibold text-ink-500">
                  No month-end automation activity has been recorded yet.
                </div>
              )}

              {historyRuns.length ? (
                <div className="rounded-lg border border-ink-100 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setHistoryOpen((current) => !current)}
                  >
                    <div>
                      <p className="text-sm font-black text-ink-900">History</p>
                      <p className="mt-1 text-sm leading-5 text-ink-600">
                        {historyRuns.length} older month-end {historyRuns.length === 1 ? "event" : "events"}.
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 text-ink-500 transition-transform",
                        historyOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {historyOpen ? (
                    <div className="space-y-3 border-t border-ink-100 px-4 py-4">
                      {historyRuns.map((run) => (
                        <div
                          key={run.id}
                          className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-ink-50/65 p-3 lg:flex-row lg:items-start lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-ink-700">
                                {formatMonthEndRunType(run.runType)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]",
                                  getMonthEndRunStatusClasses(run.status)
                                )}
                              >
                                {run.status}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-ink-900">
                              {formatDateTime(run.createdAt)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                              <span>Period: {run.snapshotMonth || "Not set"}</span>
                              <span>Recipient: {run.recipientEmail || "Not set"}</span>
                              <span>Time zone: {run.timeZone || "Not set"}</span>
                            </div>
                            {run.reason ? (
                              <p className="mt-2 text-sm leading-6 text-ink-700">{run.reason}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-1 text-sm text-ink-500 lg:text-right">
                            <span>Snapshot date: {run.snapshotDate || "Not set"}</span>
                            <span>Message ID: {run.providerMessageId || "Not sent"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4 text-sm font-semibold text-ink-500">
            {loading ? "Loading month-end automation overview..." : "Month-end automation overview is unavailable."}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function AutomationMetricCard({
  label,
  value,
  helper,
  tone = "neutral"
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "success" && "border-emerald-100 bg-emerald-50/55",
        tone === "warning" && "border-citrine-100 bg-citrine-50/55",
        tone === "neutral" && "border-ink-100 bg-ink-50/65"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className="mt-2 break-words text-base font-black text-ink-900">{value}</p>
      <p className="mt-1 text-sm leading-5 text-ink-600">{helper}</p>
    </div>
  );
}

function AutomationEventCard({
  title,
  run,
  emptyText
}: {
  title: string;
  run: MonthEndAutomationRun | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/65 p-4">
      <p className="text-sm font-black text-ink-900">{title}</p>
      {run ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-ink-700">
              {formatMonthEndRunType(run.runType)}
            </span>
            <span className={cn("rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]", getMonthEndRunStatusClasses(run.status))}>
              {run.status}
            </span>
          </div>
          <p className="font-semibold text-ink-900">{formatDateTime(run.createdAt)}</p>
          <p className="text-ink-600">Period {run.snapshotMonth || "Not set"}</p>
          {run.reason ? <p className="leading-6 text-ink-700">{run.reason}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-500">{emptyText}</p>
      )}
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

function formatMonthEndRunType(value: MonthEndAutomationRun["runType"]) {
  if (value === "manual_preview") {
    return "Manual preview";
  }

  if (value === "manual_send") {
    return "Manual send";
  }

  if (value === "auto_check") {
    return "Auto check";
  }

  return "Auto send";
}

function getMonthEndRunStatusClasses(status: MonthEndAutomationRun["status"]) {
  if (status === "success") {
    return "border border-emerald-100 bg-emerald-50 text-emerald-900";
  }

  if (status === "failed") {
    return "border border-rose-100 bg-rose-50 text-rose-900";
  }

  return "border border-citrine-100 bg-citrine-50 text-citrine-900";
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
              Invoices and workspace defaults are stored in Supabase for the active workspace. Alert workflow state still uses this browser.
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

function readStoredWorkspaceSettings() {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as Partial<WorkspaceSettings>;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function fromWorkspaceSettingsRow(row: WorkspaceSettingsRow): WorkspaceSettings {
  return {
    businessName: row.business_name,
    financeEmail: row.finance_email,
    baseCurrency: row.base_currency,
    reportingCurrency: row.reporting_currency,
    supportedCurrencies: row.supported_currencies,
    allowMultiCurrency: row.allow_multi_currency,
    normalizeReports: row.normalize_reports,
    defaultPaymentTerms: row.default_payment_terms,
    timeZone: row.time_zone,
    dateFormat: row.date_format,
    invoicePrefix: row.invoice_prefix,
    defaultStatus: row.default_status,
    defaultPriority: row.default_priority,
    defaultReminderLeadDays: Number(row.default_reminder_lead_days),
    defaultPaymentMethod: row.default_payment_method,
    defaultCategory: row.default_category,
    dueTodayAlerts: row.due_today_alerts,
    dueTomorrowAlerts: row.due_tomorrow_alerts,
    overdueAlerts: row.overdue_alerts,
    largeValueAlerts: row.large_value_alerts,
    reminderLeadDays: Number(row.reminder_lead_days),
    overdueEscalationDays: Number(row.overdue_escalation_days),
    ttdLargeThreshold: Number(row.ttd_large_threshold),
    usdLargeThreshold: Number(row.usd_large_threshold),
    collectReminderTone: row.collect_reminder_tone,
    payReminderTone: row.pay_reminder_tone,
    defaultExportFormat: row.default_export_format,
    includeNotesInExport: row.include_notes_in_export,
    includeDismissedAlerts: row.include_dismissed_alerts,
    exportCurrencyBehavior: row.export_currency_behavior,
    exportDateFormat: row.export_date_format,
    numberFormat: row.number_format,
    saveFiltersByPage: row.save_filters_by_page,
    restoreLastView: row.restore_last_view
  };
}

function toWorkspaceSettingsRow(settings: WorkspaceSettings, workspaceId: string): WorkspaceSettingsRow {
  return {
    workspace_id: workspaceId,
    business_name: settings.businessName,
    finance_email: settings.financeEmail,
    base_currency: settings.baseCurrency,
    reporting_currency: settings.reportingCurrency,
    supported_currencies: settings.supportedCurrencies,
    allow_multi_currency: settings.allowMultiCurrency,
    normalize_reports: settings.normalizeReports,
    default_payment_terms: settings.defaultPaymentTerms,
    time_zone: settings.timeZone,
    date_format: settings.dateFormat,
    invoice_prefix: settings.invoicePrefix,
    default_status: settings.defaultStatus,
    default_priority: settings.defaultPriority,
    default_reminder_lead_days: settings.defaultReminderLeadDays,
    default_payment_method: settings.defaultPaymentMethod,
    default_category: settings.defaultCategory,
    due_today_alerts: settings.dueTodayAlerts,
    due_tomorrow_alerts: settings.dueTomorrowAlerts,
    overdue_alerts: settings.overdueAlerts,
    large_value_alerts: settings.largeValueAlerts,
    reminder_lead_days: settings.reminderLeadDays,
    overdue_escalation_days: settings.overdueEscalationDays,
    ttd_large_threshold: settings.ttdLargeThreshold,
    usd_large_threshold: settings.usdLargeThreshold,
    collect_reminder_tone: settings.collectReminderTone,
    pay_reminder_tone: settings.payReminderTone,
    default_export_format: settings.defaultExportFormat,
    include_notes_in_export: settings.includeNotesInExport,
    include_dismissed_alerts: settings.includeDismissedAlerts,
    export_currency_behavior: settings.exportCurrencyBehavior,
    export_date_format: settings.exportDateFormat,
    number_format: settings.numberFormat,
    save_filters_by_page: settings.saveFiltersByPage,
    restore_last_view: settings.restoreLastView
  };
}

function canDeleteWorkspaceUser(
  user: WorkspaceUser,
  currentUserId: string,
  currentWorkspaceRole: string
) {
  if (user.id === currentUserId) {
    return false;
  }

  if (user.role === "owner") {
    return false;
  }

  if (currentWorkspaceRole !== "owner" && user.role === "admin") {
    return false;
  }

  return true;
}

function canManageWorkspaceUser(user: WorkspaceUser, currentUserId: string) {
  if (user.id === currentUserId) {
    return false;
  }

  if (user.role === "owner") {
    return false;
  }

  return true;
}

function formatWorkspaceRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function areSettingsEqual(left: WorkspaceSettings, right: WorkspaceSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}
