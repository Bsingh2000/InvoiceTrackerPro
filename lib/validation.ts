import { z } from "zod";

import { compareDateOnly } from "@/lib/date-utils";

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(2, "Line item description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  sortOrder: z.coerce.number().int().nonnegative().optional()
});

export const invoiceFormSchema = z
  .object({
    type: z.enum(["receivable", "payable"], {
      message: "Choose whether this invoice is to collect or to pay."
    }),
    invoiceNumber: z.string().min(2, "Invoice number is required."),
    partyName: z.string().min(2, "Customer or vendor name is required."),
    contact: z.string().optional(),
    invoiceDate: z.string().min(1, "Invoice date is required."),
    dueDate: z.string().min(1, "Due date is required."),
    amount: z.coerce.number().min(0, "Invoice total must be zero or higher."),
    currency: z.enum(["TTD", "USD", "EUR", "GBP", "CAD", "BOB"]),
    status: z.enum([
      "Draft",
      "Pending",
      "Due Soon",
      "Overdue",
      "Paid",
      "Partially Paid",
      "Cancelled"
    ]),
    paymentMethod: z.string().optional(),
    category: z.string().optional(),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
    internalRemarks: z.string().optional(),
    priority: z.enum(["Low", "Medium", "High", "Critical"]),
    amountPaid: z.coerce.number().min(0, "Paid amount cannot be negative."),
    recurring: z.boolean(),
    reminderDate: z.string().optional(),
    tags: z.string().optional(),
    attachmentName: z.string().optional(),
    recurrenceFrequency: z.string().optional(),
    recurrenceStart: z.string().optional(),
    recurrenceEnd: z.string().optional(),
    recurrenceInterval: z.coerce.number().optional(),
    lineItems: z.array(invoiceLineItemSchema).min(1, "Add at least one line item.")
  })
  .refine((data) => compareDateOnly(data.dueDate, data.invoiceDate) >= 0, {
    path: ["dueDate"],
    message: "Due date must be on or after the invoice date."
  })
  .refine(
    (data) =>
      data.lineItems.reduce(
        (total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0
      ) > 0,
    {
      path: ["lineItems"],
      message: "Invoice total must be greater than zero."
    }
  )
  .refine(
    (data) =>
      data.amountPaid <=
      data.lineItems.reduce(
        (total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0
      ),
    {
    path: ["amountPaid"],
    message: "Paid amount cannot exceed the invoice total."
    }
  );

export type InvoiceFormInput = z.input<typeof invoiceFormSchema>;
export type InvoiceFormValues = z.output<typeof invoiceFormSchema>;
