# Authentication

Новый аккаунт создаётся с паролем и подтверждением email. Пароль хешируется `scrypt` с индивидуальной 16-байтной солью и никогда не хранится или не логируется открытым текстом. Legacy-аккаунт без пароля может войти по email-коду и затем задать пароль в настройках безопасности.

Вход с паролем всегда требует второй фактор: email-код либо TOTP. TOTP-секрет генерируется на сервере, отдаётся один раз как `otpauth://`/QR и хранится в PostgreSQL только в AES-256-GCM зашифрованном виде с `CREDENTIAL_ENCRYPTION_KEY`. Проверка принимает текущий 30-секундный интервал и по одному соседнему интервалу.

## OTP

- email: `trim + lowercase`;
- шесть цифр, 10 минут, повтор через 60 секунд;
- максимум пять проверок;
- новый код помечает предыдущий consumed;
- хранится `HMAC-SHA256(email:code, OTP_PEPPER)`, сравнение constant-time;
- Fastify rate limit ограничивает IP, resend rule и attempts ограничивают email/code;
- `DEV_FIXED_OTP` разрешён только в development/test.

SMTP, OTP и пароль не попадают в production logs. Старый passwordless endpoint отклоняет аккаунт, у которого уже настроен пароль, чтобы пароль нельзя было обойти.

## Sessions

Access JWT: HS256, issuer/audience, 15 минут, только в renderer memory. Refresh: 48 random bytes/base64url, SHA-256 hash в PostgreSQL, 30 дней.

Каждый refresh создаёт новую session row и отзывает старую. Повторное использование заменённого или уже отозванного token отзывает всю `token_family_id`. Desktop `ApiClient` имеет один shared refresh promise, поэтому конкурентные 401 не запускают несколько rotations.

Logout отзывает текущий hash и очищает DPAPI-encrypted файл. Невалидная startup session также очищается без показа stack trace.
