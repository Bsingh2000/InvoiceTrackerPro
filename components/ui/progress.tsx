import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "emerald"
}: {
  value: number;
  className?: string;
  tone?: "emerald" | "garnet" | "citrine" | "peacock";
}) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-ink-100", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "emerald" && "bg-emerald-600",
          tone === "garnet" && "bg-garnet-600",
          tone === "citrine" && "bg-citrine-500",
          tone === "peacock" && "bg-peacock-600"
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
