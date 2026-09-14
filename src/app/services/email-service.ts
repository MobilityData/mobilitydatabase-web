/**
 * Email Service for transactional emails (verification, notifications).
 * Integrates with external email providers (such as Brevo / Sendinblue)
 * to ensure high domain deliverability across corporate providers (Outlook/Office 365).
 */

export interface SendVerificationEmailPayload {
  email: string;
  displayName?: string;
  verificationLink: string;
}

/**
 * Sends a branded email verification message via external transactional email provider (Brevo API).
 */
export async function sendBrandedVerificationEmail(
  payload: SendVerificationEmailPayload,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail =
    process.env.BREVO_SENDER_EMAIL ?? 'no-reply@mobilitydatabase.org';
  const senderName = 'Mobility Database';

  if (!apiKey) {
    console.warn(
      'BREVO_API_KEY not configured. Transactional email was not sent externally.',
    );
    return { success: false, error: 'BREVO_API_KEY is not configured.' };
  }

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your Mobility Database email</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 24px; color: #172b4d; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .header { background-color: #003366; padding: 24px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
          .content { padding: 32px 24px; line-height: 1.6; }
          .button { display: inline-block; background-color: #0066cc; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin: 24px 0; }
          .footer { background: #f9fafb; padding: 16px 24px; font-size: 12px; color: #6b778c; text-align: center; border-top: 1px solid #ebecf0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Mobility Database</h1>
          </div>
          <div class="content">
            <p>Hello${payload.displayName ? ` ${payload.displayName}` : ''},</p>
            <p>Thank you for signing up for the Mobility Database. Please confirm your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${payload.verificationLink}" class="button" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; font-size: 13px; color: #0066cc;">${payload.verificationLink}</p>
            <p>If you did not request this email, no action is needed.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} MobilityData. All rights reserved.<br />
            If you are using Outlook or Office 365, please mark this message as "Not Junk" to ensure future delivery.
          </div>
        </div>
      </body>
      </html>
    `;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: payload.email, name: payload.displayName || payload.email }],
        subject: 'Verify your Mobility Database email address',
        htmlContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Brevo API error: ${errText}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    };
  }
}
