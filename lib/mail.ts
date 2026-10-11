// Outgoing email (password-reset links). Server-only.
//
// Configured entirely from environment variables so no secret is in the repo:
//   SMTP_HOST   mail server, e.g. smtp.gmail.com / smtp.zoho.com
//   SMTP_PORT   587 (STARTTLS, default) or 465 (TLS)
//   SMTP_SECURE "true" for implicit TLS — defaults to true only on port 465
//   SMTP_USER   mailbox login (omit for a relay that needs none)
//   SMTP_PASS   mailbox password / app password
//   MAIL_FROM   sender shown to the recipient, e.g. "Pro Nutrition <you@gmail.com>"
//   APP_URL     the public address of this app, e.g. https://pos.example.com
//
// APP_URL is deliberately required rather than guessed from the request: a link
// built from the incoming Host header could be pointed at an attacker's site by
// anyone who can send a forged request.
import nodemailer from 'nodemailer';

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
  appUrl: string;
};

export class MailNotConfiguredError extends Error {
  constructor() {
    super('Email is not set up on this server yet. Ask the owner to add the SMTP settings.');
    this.name = 'MailNotConfiguredError';
  }
}

export function mailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (!host || !from || !appUrl || !/^https?:\/\//i.test(appUrl)) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureEnv ? secureEnv === 'true' : port === 465;
  return {
    host,
    port,
    secure,
    user: process.env.SMTP_USER?.trim() || null,
    pass: process.env.SMTP_PASS ?? null,
    from,
    appUrl,
  };
}

export const mailConfigured = () => mailConfig() !== null;

export async function sendMail(msg: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const cfg = mailConfig();
  if (!cfg) throw new MailNotConfiguredError();

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
    // A dead mail server must not hang a request for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  } finally {
    transport.close();
  }
}
