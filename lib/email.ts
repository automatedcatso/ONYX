import nodemailer from "nodemailer";
import { smtpConfiguration } from "@/lib/runtime-config";

export function createMailer() {
  const config = smtpConfiguration();
  if (!config) return null;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export async function sendSecurityEmail(to: string, subject: string, text: string) {
  const config = smtpConfiguration();
  const mailer = createMailer();
  if (!mailer || !config) throw new Error("SMTP is not configured; email failed closed.");
  await mailer.sendMail({
    from: config.from,
    to,
    subject,
    text,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
    },
  });
}
