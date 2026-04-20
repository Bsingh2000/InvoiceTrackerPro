"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  Paperclip,
  Plus,
  Save,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { useForm } from "react-hook-form";

import { PageHeader } from "@/components/layout/page-header";
import { useInvoices } from "@/components/providers/invoice-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, SectionCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  addDaysToDateOnly,
  compareDateOnly,
  getAppTodayString
} from "@/lib/date-utils";
import { currencies, formatCurrency, percentage } from "@/lib/format";
import type { InvoiceInput, InvoiceStatus, InvoiceType } from "@/lib/types";
import { invoiceFormSchema, type InvoiceFormInput, type InvoiceFormValues } from "@/lib/validation";
import { cn } from "@/lib/utils";

const today = getAppTodayString();
const paymentTerms = [
  { label: "Net 7", value: "7" },
  { label: "Net 15", value: "15" },
  { label: "Net 30", value: "30" },
  { label: "Custom", value: "custom" }
] as const;
const statuses: InvoiceStatus[] = ["Draft", "Pending", "Due Soon", "Overdue", "Paid", "Partially Paid", "Cancelled"];
const formId = "invoice-fast-entry-form";

type SubmitIntent = "create" | "draft" | "another";
type PaymentTerm = (typeof paymentTerms)[number]["value"];

export function InvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { invoices, addInvoice } = useInvoices();
  const { notify } = useToast();
  const defaultType: InvoiceType = searchParams.get("type") === "payable" ? "payable" : "receivable";
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("30");
  const [invoiceNumberEdited, setInvoiceNumberEdited] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [submitIntent, setSubmitIntent] = useState<SubmitIntent>("create");
  const [saved, setSaved] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const initialInvoiceNumber = useMemo(
    () => makeInvoiceNumber(defaultType, invoices),
    [defaultType, invoices]
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<InvoiceFormInput, unknown, InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: makeDefaultValues(defaultType, initialInvoiceNumber)
  });

  const invoiceType = watch("type");
  const invoiceNumber = watch("invoiceNumber");
  const partyName = watch("partyName");
  const invoiceDate = watch("invoiceDate");
  const dueDate = watch("dueDate");
  const amount = Number(watch("amount") || 0);
  const currency = watch("currency");
  const status = watch("status");
  const amountPaidInput = Number(watch("amountPaid") || 0);
  const recurring = watch("recurring");
  const reminderDate = watch("reminderDate");
  const tagsValue = watch("tags") || "";
  const attachmentName = watch("attachmentName");
  const paidAmount = getPreviewPaidAmount(status, amount, amountPaidInput);
  const progress = useMemo(() => percentage(paidAmount, amount), [amount, paidAmount]);
  const balance = Math.max(0, amount - paidAmount);
  const parties = useMemo(() => getKnownParties(invoices, invoiceType), [invoices, invoiceType]);
  const tags = useMemo(() => parseTags(tagsValue), [tagsValue]);
  const warnings = useMemo(
    () => getWarnings({ amount, amountPaid: amountPaidInput, invoiceDate, dueDate, reminderDate, status }),
    [amount, amountPaidInput, dueDate, invoiceDate, reminderDate, status]
  );
  const checklist = [
    { label: "Type selected", complete: Boolean(invoiceType) },
    { label: `${invoiceType === "receivable" ? "Customer" : "Vendor"} entered`, complete: partyName.trim().length >= 2 },
    { label: "Amount entered", complete: amount > 0 },
    { label: "Dates completed", complete: Boolean(invoiceDate && dueDate) && compareDateOnly(dueDate, invoiceDate) >= 0 },
    { label: "Status selected", complete: Boolean(status) }
  ];
  const completion = percentage(checklist.filter((item) => item.complete).length, checklist.length);
  const typeCopy = invoiceType === "receivable"
    ? {
        party: "Customer",
        contact: "Customer contact",
        create: "Create receivable",
        draft: "Save draft",
        description: "Capture money owed by a customer with the required finance details first.",
        typeLabel: "Collect",
        oppositeLabel: "Pay"
      }
    : {
        party: "Vendor",
        contact: "Vendor contact",
        create: "Create payable",
        draft: "Save draft",
        description: "Capture a vendor obligation and plan the outgoing payment timing.",
        typeLabel: "Pay",
        oppositeLabel: "Collect"
      };

  useEffect(() => {
    if (paymentTerm === "custom" || !invoiceDate) {
      return;
    }

    setValue("dueDate", addDaysToDateOnly(invoiceDate, Number(paymentTerm)), {
      shouldDirty: true,
      shouldValidate: true
    });
  }, [invoiceDate, paymentTerm, setValue]);

  useEffect(() => {
    if (!invoiceNumberEdited) {
      setValue("invoiceNumber", makeInvoiceNumber(invoiceType, invoices), { shouldDirty: false });
    }
  }, [invoiceNumberEdited, invoiceType, invoices, setValue]);

  useEffect(() => {
    if (status !== "Partially Paid" && amountPaidInput !== 0) {
      setValue("amountPaid", 0, { shouldDirty: true, shouldValidate: true });
    }
  }, [amountPaidInput, setValue, status]);

  useEffect(() => {
    if (!isDirty || saved) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saved]);

  const amountRegister = register("amount", { setValueAs: parseCurrencyInput });
  const partialRegister = register("amountPaid", { setValueAs: parseCurrencyInput });
  const dueDateRegister = register("dueDate");

  async function submit(values: InvoiceFormValues) {
    const intent = submitIntent;
    const invoiceInput = toInvoiceInput(values, intent);

    try {
      const created = await addInvoice(invoiceInput, { attachmentFile });
      setSaved(true);

      notify({
        title: intent === "draft" ? "Draft saved" : "Invoice created",
        description: `${created.invoiceNumber} was added to the active ledger.`,
        variant: "success"
      });

      if (intent === "another") {
        const nextType = values.type;
        setInvoiceNumberEdited(false);
        setTagDraft("");
        setAttachmentFile(null);
        reset(makeDefaultValues(nextType, makeInvoiceNumber(nextType, [created, ...invoices])));
        setPaymentTerm("30");
        window.setTimeout(() => setSaved(false), 0);
        return;
      }

      router.push(`/invoices/${created.id}`);
    } catch (error) {
      notify({
        title: "Invoice could not be saved",
        description: error instanceof Error ? error.message : "Supabase rejected the invoice save request.",
        variant: "warning"
      });
    }
  }

  function toInvoiceInput(values: InvoiceFormValues, intent: SubmitIntent): InvoiceInput {
    const nextStatus = intent === "draft" ? "Draft" : values.status;
    const normalizedPaid =
      nextStatus === "Paid"
        ? values.amount
        : nextStatus === "Partially Paid"
          ? Math.min(values.amount, values.amountPaid)
          : 0;

    return {
      type: values.type,
      invoiceNumber: values.invoiceNumber,
      partyName: values.partyName,
      contact: values.contact || undefined,
      invoiceDate: values.invoiceDate,
      dueDate: values.dueDate,
      amount: values.amount,
      currency: values.currency,
      status: nextStatus,
      paymentMethod: values.paymentMethod || undefined,
      category: values.category || (values.type === "receivable" ? "Receivable" : "Payable"),
      referenceNumber: values.referenceNumber || undefined,
      notes: values.notes || undefined,
      internalRemarks: buildInternalRemarks(values),
      priority: values.priority,
      amountPaid: normalizedPaid,
      recurring: values.recurring,
      reminderDate: values.reminderDate || undefined,
      tags: parseTags(values.tags || ""),
      attachmentName: values.attachmentName || undefined
    };
  }

  function addTag(rawValue = tagDraft) {
    const next = rawValue.trim().replace(/,$/, "");
    if (!next) {
      setTagDraft("");
      return;
    }

    const existing = new Set(tags.map((tag) => tag.toLowerCase()));
    if (!existing.has(next.toLowerCase())) {
      setValue("tags", [...tags, next].join(", "), { shouldDirty: true, shouldValidate: true });
    }
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setValue(
      "tags",
      tags.filter((item) => item !== tag).join(", "),
      { shouldDirty: true, shouldValidate: true }
    );
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
  }

  function handleCancel() {
    if (!isDirty || saved || window.confirm("Discard this unsaved invoice?")) {
      router.push("/invoices");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Fast entry"
        title="Add invoice"
        description={typeCopy.description}
        action={
          <Button variant="secondary" onClick={handleCancel}>
            Back to ledger
          </Button>
        }
      />

      <form
        id={formId}
        onSubmit={handleSubmit(submit)}
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="space-y-4">
          <SectionCard title="Basic invoice details" eyebrow="Required to create">
            <div className="grid gap-4 lg:grid-cols-6">
              <div className="lg:col-span-6">
                <RequiredLabel>Invoice type</RequiredLabel>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <TypeOption
                    active={invoiceType === "receivable"}
                    tone="emerald"
                    label="Collect"
                    description="Money owed by a customer"
                    input={
                      <input
                        type="radio"
                        value="receivable"
                        className="text-emerald-700 focus:ring-emerald-600"
                        {...register("type")}
                      />
                    }
                  />
                  <TypeOption
                    active={invoiceType === "payable"}
                    tone="peacock"
                    label="Pay"
                    description="Money owed to a vendor"
                    input={
                      <input
                        type="radio"
                        value="payable"
                        className="text-peacock-700 focus:ring-peacock-600"
                        {...register("type")}
                      />
                    }
                  />
                </div>
                {errors.type ? <p className="field-error">{errors.type.message}</p> : null}
              </div>

              <Field
                label={`${typeCopy.party} name`}
                required
                error={errors.partyName?.message}
                className="lg:col-span-3"
                helper={parties.length ? `Choose an existing ${typeCopy.party.toLowerCase()} or type a new one.` : `Type a new ${typeCopy.party.toLowerCase()} name.`}
              >
                <input
                  className="field-control"
                  list="party-options"
                  placeholder={`${typeCopy.party} name`}
                  {...register("partyName")}
                />
                <datalist id="party-options">
                  {parties.map((party) => (
                    <option key={party} value={party} />
                  ))}
                </datalist>
              </Field>

              <Field
                label="Invoice number"
                required
                error={errors.invoiceNumber?.message}
                className="lg:col-span-3"
                helper="Generated automatically. You can change it before saving."
              >
                <input
                  className="field-control"
                  {...register("invoiceNumber", {
                    onChange: () => setInvoiceNumberEdited(true)
                  })}
                />
              </Field>

              <Field label="Amount" required error={errors.amount?.message} className="lg:col-span-3">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-ink-500">
                    {currency}
                  </span>
                  <input
                    inputMode="decimal"
                    className="field-control pl-14 text-lg font-black"
                    placeholder="0.00"
                    {...amountRegister}
                  />
                </div>
              </Field>

              <Field label="Currency" required error={errors.currency?.message} className="lg:col-span-3">
                <select className="field-control" {...register("currency")}>
                  {currencies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Invoice date" required error={errors.invoiceDate?.message} className="lg:col-span-2">
                <input type="date" className="field-control" {...register("invoiceDate")} />
              </Field>

              <Field label="Payment terms" required className="lg:col-span-2">
                <select
                  className="field-control"
                  value={paymentTerm}
                  onChange={(event) => setPaymentTerm(event.target.value as PaymentTerm)}
                >
                  {paymentTerms.map((term) => (
                    <option key={term.value} value={term.value}>
                      {term.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date" required error={errors.dueDate?.message} className="lg:col-span-2">
                <input
                  type="date"
                  className="field-control"
                  {...dueDateRegister}
                  onChange={(event) => {
                    setPaymentTerm("custom");
                    dueDateRegister.onChange(event);
                  }}
                />
              </Field>

              <Field label="Status" required error={errors.status?.message} className="lg:col-span-3">
                <select className="field-control" {...register("status")}>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item, invoiceType)}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 lg:col-span-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Fast path</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  Complete these required fields and use {typeCopy.create.toLowerCase()} from the action rail.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Payment and reference" eyebrow="Optional details">
            <div className="grid gap-4 sm:grid-cols-2">
              {status === "Partially Paid" ? (
                <Field label="Partial payment amount" error={errors.amountPaid?.message}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-ink-500">
                      {currency}
                    </span>
                    <input
                      inputMode="decimal"
                      className="field-control pl-14 font-bold"
                      placeholder="0.00"
                      {...partialRegister}
                    />
                  </div>
                </Field>
              ) : null}

              {status === "Paid" || status === "Partially Paid" ? (
                <Field label="Payment method optional" error={errors.paymentMethod?.message}>
                  <select className="field-control" {...register("paymentMethod")}>
                    {["", "Bank transfer", "ACH", "Wire", "Credit card", "Corporate card", "Cash", "Other"].map((item) => (
                      <option key={item || "empty"} value={item}>
                        {item || "Not set"}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Field label={`${typeCopy.contact} optional`} error={errors.contact?.message}>
                <input className="field-control" placeholder="Email or phone" {...register("contact")} />
              </Field>
              <Field label="Reference number optional" error={errors.referenceNumber?.message}>
                <input className="field-control" placeholder="PO, contract, memo..." {...register("referenceNumber")} />
              </Field>
              <Field label="Category optional" error={errors.category?.message}>
                <input className="field-control" placeholder={invoiceType === "receivable" ? "Services, retainer, project..." : "Software, legal, operations..."} {...register("category")} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Workflow and context" eyebrow="Advanced">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority optional" error={errors.priority?.message}>
                <select className="field-control" {...register("priority")}>
                  {["Low", "Medium", "High", "Critical"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reminder date optional" error={errors.reminderDate?.message}>
                <input type="date" className="field-control" {...register("reminderDate")} />
              </Field>

              <div className="sm:col-span-2">
                <FieldBlock label="Tags optional" error={errors.tags?.message}>
                  <input type="hidden" {...register("tags")} />
                  <div className="mt-2 rounded-lg border border-ink-200 bg-white p-2 focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-ink-100 px-2.5 text-sm font-semibold text-ink-700"
                          onClick={() => removeTag(tag)}
                        >
                          {tag}
                          <X className="size-3.5" />
                        </button>
                      ))}
                      <input
                        aria-label="Add tag"
                        value={tagDraft}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value.endsWith(",")) {
                            addTag(value);
                          } else {
                            setTagDraft(value);
                          }
                        }}
                        onKeyDown={handleTagKeyDown}
                        onBlur={() => addTag()}
                        className="min-h-8 min-w-36 flex-1 border-0 bg-transparent p-0 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-0"
                        placeholder="Type tag and press Enter"
                      />
                    </div>
                  </div>
                </FieldBlock>
              </div>

              <FieldBlock label="Attachment optional" error={errors.attachmentName?.message} className="sm:col-span-2">
                <input type="hidden" {...register("attachmentName")} />
                <div className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed border-ink-200 bg-ink-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Paperclip className="size-4 shrink-0 text-ink-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">
                        {attachmentName || "No attachment uploaded"}
                      </p>
                      <p className="text-xs text-ink-500">Stored securely when you save the invoice.</p>
                    </div>
                  </div>
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50">
                    Choose file
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setAttachmentFile(file);
                        setValue("attachmentName", file?.name || "", { shouldDirty: true, shouldValidate: true });
                      }}
                    />
                  </label>
                </div>
              </FieldBlock>

              <div className="sm:col-span-2">
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-ink-200 px-3">
                  <input
                    type="checkbox"
                    className="rounded border-ink-300 text-emerald-700 focus:ring-emerald-600"
                    {...register("recurring")}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink-800">Recurring invoice</span>
                    <span className="block text-xs text-ink-500">Reveal recurrence controls when this repeats.</span>
                  </span>
                </label>
              </div>

              {recurring ? (
                <div className="grid gap-4 rounded-lg border border-ink-100 bg-ink-50/60 p-3 sm:col-span-2 sm:grid-cols-2">
                  <Field label="Frequency">
                    <select className="field-control" {...register("recurrenceFrequency")}>
                      {["Monthly", "Quarterly", "Annual"].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Interval">
                    <input type="number" min="1" className="field-control" {...register("recurrenceInterval")} />
                  </Field>
                  <Field label="Start date">
                    <input type="date" className="field-control" {...register("recurrenceStart")} />
                  </Field>
                  <Field label="End date optional">
                    <input type="date" className="field-control" {...register("recurrenceEnd")} />
                  </Field>
                </div>
              ) : null}

              <Field label="Notes optional" error={errors.notes?.message} className="sm:col-span-2">
                <textarea
                  rows={2}
                  className="field-control min-h-20 resize-y focus:min-h-28"
                  placeholder={invoiceType === "receivable" ? "Customer-facing context or payment notes." : "Vendor bill context or payment instructions."}
                  {...register("notes")}
                />
              </Field>
              <Field label="Internal remarks optional" error={errors.internalRemarks?.message} className="sm:col-span-2">
                <textarea
                  rows={2}
                  className="field-control min-h-20 resize-y focus:min-h-28"
                  placeholder="Private operating notes for follow-up."
                  {...register("internalRemarks")}
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                Invoice summary
              </p>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-700">
                {typeCopy.typeLabel}
              </span>
            </div>

            {amount > 0 ? (
              <div className="mt-4 space-y-4">
                <SummaryMetric label="Invoice total" value={formatCurrency(amount, currency)} strong />
                <div className="grid grid-cols-2 gap-3">
                  <SummaryMetric label="Amount paid" value={formatCurrency(paidAmount, currency)} />
                  <SummaryMetric label="Remaining" value={formatCurrency(balance, currency)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm font-semibold text-ink-600">
                    <span>Paid percentage</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="mt-2" tone={invoiceType === "receivable" ? "emerald" : "peacock"} />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50/70 p-4">
                <p className="text-sm font-bold text-ink-900">Enter amount to preview balance</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  The summary will show total, paid amount, remaining balance, and payment progress.
                </p>
              </div>
            )}

            <div className="mt-4 grid gap-3 text-sm">
              <SummaryRow label={typeCopy.party} value={partyName || "Not entered"} />
              <SummaryRow label="Invoice number" value={invoiceNumber || "Not set"} />
              <SummaryRow label="Due date" value={dueDate || "Not set"} />
              <SummaryRow label="Status" value={statusLabel(status, invoiceType)} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink-900">Completion</p>
              <p className="text-sm font-black text-ink-900">{completion}%</p>
            </div>
            <Progress value={completion} className="mt-3" tone={completion === 100 ? "emerald" : "citrine"} />
            <div className="mt-4 space-y-2">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      item.complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-ink-200 bg-ink-50 text-ink-400"
                    )}
                  >
                    {item.complete ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className={item.complete ? "text-ink-800" : "text-ink-500"}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-bold text-ink-900">Validation and warnings</p>
            <div className="mt-3 space-y-2">
              {warnings.length ? (
                warnings.map((warning) => (
                  <p key={warning} className="rounded-lg border border-citrine-200 bg-citrine-50 p-3 text-sm font-semibold leading-5 text-citrine-900">
                    {warning}
                  </p>
                ))
              ) : (
                <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  No finance warnings detected.
                </p>
              )}
            </div>
          </Card>

          <Card className="hidden p-4 xl:block">
            <ActionButtons
              createLabel={typeCopy.create}
              draftLabel={typeCopy.draft}
              isSubmitting={isSubmitting}
              onCancel={handleCancel}
              onIntent={setSubmitIntent}
            />
          </Card>
        </aside>
      </form>

      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4 shadow-soft xl:hidden">
        <ActionButtons
          createLabel={typeCopy.create}
          draftLabel={typeCopy.draft}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onIntent={setSubmitIntent}
          compact
        />
      </div>
    </>
  );
}

function makeDefaultValues(type: InvoiceType, invoiceNumber: string): InvoiceFormInput {
  return {
    type,
    invoiceNumber,
    partyName: "",
    contact: "",
    invoiceDate: today,
    dueDate: addDaysToDateOnly(today, 30),
    amount: 0,
    currency: "TTD",
    status: "Pending",
    paymentMethod: "",
    category: "",
    referenceNumber: "",
    notes: "",
    internalRemarks: "",
    priority: "Medium",
    amountPaid: 0,
    recurring: false,
    reminderDate: "",
    tags: "",
    attachmentName: "",
    recurrenceFrequency: "Monthly",
    recurrenceStart: today,
    recurrenceEnd: "",
    recurrenceInterval: 1
  };
}

function ActionButtons({
  createLabel,
  draftLabel,
  isSubmitting,
  onCancel,
  onIntent,
  compact = false
}: {
  createLabel: string;
  draftLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onIntent: (intent: SubmitIntent) => void;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-2.5">
      <Button
        type="submit"
        form={formId}
        size={compact ? "md" : "lg"}
        className="min-w-0 w-full whitespace-normal"
        disabled={isSubmitting}
        onClick={() => onIntent("create")}
      >
        {createLabel}
        <ArrowRight className="size-5" />
      </Button>
      <Button
        type="submit"
        form={formId}
        variant="secondary"
        className="min-w-0 w-full whitespace-normal"
        disabled={isSubmitting}
        onClick={() => onIntent("draft")}
      >
        <Save className="size-4" />
        {draftLabel}
      </Button>
      <Button
        type="submit"
        form={formId}
        variant="secondary"
        className="min-w-0 w-full whitespace-normal"
        disabled={isSubmitting}
        onClick={() => onIntent("another")}
      >
        <Plus className="size-4" />
        Add another
      </Button>
      <Button type="button" variant="ghost" className="min-w-0 w-full whitespace-normal" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function TypeOption({
  active,
  tone,
  label,
  description,
  input
}: {
  active: boolean;
  tone: "emerald" | "peacock";
  label: string;
  description: string;
  input: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 transition",
        tone === "emerald" && "has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50",
        tone === "peacock" && "has-[:checked]:border-peacock-600 has-[:checked]:bg-peacock-50",
        active ? "border-transparent" : "border-ink-200 hover:border-ink-300"
      )}
    >
      {input}
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-900">{label}</span>
        <span className="block text-xs text-ink-500">{description}</span>
      </span>
    </label>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="field-label">
      {children} <span className="text-garnet-600">*</span>
    </span>
  );
}

function Field({
  label,
  error,
  children,
  className,
  required = false,
  helper
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  helper?: string;
}) {
  return (
    <label className={className}>
      <span className={cn("field-label", !required && "text-ink-600")}>
        {label}
        {required ? <span className="text-garnet-600"> *</span> : null}
      </span>
      {children}
      {helper ? <p className="mt-1.5 text-xs leading-5 text-ink-500">{helper}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </label>
  );
}

function FieldBlock({
  label,
  error,
  children,
  className,
  required = false,
  helper
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  helper?: string;
}) {
  return (
    <div className={className}>
      <span className={cn("field-label", !required && "text-ink-600")}>
        {label}
        {required ? <span className="text-garnet-600"> *</span> : null}
      </span>
      {children}
      {helper ? <p className="mt-1.5 text-xs leading-5 text-ink-500">{helper}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

function SummaryMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className={cn("mt-1 font-black text-ink-900", strong ? "text-2xl" : "text-base")}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-ink-100 pt-3">
      <p className="text-ink-500">{label}</p>
      <p className="max-w-44 truncate text-right font-bold text-ink-900">{value}</p>
    </div>
  );
}

function makeInvoiceNumber(type: InvoiceType, invoices: Array<{ type: InvoiceType }>) {
  const prefix = type === "receivable" ? "REC" : "PAY";
  const count = invoices.filter((invoice) => invoice.type === type).length + 1;
  return `${prefix}-${today.slice(0, 4)}-${String(count).padStart(3, "0")}`;
}

function getKnownParties(invoices: Array<{ type: InvoiceType; partyName: string }>, type: InvoiceType) {
  return Array.from(
    new Set(
      invoices
        .filter((invoice) => invoice.type === type)
        .map((invoice) => invoice.partyName)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function parseCurrencyInput(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getPreviewPaidAmount(status: InvoiceStatus, amount: number, amountPaid: number) {
  if (status === "Paid") {
    return amount;
  }

  if (status === "Partially Paid") {
    return Math.min(amount, Math.max(0, amountPaid));
  }

  return 0;
}

function getWarnings({
  amount,
  amountPaid,
  invoiceDate,
  dueDate,
  reminderDate,
  status
}: {
  amount: number;
  amountPaid: number;
  invoiceDate: string;
  dueDate: string;
  reminderDate?: string;
  status: InvoiceStatus;
}) {
  const warnings: string[] = [];

  if (invoiceDate && dueDate && compareDateOnly(dueDate, invoiceDate) < 0) {
    warnings.push("Due date is earlier than the invoice date.");
  }

  if (status === "Partially Paid" && amountPaid > amount) {
    warnings.push("Partial payment exceeds the invoice total.");
  }

  if (reminderDate && dueDate && compareDateOnly(reminderDate, dueDate) > 0) {
    warnings.push("Reminder date is later than the due date.");
  }

  return warnings;
}

function buildInternalRemarks(values: InvoiceFormValues) {
  const remarks = values.internalRemarks?.trim();

  if (!values.recurring) {
    return remarks || undefined;
  }

  const recurrence = [
    `Recurring: ${values.recurrenceFrequency || "Monthly"}`,
    `Interval: ${values.recurrenceInterval || 1}`,
    values.recurrenceStart ? `Start: ${values.recurrenceStart}` : "",
    values.recurrenceEnd ? `End: ${values.recurrenceEnd}` : "Ongoing"
  ]
    .filter(Boolean)
    .join("; ");

  return remarks ? `${remarks}\n${recurrence}` : recurrence;
}

function statusLabel(status: InvoiceStatus, type: InvoiceType) {
  if (status === "Pending") {
    return type === "receivable" ? "Pending collection" : "Pending payment";
  }

  if (status === "Due Soon") {
    return type === "receivable" ? "Due soon to collect" : "Due soon to pay";
  }

  if (status === "Overdue") {
    return type === "receivable" ? "Overdue collection" : "Overdue payable";
  }

  return status;
}
