import { format } from "date-fns";

import { parseAppDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import type { CurrencyCode } from "@/lib/types";

export function formatEmailCurrency(amount: number, currency: CurrencyCode) {
  return formatCurrency(amount, currency);
}

export function formatEmailDate(value: string, fallback = "Missing") {
  const date = parseSafeDate(value);

  if (!date) {
    return fallback;
  }

  return format(date, "MMM d, yyyy");
}

export function formatMonthLabel(value: string) {
  const date = parseSafeDate(value) ?? new Date();
  return format(date, "MMMM yyyy");
}

export function parseSafeDate(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const date = parseAppDate(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
