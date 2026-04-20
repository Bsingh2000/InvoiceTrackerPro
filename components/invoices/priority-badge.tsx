import { Badge } from "@/components/ui/badge";
import type { InvoicePriority } from "@/lib/types";

const tones: Record<InvoicePriority, "neutral" | "emerald" | "garnet" | "citrine"> = {
  Low: "neutral",
  Medium: "emerald",
  High: "citrine",
  Critical: "garnet"
};

export function PriorityBadge({ priority }: { priority: InvoicePriority }) {
  return <Badge tone={tones[priority]}>{priority}</Badge>;
}
