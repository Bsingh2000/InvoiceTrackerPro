type MailerSendInput = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};

type MailerSendValidationError = {
  status: number;
  message: string;
  code?: string;
  fieldErrors: Array<{
    field: string;
    messages: string[];
  }>;
  payloadShape: MailerSendPayloadShape;
  raw: unknown;
};

type MailerSendPayloadShape = {
  from: {
    emailPresent: boolean;
    namePresent: boolean;
    domain?: string;
  };
  toCount: number;
  firstToDomain?: string;
  subjectPresent: boolean;
  hasHtml: boolean;
  hasText: boolean;
  hasTemplateId: boolean;
  htmlLength: number;
  textLength: number;
};

type MailerSendResult =
  | { ok: true; messageId?: string }
  | {
      ok: false;
      error: string;
      status?: number;
      details?: unknown;
      mailerSendError?: MailerSendValidationError;
    };

export async function sendMailerSendEmail(input: MailerSendInput): Promise<MailerSendResult> {
  const token = process.env.email_api_key || process.env.EMAIL_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  const fromName = process.env.MAIL_FROM_NAME;

  if (!token) {
    return {
      ok: false,
      error: "Missing MailerSend token. Add email_api_key to .env.local."
    };
  }

  if (!fromEmail || !fromName) {
    return {
      ok: false,
      error: "Missing sender details. Add MAIL_FROM_EMAIL and MAIL_FROM_NAME to .env.local."
    };
  }

  const payload = {
    from: {
      email: fromEmail,
      name: fromName
    },
    to: input.to.map((email) => ({ email })),
    subject: input.subject,
    html: input.html,
    text: input.text
  };
  const payloadShape = getPayloadShape(payload);

  console.info("[MailerSend] Sending email payload shape", payloadShape);

  try {
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const rawError = await readMailerSendError(response);
      const mailerSendError = normalizeMailerSendError(response.status, rawError, payloadShape);

      console.error("[MailerSend] Error response status", response.status);
      console.error("[MailerSend] Parsed error body", rawError);
      console.error("[MailerSend] Request payload shape", payloadShape);

      return {
        ok: false,
        status: response.status,
        error: getFriendlyMailerSendMessage(mailerSendError),
        details: rawError,
        mailerSendError
      };
    }

    return {
      ok: true,
      messageId: response.headers.get("x-message-id") ?? undefined
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "MailerSend request failed."
    };
  }
}

async function readMailerSendError(response: Response) {
  try {
    return await response.json();
  } catch {
    try {
      return {
        message: await response.text()
      };
    } catch {
      return {
        message: "MailerSend returned an unreadable error response."
      };
    }
  }
}

function normalizeMailerSendError(
  status: number,
  raw: unknown,
  payloadShape: MailerSendPayloadShape
): MailerSendValidationError {
  const body = isRecord(raw) ? raw : {};
  const fieldErrors = normalizeFieldErrors(body.errors);
  const message =
    getString(body.message) ||
    getString(body.error) ||
    `MailerSend rejected the email request with status ${status}.`;
  const code = findValidationCode(raw);

  return {
    status,
    message,
    code,
    fieldErrors,
    payloadShape,
    raw
  };
}

function normalizeFieldErrors(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).map(([field, messages]) => ({
    field,
    messages: Array.isArray(messages)
      ? messages.map((message) => String(message))
      : [String(messages)]
  }));
}

function getFriendlyMailerSendMessage(error: MailerSendValidationError) {
  const combined = [
    error.message,
    error.code ?? "",
    ...error.fieldErrors.flatMap((field) => [field.field, ...field.messages])
  ]
    .join(" ")
    .toLowerCase();

  if (
    error.code === "MS42207" ||
    (combined.includes("from.email") && combined.includes("verified")) ||
    (combined.includes("domain") && combined.includes("verified"))
  ) {
    return "Sender domain is not verified in MailerSend.";
  }

  if (error.fieldErrors.length) {
    const first = error.fieldErrors[0];
    return `${first.field}: ${first.messages.join(" ")}`;
  }

  return error.message;
}

function getPayloadShape(payload: {
  from: { email: string; name: string };
  to: Array<{ email: string }>;
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
}): MailerSendPayloadShape {
  return {
    from: {
      emailPresent: Boolean(payload.from.email),
      namePresent: Boolean(payload.from.name),
      domain: getEmailDomain(payload.from.email)
    },
    toCount: payload.to.length,
    firstToDomain: getEmailDomain(payload.to[0]?.email),
    subjectPresent: Boolean(payload.subject),
    hasHtml: Boolean(payload.html),
    hasText: Boolean(payload.text),
    hasTemplateId: Boolean(payload.template_id),
    htmlLength: payload.html?.length ?? 0,
    textLength: payload.text?.length ?? 0
  };
}

function getEmailDomain(value: string | undefined) {
  return value?.split("@")[1]?.toLowerCase();
}

function findValidationCode(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.match(/\bMS\d{5}\b/)?.[0];
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findValidationCode(item);
      if (match) {
        return match;
      }
    }
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const match = findValidationCode(item);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}
