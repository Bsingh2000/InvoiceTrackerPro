"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useInvoices } from "@/components/providers/invoice-provider";
import { getShellAlertSummary } from "@/lib/alert-summary";
import {
  isRouteActive,
  navigationSections,
  newInvoiceItem,
  type NavigationItem
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { invoices } = useInvoices();
  const { user, workspace, signOut } = useAuth();
  useAlertRefreshToken();
  const alertSummary = getShellAlertSummary(invoices);
  const workspaceLabel = workspace.name.trim() || "Workspace";
  const workspaceInitials = getInitials(workspaceLabel);
  const userLabel = getUserDisplayName(user);
  const userPrimaryLabel = getUserPrimaryLabel(user);
  const userInitials = getInitials(userLabel || user.email || "User");
  const roleLabel = formatRoleLabel(workspace.role);

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-ink-200/70 bg-white/94 py-5 backdrop-blur",
        collapsed ? "items-center px-2.5" : "px-4"
      )}
    >
      <div
        className={cn(
          "w-full shrink-0 gap-3",
          collapsed ? "flex flex-col items-center" : "grid grid-cols-[minmax(0,1fr)_auto] items-start"
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "group relative transition hover:border-ink-200 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            collapsed
              ? "flex size-12 items-center justify-center rounded-lg border border-ink-100 bg-ink-50/75"
              : "flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/75 p-2.5"
          )}
          title="Invoice Tracker Pro"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-black uppercase text-white shadow-soft">
            {workspaceInitials}
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-400">
                Workspace
              </p>
              <p className="mt-1 break-words text-[15px] font-black leading-5 text-ink-900">
                {workspaceLabel}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-ink-500">{roleLabel} access</p>
            </div>
          ) : (
            <Tooltip label={workspaceLabel} />
          )}
        </Link>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            collapsed ? "size-11" : "size-10"
          )}
          onClick={onToggle}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className={cn("app-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto", collapsed ? "w-full px-0.5" : "pr-1")}>
        <NewInvoiceLink collapsed={collapsed} active={isRouteActive(pathname, newInvoiceItem.href)} />

        <nav
          className={cn("mt-6 flex flex-col gap-5", collapsed ? "w-full items-center" : "")}
          aria-label="Primary navigation"
        >
          {navigationSections.map((section) => (
            <div
              key={section.title}
              className={cn(
                "w-full",
                section.title === "Workspace" && "mt-1 border-t border-ink-100 pt-4"
              )}
            >
              {!collapsed ? (
                <p className="mb-2 px-3 text-[10px] font-black uppercase leading-4 tracking-[0.16em] text-ink-400">
                  {section.title}
                </p>
              ) : section.title === "Workspace" ? (
                <div className="mx-auto mb-2 h-px w-8 bg-ink-100" />
              ) : null}
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isRouteActive(pathname, item.href)}
                    collapsed={collapsed}
                    alertCount={item.badge === "alerts" ? alertSummary.active : 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className={cn("mt-4 border-t border-ink-100 pt-4", collapsed ? "w-full" : "")}>
        {collapsed ? (
          <div className="mb-3 flex w-full justify-center">
            <div
              className="group relative flex size-11 items-center justify-center rounded-lg border border-ink-100 bg-ink-50/80 text-xs font-black uppercase text-ink-700"
              title={userLabel}
            >
              {userInitials}
              <Tooltip label={userLabel} />
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-ink-100 bg-ink-50/80 p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-xs font-black uppercase text-ink-800 shadow-soft">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-400">
                  Signed in user
                </p>
                <p className="mt-1 break-words text-sm font-black leading-5 text-ink-900">{userPrimaryLabel}</p>
                <p className="mt-2 break-all text-xs font-semibold leading-5 text-ink-500">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          className={cn(
            "group relative flex w-full items-center rounded-lg border border-transparent text-sm font-semibold text-ink-600 transition hover:border-ink-100 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            collapsed ? "mx-auto size-11 justify-center px-0" : "min-h-11 gap-3 px-3.5"
          )}
          onClick={() => void signOut()}
          title="Sign out"
        >
          <LogOut className="size-4 shrink-0 text-ink-400 group-hover:text-ink-700" />
          {!collapsed ? <span>Sign out</span> : <Tooltip label="Sign out" />}
        </button>
      </div>
    </aside>
  );
}

function NewInvoiceLink({ collapsed, active }: { collapsed: boolean; active: boolean }) {
  const Icon = newInvoiceItem.icon;

  return (
    <Link
      href={newInvoiceItem.href}
      className={cn(
        "group relative flex w-full shrink-0 items-center justify-center rounded-lg bg-emerald-700 font-bold text-white shadow-soft transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        collapsed ? "mx-auto size-12 px-0" : "min-h-12 gap-2 px-4 text-sm",
        active && "bg-ink-900 hover:bg-ink-800"
      )}
      title={newInvoiceItem.title}
    >
      <Icon className="size-5 shrink-0" />
      {!collapsed ? <span>{newInvoiceItem.title}</span> : <Tooltip label={newInvoiceItem.title} />}
    </Link>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  alertCount
}: {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  alertCount: number;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.title}
      className={cn(
        "group relative flex items-center rounded-lg text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        collapsed ? "mx-auto size-12 justify-center px-0" : "min-h-12 justify-between gap-3 px-2.5 py-2.5",
        active
          ? "bg-emerald-50 text-emerald-900"
          : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
      )}
    >
      <span className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-3")}>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition",
            active
              ? "bg-emerald-100/80 text-emerald-700"
              : "text-ink-400 group-hover:bg-ink-100 group-hover:text-ink-700"
          )}
        >
          <Icon className="size-5 shrink-0" />
        </span>
        {!collapsed ? <span className="truncate">{item.title}</span> : <Tooltip label={item.title} />}
      </span>
      {alertCount > 0 ? <AlertBadge count={alertCount} collapsed={collapsed} /> : null}
    </Link>
  );
}

function AlertBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (collapsed) {
    return (
      <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-garnet-600 px-1 text-[10px] font-black leading-4 text-white">
        {count > 9 ? "9+" : count}
      </span>
    );
  }

  return (
    <span className="ml-3 inline-flex min-w-7 items-center justify-center rounded-full bg-garnet-600 px-2 py-0.5 text-xs font-black leading-5 text-white">
      {count}
    </span>
  );
}

function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-800 opacity-0 shadow-luxury transition group-hover:block group-hover:opacity-100 group-focus-visible:block group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function useAlertRefreshToken() {
  const [token, setToken] = useState(0);

  useEffect(() => {
    const bump = () => setToken((current) => current + 1);
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "invoice-tracker:alert-workflow") {
        bump();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", bump);
    window.addEventListener("invoice-tracker:alert-workflow-updated", bump);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", bump);
      window.removeEventListener("invoice-tracker:alert-workflow-updated", bump);
    };
  }, []);

  return token;
}

function getUserDisplayName(user: User) {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  if (user.email) {
    return user.email;
  }

  return "Workspace user";
}

function getUserPrimaryLabel(user: User) {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  if (user.email) {
    const localPart = user.email.split("@")[0] ?? "";
    const normalized = localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

    if (normalized) {
      return normalized;
    }
  }

  return "Workspace user";
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "IT";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRoleLabel(role: string) {
  return role
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
