# Authentication

Новый аккаунт создаётся с паролем и подтверждением email. Пароль хешируется `scrypt` с индивидуальной 16-байтной солью и никогда не хранится или не логируется открытым текстом. Passwordless endpoints `/auth/request-code` и `/auth/verify-code` удалены и возвращают 404; существующий аккаунт без password hash не может авторизоваться.

Вход с паролем всегда требует второй фактор: email-код, TOTP или одноразовый recovery-код. TOTP-секрет генерируется на сервере, отдаётся один раз как `otpauth://`/QR и хранится в PostgreSQL только в AES-256-GCM зашифрованном виде с `CREDENTIAL_ENCRYPTION_KEY`. Проверка принимает текущий 30-секундный интервал и по одному соседнему интервалу.

При включении 2FA сервер выдаёт десять recovery-кодов формата `XXXX-XXXX-XXXX`. Открытые значения показываются только один раз, в PostgreSQL сохраняются SHA-256 hashes. Успешная проверка атомарно помечает код использованным. Новый набор полностью отзывает предыдущий, отключение 2FA удаляет все коды.

## OTP

- email: `trim + lowercase`;
- шесть цифр, 10 минут, повтор через 60 секунд;
- максимум пять проверок;
- новый код помечает предыдущий consumed;
- хранится `HMAC-SHA256(email:code, OTP_PEPPER)`, сравнение constant-time;
- Fastify rate limit ограничивает IP, resend rule и attempts ограничивают email/code;
- `DEV_FIXED_OTP` разрешён только в development/test.

SMTP credentials, OTP и пароль не попадают в production logs. Единственные интерактивные входы — регистрация с паролем и password login с обязательным вторым фактором.

## Sessions

Access JWT: HS256, issuer/audience, 15 минут, только в renderer memory. Refresh: 48 random bytes/base64url, SHA-256 hash в PostgreSQL, 30 дней. Зашифрованный refresh читает только Electron main process: preload не имеет метода, возвращающего долгоживущий токен renderer-коду. Main самостоятельно выполняет startup refresh, rotation и logout и отдаёт renderer только новый access JWT и пользователя.

Каждый refresh создаёт новую session row и отзывает старую. Повторное использование заменённого или уже отозванного token отзывает всю `token_family_id`. Desktop `ApiClient` имеет один shared refresh promise, поэтому конкурентные 401 не запускают несколько rotations.

API `GET /auth/sessions` группирует строки ротации по `token_family_id`, поэтому одно реальное устройство показано одной сессией. Сессию можно пометить доверенной (пользователь подтверждает, что узнаёт устройство; это намеренно не отключает 2FA), отозвать отдельно или завершить все остальные. После отзыва все access/refresh-токены семьи перестают проходить проверку. Критичные действия сохраняются в `security_events` и дублируются email-уведомлением. Logout отзывает текущий hash и очищает DPAPI-encrypted файл.
