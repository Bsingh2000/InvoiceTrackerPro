import { mockInvoiceRepository } from "@/lib/mock-data";
import type { InvoiceRepository } from "@/lib/types";

// Swap this implementation for a Supabase/Postgres repository when persistence is added.
export const invoiceRepository: InvoiceRepository = mockInvoiceRepository;
