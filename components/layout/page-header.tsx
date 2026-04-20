import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-16 z-20 -mx-4 mb-5 border-b border-ink-100 bg-ink-50/90 px-4 py-4 backdrop-blur lg:top-0 lg:-mx-8 lg:mb-7 lg:px-8",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-black tracking-normal text-ink-900 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-3">{action}</div> : null}
      </div>
    </div>
  );
}
