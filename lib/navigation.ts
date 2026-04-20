import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  FilePlus2,
  Files,
  LayoutDashboard,
  Settings,
  WalletCards,
  type LucideIcon
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: "alerts";
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

export const newInvoiceItem: NavigationItem = {
  title: "New invoice",
  href: "/invoices/new",
  icon: FilePlus2
};

export const navigationSections: NavigationSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard
      }
    ]
  },
  {
    title: "Operations",
    items: [
      {
        title: "All invoices",
        href: "/invoices",
        icon: Files
      },
      {
        title: "Receivables",
        href: "/receivables",
        icon: WalletCards
      },
      {
        title: "Payables",
        href: "/payables",
        icon: CreditCard
      }
    ]
  },
  {
    title: "Planning and intelligence",
    items: [
      {
        title: "Calendar",
        href: "/calendar",
        icon: CalendarDays
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: ChartNoAxesCombined
      },
      {
        title: "Alerts",
        href: "/notifications",
        icon: Bell,
        badge: "alerts"
      }
    ]
  },
  {
    title: "Workspace",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings
      }
    ]
  }
];

export const navigationItems = navigationSections.flatMap((section) => section.items);

export function isRouteActive(pathname: string, href: string) {
  if (href === "/invoices") {
    return pathname === "/invoices" || /^\/invoices\/(?!new(?:\/)?$)/.test(pathname);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
