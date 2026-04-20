import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const signedUrlExpirySeconds = 60;

type AttachmentRow = {
  bucket: string;
  storage_path: string;
  file_name: string;
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
    return NextResponse.json({ error: "Sign in before viewing attachments." }, { status: 401 });
  }

  const { data: attachment, error: attachmentError } = await supabase
    .from("invoice_attachments")
    .select("bucket, storage_path, file_name")
    .eq("invoice_id", id)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AttachmentRow>();

  if (attachmentError) {
    return NextResponse.json({ error: attachmentError.message }, { status: 500 });
  }

  if (!attachment) {
    return NextResponse.json({ error: "No attachment found for this invoice." }, { status: 404 });
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(attachment.bucket)
    .createSignedUrl(attachment.storage_path, signedUrlExpirySeconds);

  if (signedUrlError || !signedUrl?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Attachment link could not be created." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrl.signedUrl);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
