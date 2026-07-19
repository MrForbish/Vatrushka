import { describe, expect, it } from "vitest";

import { buildOtpEmail, buildSecurityEmail } from "./mailer.js";

describe("mail templates", () => {
  it("renders a purpose-specific accessible OTP in text and HTML", () => {
    const email = buildOtpEmail("123456", 10, "registration");
    expect(email.subject).toContain("регистрации");
    expect(email.text).toContain("123456");
    expect(email.text).toContain("10 минут");
    expect(email.html).toContain("123456");
    expect(email.html).toContain("mailto:vatrushka-notify@yandex.ru");
    expect(email.html).not.toContain("<script");
  });

  it("escapes untrusted security-event content", () => {
    const email = buildSecurityEmail(
      "Новый вход",
      "<img src=x onerror=alert(1)>",
    );
    expect(email.html).toContain("&lt;img");
    expect(email.html).not.toContain("<img");
    expect(email.text).toContain("Если это были не вы");
  });
});
