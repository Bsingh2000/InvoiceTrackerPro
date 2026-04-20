import { addDays, addMonths, differenceInCalendarDays, format } from "date-fns";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseAppDate(value: string) {
  if (dateOnlyPattern.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

export function getAppToday() {
  return parseAppDate(getAppTodayString());
}

export function getAppTodayString() {
  return formatDateOnly(new Date());
}

export function formatDateOnly(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function addDaysToDateOnly(value: string, days: number) {
  return formatDateOnly(addDays(parseAppDate(value), days));
}

export function addMonthsToDateOnly(value: string, months: number) {
  return formatDateOnly(addMonths(parseAppDate(value), months));
}

export function compareDateOnly(a: string, b: string) {
  return parseAppDate(a).getTime() - parseAppDate(b).getTime();
}

export function daysBetweenDateOnly(target: string, base = getAppTodayString()) {
  return differenceInCalendarDays(parseAppDate(target), parseAppDate(base));
}

export function isSameMonthDateOnly(a: string, b: string) {
  const first = parseAppDate(a);
  const second = parseAppDate(b);

  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}
