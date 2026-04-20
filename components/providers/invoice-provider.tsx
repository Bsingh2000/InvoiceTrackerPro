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

import { mockInvoices } from "@/lib/mock-data";
import type { Invoice, InvoiceInput } from "@/lib/types";

type InvoiceContextValue = {
  invoices: Invoice[];
  addInvoice: (invoice: InvoiceInput) => Invoice;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  markAsPaid: (id: string) => void;
  recordPartialPayment: (id: string, amount: number) => void;
  resetDemoData: () => void;
};

const STORAGE_KEY = "invoice-tracker:invoices";

const InvoiceContext = createContext<InvoiceContextValue | null>(null);

function persistInvoices(invoices: Invoice[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }
}

export function InvoiceProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setInvoices(JSON.parse(stored) as Invoice[]);
      } catch {
        setInvoices(mockInvoices);
      }
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    }
  }, [hydrated, invoices]);

  const addInvoice = useCallback((input: InvoiceInput) => {
    const now = new Date().toISOString();
    const created: Invoice = {
      ...input,
      id: `inv-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
      balanceRemaining: Math.max(0, input.amount - input.amountPaid)
    };

    setInvoices((current) => {
      const next = [created, ...current];
      persistInvoices(next);
      return next;
    });
    return created;
  }, []);

  const updateInvoice = useCallback((id: string, patch: Partial<Invoice>) => {
    setInvoices((current) => {
      const nextInvoices = current.map((invoice) => {
        if (invoice.id !== id) {
          return invoice;
        }

        const next = {
          ...invoice,
          ...patch,
          updatedAt: new Date().toISOString()
        };

        return {
          ...next,
          balanceRemaining: Math.max(0, next.amount - next.amountPaid)
        };
      });

      persistInvoices(nextInvoices);
      return nextInvoices;
    });
  }, []);

  const deleteInvoice = useCallback((id: string) => {
    setInvoices((current) => {
      const next = current.filter((invoice) => invoice.id !== id);
      persistInvoices(next);
      return next;
    });
  }, []);

  const markAsPaid = useCallback(
    (id: string) => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) {
        return;
      }

      updateInvoice(id, {
        status: "Paid",
        amountPaid: invoice.amount,
        balanceRemaining: 0
      });
    },
    [invoices, updateInvoice]
  );

  const recordPartialPayment = useCallback(
    (id: string, amount: number) => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) {
        return;
      }

      const amountPaid = Math.min(invoice.amount, invoice.amountPaid + amount);
      updateInvoice(id, {
        amountPaid,
        status: amountPaid >= invoice.amount ? "Paid" : "Partially Paid",
        balanceRemaining: Math.max(0, invoice.amount - amountPaid)
      });
    },
    [invoices, updateInvoice]
  );

  const resetDemoData = useCallback(() => {
    setInvoices(mockInvoices);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      invoices,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      markAsPaid,
      recordPartialPayment,
      resetDemoData
    }),
    [addInvoice, deleteInvoice, invoices, markAsPaid, recordPartialPayment, resetDemoData, updateInvoice]
  );

  return <InvoiceContext.Provider value={value}>{children}</InvoiceContext.Provider>;
}

export function useInvoices() {
  const value = useContext(InvoiceContext);

  if (!value) {
    throw new Error("useInvoices must be used within InvoiceProvider");
  }

  return value;
}
