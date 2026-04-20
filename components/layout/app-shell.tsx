"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { InvoiceProvider } from "@/components/providers/invoice-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { MobileHeader, MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("invoice-tracker:sidebar-collapsed");
    setSidebarCollapsed(stored === "true");
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-ink-50" />;
  }

  return (
    <InvoiceProvider>
      <ToastProvider>
        <div className="min-h-screen bg-ink-50 text-ink-900">
          <div
            className={
              sidebarCollapsed
                ? "fixed inset-y-0 left-0 z-30 hidden w-20 lg:block"
                : "fixed inset-y-0 left-0 z-30 hidden w-[17rem] lg:block"
            }
          >
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => {
                setSidebarCollapsed((current) => {
                  const next = !current;
                  window.localStorage.setItem("invoice-tracker:sidebar-collapsed", String(next));
                  return next;
                });
              }}
            />
          </div>
          <MobileHeader />
          <main
            className={
              sidebarCollapsed
                ? "min-h-screen pt-16 lg:pl-20 lg:pt-0"
                : "min-h-screen pt-16 lg:pl-[17rem] lg:pt-0"
            }
          >
            <div className="mx-auto w-full max-w-[1600px] px-4 pb-[calc(env(safe-area-inset-bottom)+8rem)] pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7">
              {children}
            </div>
          </main>
          <MobileNav />
        </div>
      </ToastProvider>
    </InvoiceProvider>
  );
}
