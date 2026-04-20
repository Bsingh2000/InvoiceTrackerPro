import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone =
  | "neutral"
  | "emerald"
  | "garnet"
  | "citrine"
  | "peacock"
  | "violet"
  | "ink";

const tones: Record<BadgeTone, string> = {
  neutral: "border-ink-200 bg-ink-50 text-ink-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  garnet: "border-garnet-200 bg-garnet-50 text-garnet-800",
  citrine: "border-citrine-200 bg-citrine-50 text-citrine-900",
  peacock: "border-peacock-200 bg-peacock-50 text-peacock-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
  ink: "border-ink-300 bg-ink-900 text-white"
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold leading-none",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
