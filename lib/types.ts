export type InvoiceType = "receivable" | "payable";

export type InvoiceStatus =
  | "Draft"
  | "Pending"
  | "Due Soon"
  | "Overdue"
  | "Paid"
  | "Partially Paid"
  | "Cancelled";

export type InvoicePriority = "Low" | "Medium" | "High" | "Critical";

export type CurrencyCode = "TTD" | "USD" | "EUR" | "GBP" | "CAD" | "BOB";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  partyName: string;
  contact?: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  paymentMethod?: string;
  category: string;
  notes?: string;
  internalRemarks?: string;
  priority: InvoicePriority;
  createdAt: string;
  updatedAt: string;
  reminderDate?: string;
  amountPaid: number;
  balanceRemaining: number;
  tags: string[];
  referenceNumber?: string;
  recurring: boolean;
  attachmentName?: string;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amount: number;
  currency: CurrencyCode;
  paymentDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
};

export type InvoiceInput = Omit<
  Invoice,
  "id" | "createdAt" | "updatedAt" | "balanceRemaining"
>;

export type ActivityEvent = {
  id: string;
  invoiceId: string;
  title: string;
  description: string;
  createdAt: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export type AppNotification = {
  id: string;
  invoiceId: string;
  title: string;
  description: string;
  dueDate: string;
  amount: number;
  currency: CurrencyCode;
  priority: InvoicePriority;
  type: "due-today" | "due-tomorrow" | "overdue" | "large-value" | "deadline";
};

export type InvoiceRepository = {
  listInvoices: () => Promise<Invoice[]>;
  getInvoiceById: (id: string) => Promise<Invoice | null>;
};
