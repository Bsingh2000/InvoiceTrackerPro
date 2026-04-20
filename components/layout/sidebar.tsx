"use client";

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

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-ink-200/70 bg-white/92 px-3 py-4 backdrop-blur",
        collapsed ? "items-center" : "px-4"
      )}
    >
      <div className={cn("flex w-full shrink-0 items-center gap-2", collapsed ? "justify-center" : "justify-between")}>
        <Link
          href="/dashboard"
          className={cn(
            "group flex min-w-0 items-center rounded-lg py-2 transition hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            collapsed ? "justify-center px-2" : "gap-3 px-2"
          )}
          title="Invoice Tracker Pro"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-black text-white shadow-soft">
            IT
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-black uppercase tracking-[0.2em] text-ink-900">
                Invoice
              </p>
              <p className="truncate text-xs font-semibold text-ink-500">
                Tracker Pro
              </p>
            </div>
          ) : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            aria-label="Collapse sidebar"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            onClick={onToggle}
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button
          type="button"
          aria-label="Expand sidebar"
          className="mt-3 flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          onClick={onToggle}
        >
          <PanelLeftOpen className="size-4" />
        </button>
      ) : null}

      <div className={cn("mt-4 min-h-0 flex-1 overflow-y-auto", collapsed ? "w-full" : "pr-1")}>
        <NewInvoiceLink collapsed={collapsed} active={isRouteActive(pathname, newInvoiceItem.href)} />

        <nav
          className={cn("mt-5 flex flex-col gap-4", collapsed ? "w-full items-center" : "")}
          aria-label="Primary navigation"
        >
          {navigationSections.map((section) => (
            <div
              key={section.title}
              className={cn(
                "w-full",
                section.title === "Workspace" && "mt-2 border-t border-ink-100 pt-4"
              )}
            >
              {!collapsed ? (
                <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-ink-400">
                  {section.title}
                </p>
              ) : null}
              <div className="space-y-1">
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
        {!collapsed ? (
          <div className="mb-3 rounded-lg border border-ink-100 bg-ink-50/75 p-3">
            <p className="truncate text-sm font-black text-ink-900">{workspace.name}</p>
            <p className="mt-1 truncate text-xs font-semibold text-ink-500">
              {user.email}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          className={cn(
            "group relative flex min-h-10 w-full items-center rounded-lg text-sm font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            collapsed ? "mx-auto size-10 justify-center px-0" : "gap-3 px-3"
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
        "group relative flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-emerald-700 font-bold text-white shadow-soft transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        collapsed ? "size-11 px-0" : "gap-2 px-4 text-sm",
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
        "group relative flex min-h-11 items-center rounded-lg text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        collapsed ? "mx-auto size-11 justify-center px-0" : "justify-between gap-3 px-3 py-2.5",
        active
          ? "bg-emerald-50 text-emerald-900"
          : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
      )}
    >
      <span className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-3")}>
        <Icon
          className={cn(
            "size-5 shrink-0 transition",
            active ? "text-emerald-700" : "text-ink-400 group-hover:text-ink-700"
          )}
        />
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
