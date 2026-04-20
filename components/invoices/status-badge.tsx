import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/types";

const tones: Record<InvoiceStatus, "neutral" | "emerald" | "garnet" | "citrine" | "peacock" | "violet" | "ink"> = {
  Draft: "neutral",
  Pending: "peacock",
  "Due Soon": "citrine",
  Overdue: "garnet",
  Paid: "emerald",
  "Partially Paid": "violet",
  Cancelled: "ink"
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={tones[status]}>{status}</Badge>;
}
