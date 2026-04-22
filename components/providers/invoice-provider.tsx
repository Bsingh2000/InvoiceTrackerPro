"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { getAppTodayString } from "@/lib/date-utils";
import { mockInvoices } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import type {
  CurrencyCode,
  Invoice,
  InvoiceInput,
  InvoiceLineItem,
  InvoiceLineItemInput,
  InvoicePayment,
  InvoicePaymentInput,
  InvoicePriority,
  InvoiceStatus,
  InvoiceType
} from "@/lib/types";

type AddInvoiceOptions = {
  attachmentFile?: File | null;
  allowInvoiceNumberRetry?: boolean;
};

type InvoiceContextValue = {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  getPaymentsForInvoice: (id: string) => InvoicePayment[];
  getNextInvoiceNumber: (type: InvoiceType) => Promise<string>;
  addInvoice: (invoice: InvoiceInput, options?: AddInvoiceOptions) => Promise<Invoice>;
  updateInvoice: (id: string, patch: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  markAsPaid: (id: string) => Promise<void>;
  recordPartialPayment: (id: string, payment: InvoicePaymentInput) => Promise<void>;
  resetDemoData: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  type: InvoiceType;
  party_name: string;
  contact: string | null;
  invoice_date: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  balance_remaining: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  payment_method: string | null;
  category: string;
  notes: string | null;
  internal_remarks: string | null;
  priority: InvoicePriority;
  reminder_date: string | null;
  reference_number: string | null;
  recurring: boolean;
  created_at: string;
  updated_at: string;
};

type InvoiceTagRow = {
  invoice_id: string;
  tag: string;
};

type InvoiceAttachmentRow = {
  invoice_id: string;
  file_name: string;
  created_at: string;
};

type InvoiceLineItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

type InvoicePaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  currency: CurrencyCode;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

const attachmentBucket = "invoice-attachments";

const InvoiceContext = createContext<InvoiceContextValue | null>(null);

export function InvoiceProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, workspace } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, InvoicePayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("*")
        .eq("workspace_id", workspace.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

      if (invoiceError) {
        throw invoiceError;
      }

      const rows = (invoiceRows ?? []) as InvoiceRow[];
      const invoiceIds = rows.map((row) => row.id);
      const tagsByInvoice = new Map<string, string[]>();
      const attachmentsByInvoice = new Map<string, string>();
      const lineItemsByInvoice = new Map<string, InvoiceLineItem[]>();
      const nextPaymentsByInvoice: Record<string, InvoicePayment[]> = {};

      if (invoiceIds.length) {
        const [
          { data: tagRows, error: tagError },
          { data: attachmentRows, error: attachmentError },
          { data: lineItemRows, error: lineItemError },
          { data: paymentRows, error: paymentError }
        ] =
          await Promise.all([
            supabase
              .from("invoice_tags")
              .select("invoice_id, tag")
              .in("invoice_id", invoiceIds)
              .order("tag", { ascending: true }),
            supabase
              .from("invoice_attachments")
              .select("invoice_id, file_name, created_at")
              .in("invoice_id", invoiceIds)
              .is("deleted_at", null)
              .order("created_at", { ascending: false }),
            supabase
              .from("invoice_line_items")
              .select("id, invoice_id, description, quantity, unit_price, line_total, sort_order")
              .in("invoice_id", invoiceIds)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
            supabase
              .from("invoice_payments")
              .select("id, invoice_id, amount, currency, payment_date, payment_method, reference_number, notes, created_at")
              .in("invoice_id", invoiceIds)
              .order("created_at", { ascending: false })
          ]);

        if (tagError) {
          throw tagError;
        }

        if (attachmentError) {
          throw attachmentError;
        }

        if (lineItemError) {
          throw lineItemError;
        }

        if (paymentError) {
          throw paymentError;
        }

        ((tagRows ?? []) as InvoiceTagRow[]).forEach((row) => {
          tagsByInvoice.set(row.invoice_id, [...(tagsByInvoice.get(row.invoice_id) ?? []), row.tag]);
        });

        ((attachmentRows ?? []) as InvoiceAttachmentRow[]).forEach((row) => {
          if (!attachmentsByInvoice.has(row.invoice_id)) {
            attachmentsByInvoice.set(row.invoice_id, row.file_name);
          }
        });

        ((lineItemRows ?? []) as InvoiceLineItemRow[]).forEach((row) => {
          lineItemsByInvoice.set(row.invoice_id, [
            ...(lineItemsByInvoice.get(row.invoice_id) ?? []),
            toInvoiceLineItem(row)
          ]);
        });

        ((paymentRows ?? []) as InvoicePaymentRow[]).forEach((row) => {
          const payment = toInvoicePayment(row);
          nextPaymentsByInvoice[row.invoice_id] = [
            ...(nextPaymentsByInvoice[row.invoice_id] ?? []),
            payment
          ];
        });
      }

      setInvoices(rows.map((row) => toInvoice(row, tagsByInvoice, attachmentsByInvoice, lineItemsByInvoice)));
      setPaymentsByInvoice(nextPaymentsByInvoice);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Invoices could not be loaded.");
      setInvoices([]);
      setPaymentsByInvoice({});
    } finally {
      setLoading(false);
    }
  }, [supabase, workspace.id]);

  useEffect(() => {
    void refreshInvoices();
  }, [refreshInvoices]);

  const ensureCounterparty = useCallback(
    async (input: Pick<InvoiceInput, "type" | "partyName" | "contact" | "paymentMethod" | "notes">) => {
      const partyType = input.type === "receivable" ? "customer" : "vendor";
      const { data: existing, error: existingError } = await supabase
        .from("counterparties")
        .select("id, type")
        .eq("workspace_id", workspace.id)
        .eq("name", input.partyName)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        const nextType = existing.type === partyType ? partyType : "both";
        const { error: updateError } = await supabase
          .from("counterparties")
          .update({
            type: nextType,
            contact: input.contact ?? null,
            default_payment_method: input.paymentMethod ?? null,
            notes: input.notes ?? null
          })
          .eq("id", existing.id);

        if (updateError) {
          throw updateError;
        }

        return existing.id as string;
      }

      const { data: created, error: createError } = await supabase
        .from("counterparties")
        .insert({
          workspace_id: workspace.id,
          type: partyType,
          name: input.partyName,
          contact: input.contact ?? null,
          default_payment_method: input.paymentMethod ?? null,
          notes: input.notes ?? null
        })
        .select("id")
        .single();

      if (createError) {
        throw createError;
      }

      return created.id as string;
    },
    [supabase, workspace.id]
  );

  const insertTags = useCallback(
    async (invoiceId: string, tags: string[]) => {
      if (!tags.length) {
        return;
      }

      const { error: tagError } = await supabase.from("invoice_tags").insert(
        tags.map((tag) => ({
          workspace_id: workspace.id,
          invoice_id: invoiceId,
          tag
        }))
      );

      if (tagError) {
        throw tagError;
      }
    },
    [supabase, workspace.id]
  );

  const uploadAttachment = useCallback(
    async (invoiceId: string, file: File) => {
      const storagePath = `${workspace.id}/invoices/${invoiceId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const uploadResult = await supabase.storage.from(attachmentBucket).upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false
      });

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const { error: metadataError } = await supabase.from("invoice_attachments").insert({
        workspace_id: workspace.id,
        invoice_id: invoiceId,
        bucket: attachmentBucket,
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
        is_primary: true
      });

      if (metadataError) {
        await supabase.storage.from(attachmentBucket).remove([storagePath]);
        throw metadataError;
      }
    },
    [supabase, user.id, workspace.id]
  );

  const getNextInvoiceNumber = useCallback(
    async (type: InvoiceType) => {
      const prefix = type === "receivable" ? "REC" : "PAY";
      const year = getAppTodayString().slice(0, 4);
      const pattern = `${prefix}-${year}-%`;
      const { data, error: invoiceNumberError } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("workspace_id", workspace.id)
        .eq("type", type)
        .ilike("invoice_number", pattern);

      if (invoiceNumberError) {
        throw invoiceNumberError;
      }

      const nextSequence =
        ((data ?? []) as Array<{ invoice_number: string | null }>)
          .map((row) => extractInvoiceSequence(row.invoice_number ?? "", prefix, year))
          .reduce((highest, current) => Math.max(highest, current), 0) + 1;

      return `${prefix}-${year}-${String(nextSequence).padStart(3, "0")}`;
    },
    [supabase, workspace.id]
  );

  const addInvoice = useCallback(
    async (input: InvoiceInput, options?: AddInvoiceOptions) => {
      const counterpartyId = await ensureCounterparty(input);
      let invoiceInput = input;
      let row: InvoiceRow;

      try {
        row = await createInvoiceRow(invoiceInput, workspace.id, user.id, counterpartyId, supabase);
      } catch (error) {
        if (!(options?.allowInvoiceNumberRetry && isInvoiceNumberConflictError(error))) {
          throw error;
        }

        invoiceInput = {
          ...input,
          invoiceNumber: await getNextInvoiceNumber(input.type)
        };
        row = await createInvoiceRow(invoiceInput, workspace.id, user.id, counterpartyId, supabase);
      }

      await insertTags(row.id, input.tags);
      await insertLineItems(row.id, input.lineItems, supabase, workspace.id);

      if (input.amountPaid > 0) {
        await insertPayment(
          row.id,
          {
            amount: input.amountPaid,
            paymentDate: getAppTodayString(),
            paymentMethod: input.paymentMethod
          },
          input.currency,
          input.paymentMethod,
          supabase,
          workspace.id,
          user.id
        );
      }

      if (options?.attachmentFile) {
        await uploadAttachment(row.id, options.attachmentFile);
      }

      await refreshInvoices();
      return toInvoice(
        row,
        new Map([[row.id, input.tags]]),
        new Map(options?.attachmentFile ? [[row.id, options.attachmentFile.name]] : []),
        new Map([
          [
            row.id,
            input.lineItems.map((item, index) => ({
              id: `${row.id}-item-${index + 1}`,
              invoiceId: row.id,
              description: item.description.trim(),
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: Number((item.quantity * item.unitPrice).toFixed(2)),
              sortOrder: item.sortOrder ?? index
            }))
          ]
        ])
      );
    },
    [ensureCounterparty, getNextInvoiceNumber, insertTags, refreshInvoices, supabase, uploadAttachment, user.id, workspace.id]
  );

  const updateInvoice = useCallback(
    async (id: string, patch: Partial<Invoice>) => {
      const updatePayload = toInvoiceUpdate(patch);

      if (Object.keys(updatePayload).length) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update(updatePayload)
          .eq("id", id)
          .eq("workspace_id", workspace.id);

        if (updateError) {
          throw updateError;
        }
      }

      if (patch.tags) {
        const { error: deleteTagError } = await supabase
          .from("invoice_tags")
          .delete()
          .eq("invoice_id", id)
          .eq("workspace_id", workspace.id);

        if (deleteTagError) {
          throw deleteTagError;
        }

        await insertTags(id, patch.tags);
      }

      await refreshInvoices();
    },
    [insertTags, refreshInvoices, supabase, workspace.id]
  );

  const deleteInvoice = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase
        .from("invoices")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspace.id);

      if (deleteError) {
        throw deleteError;
      }

      await refreshInvoices();
    },
    [refreshInvoices, supabase, workspace.id]
  );

  const markAsPaid = useCallback(
    async (id: string) => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) {
        return;
      }

      const paymentAmount = invoice.balanceRemaining;

      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: "Paid",
          amount_paid: invoice.amount
        })
        .eq("id", id)
        .eq("workspace_id", workspace.id);

      if (updateError) {
        throw updateError;
      }

      if (paymentAmount > 0) {
        await insertPayment(
          id,
          {
            amount: paymentAmount,
            paymentDate: getAppTodayString(),
            paymentMethod: invoice.paymentMethod
          },
          invoice.currency,
          invoice.paymentMethod,
          supabase,
          workspace.id,
          user.id
        );
      }

      await refreshInvoices();
    },
    [invoices, refreshInvoices, supabase, user.id, workspace.id]
  );

  const recordPartialPayment = useCallback(
    async (id: string, payment: InvoicePaymentInput) => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) {
        return;
      }

      const amount = Math.min(payment.amount, invoice.balanceRemaining);
      const amountPaid = Math.min(invoice.amount, invoice.amountPaid + amount);
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          amount_paid: amountPaid,
          status: amountPaid >= invoice.amount ? "Paid" : "Partially Paid"
        })
        .eq("id", id)
        .eq("workspace_id", workspace.id);

      if (updateError) {
        throw updateError;
      }

      await insertPayment(
        id,
        {
          ...payment,
          amount
        },
        invoice.currency,
        invoice.paymentMethod,
        supabase,
        workspace.id,
        user.id
      );
      await refreshInvoices();
    },
    [invoices, refreshInvoices, supabase, user.id, workspace.id]
  );

  const resetDemoData = useCallback(async () => {
    const { error: deleteError } = await supabase
      .from("invoices")
      .delete()
      .eq("workspace_id", workspace.id);

    if (deleteError) {
      throw deleteError;
    }

    const rowsToInsert = mockInvoices.map((invoice) =>
      toInvoiceInsert(invoice, workspace.id, user.id, null)
    );

    const { data: insertedRows, error: insertError } = await supabase
      .from("invoices")
      .insert(rowsToInsert)
      .select("id, invoice_number, amount_paid, currency, payment_method");

    if (insertError) {
      throw insertError;
    }

    const insertedByNumber = new Map(
      ((insertedRows ?? []) as Array<{
        id: string;
        invoice_number: string;
        amount_paid: number;
        currency: CurrencyCode;
        payment_method: string | null;
      }>).map((row) => [row.invoice_number, row])
    );

      const tagRows = mockInvoices.flatMap((invoice) => {
        const inserted = insertedByNumber.get(invoice.invoiceNumber);
        return inserted
        ? invoice.tags.map((tag) => ({
            workspace_id: workspace.id,
            invoice_id: inserted.id,
            tag
          }))
        : [];
    });

    const lineItemRows = mockInvoices.flatMap((invoice) => {
      const inserted = insertedByNumber.get(invoice.invoiceNumber);
      return inserted
        ? invoice.lineItems.map((item, index) => ({
            workspace_id: workspace.id,
            invoice_id: inserted.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            sort_order: item.sortOrder ?? index
          }))
        : [];
    });

    if (tagRows.length) {
      const { error: tagError } = await supabase.from("invoice_tags").insert(tagRows);
      if (tagError) {
        throw tagError;
      }
    }

    if (lineItemRows.length) {
      const { error: lineItemError } = await supabase.from("invoice_line_items").insert(lineItemRows);
      if (lineItemError) {
        throw lineItemError;
      }
    }

    const paymentRows = mockInvoices
      .map((invoice) => {
        const inserted = insertedByNumber.get(invoice.invoiceNumber);
        if (!inserted || invoice.amountPaid <= 0) {
          return null;
        }

        return {
          workspace_id: workspace.id,
          invoice_id: inserted.id,
          amount: invoice.amountPaid,
          currency: invoice.currency,
          payment_date: getAppTodayString(),
          payment_method: invoice.paymentMethod ?? null,
          created_by: user.id
        };
      })
      .filter(Boolean);

    if (paymentRows.length) {
      const { error: paymentError } = await supabase.from("invoice_payments").insert(paymentRows);
      if (paymentError) {
        throw paymentError;
      }
    }

    await refreshInvoices();
  }, [refreshInvoices, supabase, user.id, workspace.id]);

  const getPaymentsForInvoice = useCallback(
    (id: string) => paymentsByInvoice[id] ?? [],
    [paymentsByInvoice]
  );

  const value = useMemo(
    () => ({
      invoices,
      loading,
      error,
      getPaymentsForInvoice,
      getNextInvoiceNumber,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      markAsPaid,
      recordPartialPayment,
      resetDemoData,
      refreshInvoices
    }),
    [
      addInvoice,
      deleteInvoice,
      error,
      getPaymentsForInvoice,
      getNextInvoiceNumber,
      invoices,
      loading,
      markAsPaid,
      recordPartialPayment,
      refreshInvoices,
      resetDemoData,
      updateInvoice
    ]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50 px-4 py-8 text-ink-900">
        <div className="mx-auto max-w-lg rounded-lg border border-ink-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Invoice data
          </p>
          <h1 className="mt-2 text-2xl font-black">Loading invoices</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Reading your workspace ledger from Supabase.
          </p>
        </div>
      </div>
    );
  }

  return <InvoiceContext.Provider value={value}>{children}</InvoiceContext.Provider>;
}

function toInvoice(
  row: InvoiceRow,
  tagsByInvoice: Map<string, string[]>,
  attachmentsByInvoice: Map<string, string>,
  lineItemsByInvoice: Map<string, InvoiceLineItem[]>
): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    type: row.type,
    partyName: row.party_name,
    contact: row.contact ?? undefined,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    amount: Number(row.amount),
    amountPaid: Number(row.amount_paid),
    balanceRemaining: Number(row.balance_remaining),
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method ?? undefined,
    category: row.category,
    notes: row.notes ?? undefined,
    internalRemarks: row.internal_remarks ?? undefined,
    priority: row.priority,
    reminderDate: row.reminder_date ?? undefined,
    referenceNumber: row.reference_number ?? undefined,
    recurring: row.recurring,
    tags: tagsByInvoice.get(row.id) ?? [],
    attachmentName: attachmentsByInvoice.get(row.id),
    lineItems: lineItemsByInvoice.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInvoiceLineItem(row: InvoiceLineItemRow): InvoiceLineItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    sortOrder: row.sort_order
  };
}

function toInvoicePayment(row: InvoicePaymentRow): InvoicePayment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    currency: row.currency,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method ?? undefined,
    referenceNumber: row.reference_number ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at
  };
}

function toInvoiceInsert(
  input: InvoiceInput,
  workspaceId: string,
  userId: string,
  counterpartyId: string | null
) {
  return {
    workspace_id: workspaceId,
    counterparty_id: counterpartyId,
    invoice_number: input.invoiceNumber,
    type: input.type,
    party_name: input.partyName,
    contact: input.contact ?? null,
    invoice_date: input.invoiceDate,
    due_date: input.dueDate,
    amount: input.amount,
    amount_paid: input.amountPaid,
    currency: input.currency,
    status: input.status,
    payment_method: input.paymentMethod ?? null,
    category: input.category,
    notes: input.notes ?? null,
    internal_remarks: input.internalRemarks ?? null,
    priority: input.priority,
    reminder_date: input.reminderDate ?? null,
    reference_number: input.referenceNumber ?? null,
    recurring: input.recurring,
    created_by: userId
  };
}

function toInvoiceUpdate(patch: Partial<Invoice>) {
  const update: Record<string, unknown> = {};

  if (patch.invoiceNumber !== undefined) update.invoice_number = patch.invoiceNumber;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.partyName !== undefined) update.party_name = patch.partyName;
  if (patch.contact !== undefined) update.contact = patch.contact ?? null;
  if (patch.invoiceDate !== undefined) update.invoice_date = patch.invoiceDate;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.amount !== undefined) update.amount = patch.amount;
  if (patch.amountPaid !== undefined) update.amount_paid = patch.amountPaid;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.paymentMethod !== undefined) update.payment_method = patch.paymentMethod ?? null;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.notes !== undefined) update.notes = patch.notes ?? null;
  if (patch.internalRemarks !== undefined) update.internal_remarks = patch.internalRemarks ?? null;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.reminderDate !== undefined) update.reminder_date = patch.reminderDate ?? null;
  if (patch.referenceNumber !== undefined) update.reference_number = patch.referenceNumber ?? null;
  if (patch.recurring !== undefined) update.recurring = patch.recurring;

  return update;
}

async function createInvoiceRow(
  input: InvoiceInput,
  workspaceId: string,
  userId: string,
  counterpartyId: string | null,
  supabase: ReturnType<typeof createClient>
) {
  const { data, error } = await supabase
    .from("invoices")
    .insert(toInvoiceInsert(input, workspaceId, userId, counterpartyId))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InvoiceRow;
}

async function insertPayment(
  invoiceId: string,
  payment: InvoicePaymentInput,
  currency: CurrencyCode,
  fallbackPaymentMethod: string | undefined,
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  userId: string
) {
  if (payment.amount <= 0) {
    return;
  }

  const { error } = await supabase.from("invoice_payments").insert({
    workspace_id: workspaceId,
    invoice_id: invoiceId,
    amount: payment.amount,
    currency,
    payment_date: payment.paymentDate,
    payment_method: payment.paymentMethod?.trim() || fallbackPaymentMethod || null,
    reference_number: payment.referenceNumber?.trim() || null,
    notes: payment.notes?.trim() || null,
    created_by: userId
  });

  if (error) {
    throw error;
  }
}

async function insertLineItems(
  invoiceId: string,
  lineItems: InvoiceLineItemInput[],
  supabase: ReturnType<typeof createClient>,
  workspaceId: string
) {
  const normalized = lineItems
    .map((item, index) => ({
      workspace_id: workspaceId,
      invoice_id: invoiceId,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      sort_order: item.sortOrder ?? index
    }))
    .filter((item) => item.description && item.quantity > 0);

  if (!normalized.length) {
    return;
  }

  const { error } = await supabase.from("invoice_line_items").insert(normalized);

  if (error) {
    throw error;
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function isInvoiceNumberConflictError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  const details = "details" in error ? error.details : undefined;
  const combined = [message, details]
    .filter((part): part is string => typeof part === "string")
    .join(" ");

  return code === "23505" && /invoice_number|invoices_workspace_invoice_number_unique/i.test(combined);
}

function extractInvoiceSequence(invoiceNumber: string, prefix: string, year: string) {
  const match = invoiceNumber.match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

export function useInvoices() {
  const value = useContext(InvoiceContext);

  if (!value) {
    throw new Error("useInvoices must be used within InvoiceProvider");
  }

  return value;
}
