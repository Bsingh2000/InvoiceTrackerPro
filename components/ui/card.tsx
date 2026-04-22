import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-ink-200/80 bg-white shadow-soft",
        className
      )}
      {...props}
    />
  );
}

export function SectionCard({
  title,
  eyebrow,
  action,
  children,
  className
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-col gap-4 border-b border-ink-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="break-words text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 break-words text-lg font-semibold leading-7 text-ink-900">{title}</h2>
        </div>
        {action ? <div className="shrink-0 self-start sm:self-center">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}
