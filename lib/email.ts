import nodemailer from "nodemailer";

export function createMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

export async function sendSecurityEmail(to: string, subject: string, text: string) {
  const mailer = createMailer();
  const from = process.env.SMTP_FROM;
  if (!mailer || !from) throw new Error("SMTP is not configured; email failed closed.");
  await mailer.sendMail({ from, to, subject, text, headers: { "X-Auto-Response-Suppress": "All" } });
}
