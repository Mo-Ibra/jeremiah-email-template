// ---------------------------------------------------------------------------
// Resend transactional email client
//   Docs: https://resend.com/docs/api-reference/emails/send-email
//   Endpoint: POST https://api.resend.com/emails  (Bearer re_...)
// ---------------------------------------------------------------------------

const RESEND_BASE = "https://api.resend.com";

export type SendReviewEmailInput = {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  reviewRequestId: string;
};

export type SendReviewEmailResult = {
  emailId: string;
};

export class ResendError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export async function sendReviewEmail(
  input: SendReviewEmailInput,
): Promise<SendReviewEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ResendError("RESEND_API_KEY is not configured");
  }

  const res = await fetch(`${RESEND_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${input.fromName} <${input.fromEmail}>`,
      to: [input.toEmail],
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: {
        "X-Review-Request-Id": input.reviewRequestId,
      },
      tags: [
        { name: "review_request_id", value: input.reviewRequestId },
      ],
    }),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    // Resend error body: { statusCode, message, name }
    let message = `Resend API responded ${res.status}`;
    try {
      const err = JSON.parse(bodyText);
      if (typeof err.message === "string") message = err.message;
    } catch {
      // ignore
    }
    throw new ResendError(message, res.status, bodyText);
  }

  let data: { id?: string };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new ResendError("Resend API returned invalid JSON", res.status, bodyText);
  }

  if (!data.id) {
    throw new ResendError("Resend API did not return an id", res.status, bodyText);
  }

  return { emailId: data.id };
}
