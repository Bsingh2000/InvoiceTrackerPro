import { Badge } from "@/components/ui/badge";
import type { InvoiceType } from "@/lib/types";

export function TypeBadge({ type }: { type: InvoiceType }) {
  return (
    <Badge tone={type === "receivable" ? "emerald" : "peacock"}>
      {type === "receivable" ? "Collect" : "Pay"}
    </Badge>
  );
}
