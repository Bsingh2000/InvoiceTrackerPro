import { NextResponse } from "next/server";

import { buildInvoiceExportPackage } from "@/lib/export/invoice-export";
import { createClient } from "@/lib/supabase/server";

type InvoiceRow = {
  id: string;
  workspace_id: string;
  invoice_number: string;
  type: "receivable" | "payable";
  party_name: string;
  contact: string | null;
  invoice_date: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  balance_remaining: number;
  currency: "TTD" | "USD" | "EUR" | "GBP" | "CAD" | "BOB";
  status: string;
  payment_method: string | null;
  category: string;
  notes: string | null;
  internal_remarks: string | null;
  priority: string;
  reminder_date: string | null;
  reference_number: string | null;
  recurring: boolean;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  currency: InvoiceRow["currency"];
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

type AttachmentRow = {
  bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
};

type TagRow = {
  tag: string;
};

type WorkspaceRow = {
  name: string;
};

type WorkspaceSettingsRow = {
  business_name: string | null;
  finance_email: string | null;
  default_payment_terms: string | null;
};

export async function GET(
  _request: Request,
  {
    params
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid invoice id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in before exporting invoices." }, { status: 401 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, workspace_id, invoice_number, type, party_name, contact, invoice_date, due_date, amount, amount_paid, balance_remaining, currency, status, payment_method, category, notes, internal_remarks, priority, reminder_date, reference_number, recurring, created_at, updated_at"
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle<InvoiceRow>();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const [
    { data: workspace, error: workspaceError },
    { data: workspaceSettings, error: workspaceSettingsError },
    { data: paymentRows, error: paymentError },
    { data: attachmentRows, error: attachmentError },
    { data: tagRows, error: tagError }
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", invoice.workspace_id)
      .maybeSingle<WorkspaceRow>(),
    supabase
      .from("workspace_settings")
      .select("business_name, finance_email, default_payment_terms")
      .eq("workspace_id", invoice.workspace_id)
      .maybeSingle<WorkspaceSettingsRow>(),
    supabase
      .from("invoice_payments")
      .select("id, amount, currency, payment_date, payment_method, reference_number, notes, created_at")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false })
      .returns<PaymentRow[]>(),
    supabase
      .from("invoice_attachments")
      .select("bucket, storage_path, file_name, content_type")
      .eq("invoice_id", invoice.id)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<AttachmentRow[]>(),
    supabase
      .from("invoice_tags")
      .select("tag")
      .eq("invoice_id", invoice.id)
      .order("tag", { ascending: true })
      .returns<TagRow[]>()
  ]);

  if (workspaceError || workspaceSettingsError || paymentError || attachmentError || tagError) {
    return NextResponse.json(
      {
        error:
          workspaceError?.message ||
          workspaceSettingsError?.message ||
          paymentError?.message ||
          attachmentError?.message ||
          tagError?.message ||
          "Invoice export could not be prepared."
      },
      { status: 500 }
    );
  }

  const attachments = [];

  for (const attachment of attachmentRows ?? []) {
    const { data, error } = await supabase.storage
      .from(attachment.bucket)
      .download(attachment.storage_path);

    if (error || !data) {
      return NextResponse.json(
        {
          error: error?.message ?? `Attachment ${attachment.file_name} could not be downloaded.`
        },
        { status: 500 }
      );
    }

    attachments.push({
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      bytes: new Uint8Array(await data.arrayBuffer())
    });
  }

  const archive = await buildInvoiceExportPackage({
    invoice,
    workspace: {
      name: workspace?.name ?? "Invoice Tracker",
      businessName: workspaceSettings?.business_name ?? null,
      financeEmail: workspaceSettings?.finance_email ?? null,
      defaultPaymentTerms: workspaceSettings?.default_payment_terms ?? null
    },
    tags: (tagRows ?? []).map((row) => row.tag),
    payments: paymentRows ?? [],
    attachments
  });

  return new NextResponse(Buffer.from(archive.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archive.fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
