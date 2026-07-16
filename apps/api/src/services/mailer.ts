import nodemailer from 'nodemailer';

import type { AppConfig } from '../config.js';
import type { Mailer } from '../ports.js';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export class SmtpMailer implements Mailer {
  private readonly transporter;

  constructor(private readonly config: AppConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } } : {}),
    });
  }

  async sendOtp(email: string, code: string, expiresInMinutes: number): Promise<void> {
    const appName = this.config.APP_NAME;
    await this.transporter.sendMail({
      from: { name: this.config.SMTP_FROM_NAME, address: this.config.SMTP_FROM_EMAIL },
      to: email,
      subject: `${appName}: код входа`,
      text: `${appName}\n\nВаш одноразовый код: ${code}\nКод действует ${expiresInMinutes} минут.\n\nЕсли вы не запрашивали код, проигнорируйте письмо.`,
      html: `<main style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#172033"><h1>${escapeHtml(appName)}</h1><p>Ваш одноразовый код:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>Код действует ${expiresInMinutes} минут.</p><p style="color:#667085">Если вы не запрашивали код, проигнорируйте письмо.</p></main>`,
    });
  }
}
