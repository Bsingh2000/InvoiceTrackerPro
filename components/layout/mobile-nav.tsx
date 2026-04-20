"use client";

import Link from "next/link";
import { LogOut, Menu, Plus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useInvoices } from "@/components/providers/invoice-provider";
import { getShellAlertSummary } from "@/lib/alert-summary";
import {
  isRouteActive,
  navigationItems,
  navigationSections,
  newInvoiceItem,
  type NavigationItem
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const primaryMobileItems: NavigationItem[] = [
  navigationItems.find((item) => item.href === "/dashboard"),
  navigationItems.find((item) => item.href === "/invoices"),
  newInvoiceItem,
  navigationItems.find((item) => item.href === "/calendar"),
  navigationItems.find((item) => item.href === "/notifications")
].filter(Boolean) as NavigationItem[];

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { invoices } = useInvoices();
  const { user, workspace, signOut } = useAuth();
  useAlertRefreshToken();
  const alertSummary = getShellAlertSummary(invoices);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-ink-200 bg-white/92 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-black text-white">
            IT
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-ink-900">
              Invoice
            </p>
            <p className="truncate text-xs font-semibold text-ink-500">TTD / USD workspace</p>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-11 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink-900/45 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="ml-auto flex h-full w-[min(22rem,92vw)] flex-col overflow-y-auto bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-luxury"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/dashboard"
                className="flex min-w-0 items-center gap-3"
                onClick={() => setOpen(false)}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-black text-white">
                  IT
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-ink-900">
                    Invoice
                  </p>
                  <p className="truncate text-xs font-semibold text-ink-500">
                    Tracker Pro
                  </p>
                </div>
              </Link>
              <button
                type="button"
                aria-label="Close navigation"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50/75 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">
                  Workspace
                </p>
                <p className="text-xs font-black text-ink-900">Base TTD</p>
              </div>
              <p className="mt-1 text-sm leading-5 text-ink-600">
                {workspace.name}. {alertSummary.active} active alert{alertSummary.active === 1 ? "" : "s"}.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <p className="min-w-0 truncate text-xs font-semibold text-ink-500">{user.email}</p>
                <button
                  type="button"
                  className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-xs font-bold text-ink-700"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            </div>

            <Link
              href={newInvoiceItem.href}
              onClick={() => setOpen(false)}
              className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-800"
            >
              <Plus className="size-5" />
              {newInvoiceItem.title}
            </Link>

            <nav className="mt-5 space-y-5" aria-label="Mobile navigation">
              {navigationSections.map((section) => (
                <div key={section.title}>
                  <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.16em] text-ink-400">
                    {section.title}
                  </p>
                  <div className="space-y-1.5">
                    {section.items.map((item) => (
                      <MobileDrawerLink
                        key={item.href}
                        item={item}
                        active={isRouteActive(pathname, item.href)}
                        alertCount={item.badge === "alerts" ? alertSummary.active : 0}
                        onNavigate={() => setOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { invoices } = useInvoices();
  useAlertRefreshToken();
  const alertSummary = getShellAlertSummary(invoices);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-200 bg-white/95 px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur lg:hidden"
      aria-label="Quick navigation"
    >
      {primaryMobileItems.map((item) => {
        const active = isRouteActive(pathname, item.href);
        const Icon = item.href === newInvoiceItem.href ? Plus : item.icon;
        const isAction = item.href === newInvoiceItem.href;
        const label = item.href === "/invoices" ? "Invoices" : item.href === "/notifications" ? "Alerts" : item.href === newInvoiceItem.href ? "New" : item.title;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
              isAction
                ? "bg-emerald-700 text-white shadow-soft"
                : active
                  ? "bg-emerald-50 text-emerald-900"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
            )}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
            {item.badge === "alerts" && alertSummary.active > 0 ? (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-garnet-600" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileDrawerLink({
  item,
  active,
  alertCount,
  onNavigate
}: {
  item: NavigationItem;
  active: boolean;
  alertCount: number;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        active ? "bg-emerald-50 text-emerald-900" : "text-ink-700 hover:bg-ink-50"
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className={cn("size-5 shrink-0", active ? "text-emerald-700" : "text-ink-400")} />
        <span className="truncate">{item.title}</span>
      </span>
      {alertCount > 0 ? (
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-garnet-600 px-2 py-0.5 text-xs font-black leading-5 text-white">
          {alertCount}
        </span>
      ) : null}
    </Link>
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
