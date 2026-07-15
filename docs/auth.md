# Passwordless auth

## OTP

- email: `trim + lowercase`;
- шесть цифр, 10 минут, повтор через 60 секунд;
- максимум пять проверок;
- новый код помечает предыдущий consumed;
- хранится `HMAC-SHA256(email:code, OTP_PEPPER)`, сравнение constant-time;
- Fastify rate limit ограничивает IP, resend rule и attempts ограничивают email/code;
- `DEV_FIXED_OTP` разрешён только в development/test.

Успех request endpoint одинаков для существующего и нового email. SMTP и OTP не попадают в production logs.

## Sessions

Access JWT: HS256, issuer/audience, 15 минут, только в renderer memory. Refresh: 48 random bytes/base64url, SHA-256 hash в PostgreSQL, 30 дней.

Каждый refresh создаёт новую session row и отзывает старую. Повторное использование заменённого или уже отозванного token отзывает всю `token_family_id`. Desktop `ApiClient` имеет один shared refresh promise, поэтому конкурентные 401 не запускают несколько rotations.

Logout отзывает текущий hash и очищает DPAPI-encrypted файл. Невалидная startup session также очищается без показа stack trace.
