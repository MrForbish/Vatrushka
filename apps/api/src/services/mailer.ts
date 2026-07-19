import nodemailer from "nodemailer";

import type { AppConfig } from "../config.js";
import type { Mailer } from "../ports.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const feedbackText = "Помощь: https://t.me/MaksZJ · vatrushka-notify@yandex.ru";
const otpTitles: Record<string, string> = {
  registration: "Подтверждение регистрации",
  login: "Код для входа",
  password_login: "Подтверждение входа",
  password_setup: "Установка пароля",
  password_reset: "Восстановление пароля",
  email_change: "Смена email",
};

function emailFrame(title: string, body: string): string {
  return `<div style="margin:0;padding:24px;background:#07111b;color:#eef6ff"><main style="box-sizing:border-box;max-width:560px;margin:auto;padding:32px;border:1px solid #24364a;border-radius:20px;background:#0e1b29;font-family:Arial,sans-serif"><div style="margin-bottom:28px;color:#32d7e8;font-size:14px;font-weight:800;letter-spacing:.12em">ВАТРУШКА</div><h1 style="margin:0 0 18px;color:#fff;font-size:25px">${escapeHtml(title)}</h1>${body}<footer style="margin-top:30px;padding-top:18px;border-top:1px solid #24364a;color:#8ca4ba;font-size:12px;line-height:1.6">Помощь: <a style="color:#32d7e8" href="https://t.me/MaksZJ">Telegram</a> · <a style="color:#32d7e8" href="mailto:vatrushka-notify@yandex.ru">vatrushka-notify@yandex.ru</a></footer></main></div>`;
}

export function buildOtpEmail(
  code: string,
  expiresInMinutes: number,
  purpose = "login",
): { subject: string; text: string; html: string } {
  const title = otpTitles[purpose] ?? "Код подтверждения";
  return {
    subject: `Ватрушка: ${title.toLowerCase()}`,
    text: `Ватрушка\n\n${title}\n\nКод: ${code}\nДействует ${expiresInMinutes} минут.\n\nЕсли вы не запрашивали это действие, никому не сообщайте код и проигнорируйте письмо.\n\n${feedbackText}`,
    html: emailFrame(
      title,
      `<p style="color:#b9cad9;line-height:1.65">Введите этот одноразовый код в приложении:</p><div style="margin:24px 0;padding:18px;border-radius:14px;background:#07111b;color:#fff;font-family:monospace;font-size:34px;font-weight:800;letter-spacing:9px;text-align:center">${escapeHtml(code)}</div><p style="color:#b9cad9">Код действует ${expiresInMinutes} минут.</p><p style="color:#ffbd66;line-height:1.6">Если вы не запрашивали это действие, никому не сообщайте код и проигнорируйте письмо.</p>`,
    ),
  };
}

export function buildSecurityEmail(
  title: string,
  message: string,
): { subject: string; text: string; html: string } {
  return {
    subject: `Ватрушка: ${title}`,
    text: `Ватрушка\n\n${title}\n\n${message}\n\nЕсли это были не вы, немедленно смените пароль и завершите другие сессии.\n\n${feedbackText}`,
    html: emailFrame(
      title,
      `<p style="color:#b9cad9;line-height:1.65">${escapeHtml(message)}</p><p style="color:#ff6b7c;line-height:1.6">Если это были не вы, немедленно смените пароль и завершите другие сессии.</p>`,
    ),
  };
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
      ...(config.SMTP_USER
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });
  }

  async sendOtp(
    email: string,
    code: string,
    expiresInMinutes: number,
    purpose = "login",
  ): Promise<void> {
    await this.transporter.sendMail({
      from: {
        name: this.config.SMTP_FROM_NAME,
        address: this.config.SMTP_FROM_EMAIL,
      },
      to: email,
      ...buildOtpEmail(code, expiresInMinutes, purpose),
    });
  }

  async sendSecurityNotice(
    email: string,
    title: string,
    message: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: {
        name: this.config.SMTP_FROM_NAME,
        address: this.config.SMTP_FROM_EMAIL,
      },
      to: email,
      ...buildSecurityEmail(title, message),
    });
  }
}
