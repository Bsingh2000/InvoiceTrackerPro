"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-luxury"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-garnet-50 text-garnet-700">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-lg font-semibold text-ink-900">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
