// ---------------------------------------------------------------------------
// Render the review email as a string (no React, no JS in output).
// Design starting point: the business's existing HTML email template.
// Constraint: email clients block JS — every rating is a plain <a href>.
// ---------------------------------------------------------------------------

export type RenderReviewEmailInput = {
  token: string;
  customerName: string;
  businessName: string;
};

export type RenderedReviewEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderReviewEmail({
  token,
  customerName,
  businessName,
}: RenderReviewEmailInput): RenderedReviewEmail {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  const starUrls = Array.from(
    { length: 5 },
    (_, i) => `${base}/r/${token}?rating=${i + 1}`,
  );
  const landingUrl = `${base}/r/${token}`;
  const openPixelUrl = `${base}/api/track/open?t=${token}`;

  const safeName = escapeHtml(customerName);
  const safeBiz = escapeHtml(businessName);

  const stars = starUrls
    .map(
      (url, i) => `
        <td style="width:20%; padding:6px; text-align:center;">
          <a href="${url}" title="Rate ${i + 1} star${i === 0 ? "" : "s"}" style="display:inline-block; font-size:28px; line-height:44px; width:52px; height:44px; color:#111827; text-decoration:none; border:1px solid #e4e4e7; border-radius:8px; background-color:#fafafa;">&#9733;</a>
          <span style="font-size:12px; color:#71717a; margin-top:4px; display:block;">${i + 1}</span>
        </td>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; opacity:0;">Hi ${safeName}, how was your order with ${safeBiz}?</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid #e4e4e7; border-top:4px solid #111827;">
      <tr>
        <td style="padding:24px; border-bottom:1px solid #e4e4e7;">
          <span style="font-size:18px; font-weight:bold; color:#111827;">${safeBiz}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px;">
          <h1 style="font-size:20px; color:#111827; margin:0 0 12px;">Hi ${safeName},</h1>
          <p style="font-size:15px; color:#3f3f46; margin:0 0 24px; line-height:22px;">How was your order with ${safeBiz}? We would love your honest feedback. Tap a star below to rate us:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${stars}</tr>
          </table>
          <p style="font-size:13px; color:#71717a; margin:24px 0 0; line-height:20px;">Or <a href="${landingUrl}" style="color:#4f46e5;">open the rating page</a>.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px; font-size:12px; color:#71717a; border-top:1px solid #e4e4e7; line-height:18px;">
          <p style="margin:0 0 6px;">You received this email because you placed an order with ${safeBiz}.</p>
          <p style="margin:0;">If you did not order, you can ignore this email.</p>
        </td>
      </tr>
    </table>
    <img src="${openPixelUrl}" alt="" width="1" height="1" style="display:none;" />
  </body>
</html>`;

  const text = [
    `Hi ${customerName},`,
    ``,
    `How was your order with ${businessName}? Rate us:`,
    ``,
    `1 Star: ${starUrls[0]}`,
    `2 Stars: ${starUrls[1]}`,
    `3 Stars: ${starUrls[2]}`,
    `4 Stars: ${starUrls[3]}`,
    `5 Stars: ${starUrls[4]}`,
    ``,
    `Or open the rating page: ${landingUrl}`,
    ``,
    `Thank you!`,
  ].join("\n");

  return {
    subject: `How was your order, ${customerName}?`,
    html,
    text,
  };
}
