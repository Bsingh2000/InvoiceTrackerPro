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
        "mb-6 border-b border-ink-100 pb-5 sm:mb-7",
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
        {action ? (
          <div className="flex w-full flex-wrap gap-3 [&>*]:w-full sm:w-auto sm:shrink-0 sm:[&>*]:w-auto">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
