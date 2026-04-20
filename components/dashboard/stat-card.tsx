import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "emerald"
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "emerald" | "garnet" | "citrine" | "peacock" | "ink";
}) {
  const currencyValue = splitCurrencyValue(value);

  return (
    <Card className="flex min-h-36 flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-luxury">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-500">{label}</p>
          {currencyValue ? (
            <div className="mt-2 min-w-0">
              <p className="text-[11px] font-black uppercase leading-none tracking-[0.14em] text-ink-500">
                {currencyValue.currency}
              </p>
              <p className="mt-1 break-words text-[1.35rem] font-black leading-tight tracking-normal text-ink-900 tabular-nums sm:text-[1.45rem] xl:text-[1.35rem] 2xl:text-[1.45rem]">
                {currencyValue.amount}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-2xl font-black leading-tight tracking-normal text-ink-900 tabular-nums">
              {value}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "emerald" && "bg-emerald-50 text-emerald-700",
            tone === "garnet" && "bg-garnet-50 text-garnet-700",
            tone === "citrine" && "bg-citrine-50 text-citrine-800",
            tone === "peacock" && "bg-peacock-50 text-peacock-700",
            tone === "ink" && "bg-ink-900 text-white"
          )}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-ink-600">{detail}</p>
    </Card>
  );
}

function splitCurrencyValue(value: string) {
  const match = value.match(/^([A-Z]{3})[\s\u00a0]+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    currency: match[1],
    amount: match[2]
  };
}
