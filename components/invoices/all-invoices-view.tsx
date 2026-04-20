"use client";

import { FilePlus2 } from "lucide-react";

import { InvoiceTable } from "@/components/invoices/invoice-table";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";

export function AllInvoicesView() {
  return (
    <>
      <PageHeader
        eyebrow="Invoice operations"
        title="All invoices"
        description="Search, filter, review, and act on receivables and payables from one clear ledger."
        action={
          <ButtonLink href="/invoices/new">
            <FilePlus2 className="size-4" />
            Add invoice
          </ButtonLink>
        }
      />
      <InvoiceTable title="Invoice ledger" />
    </>
  );
}
