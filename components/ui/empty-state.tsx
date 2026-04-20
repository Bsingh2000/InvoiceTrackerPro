import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
  href
}: {
  title: string;
  description: string;
  action?: ReactNode;
  href?: string;
}) {
  return (
    <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <span className="text-lg font-black">IT</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-600">{description}</p>
      {action ?? (href ? <ButtonLink href={href} className="mt-5">Add invoice</ButtonLink> : null)}
    </Card>
  );
}
