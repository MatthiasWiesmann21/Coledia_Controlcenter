/**
 * Email sending via SMTP (configured through env vars, e.g. Resend SMTP).
 *
 * When SMTP_HOST is not set, sendEmail() is a no-op that logs the message in
 * development so auth/notification flows can still be exercised end-to-end.
 */
import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

/**
 * Send a single email. Without SMTP config, resolves successfully and logs the
 * message in development.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const smtp = getTransporter();
  if (!smtp) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[email:stub] to=${message.to} subject="${message.subject}" (SMTP_HOST not set)`,
      );
      if (message.text) console.log(`[email:stub] text: ${message.text}`);
    }
    return;
  }
  await smtp.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}
