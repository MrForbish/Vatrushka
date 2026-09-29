# Аутентификация

Новый аккаунт создаётся с паролем и подтверждением email. Пароль хешируется `scrypt` с индивидуальной 16-байтной солью и никогда не хранится или не логируется открытым текстом. Passwordless endpoints `/auth/request-code` и `/auth/verify-code` удалены и возвращают 404; существующий аккаунт без password hash не может авторизоваться.

Вход с паролем всегда требует второй фактор: email-код, TOTP или одноразовый recovery-код. TOTP-секрет генерируется на сервере, отдаётся один раз как `otpauth://`/QR и хранится в PostgreSQL только в AES-256-GCM зашифрованном виде с `CREDENTIAL_ENCRYPTION_KEY`. Проверка принимает текущий 30-секундный интервал и по одному соседнему интервалу.

При включении 2FA сервер выдаёт десять recovery-кодов формата `XXXX-XXXX-XXXX`. Открытые значения показываются только один раз, в PostgreSQL сохраняются SHA-256 hashes. Успешная проверка атомарно помечает код использованным. Новый набор полностью отзывает предыдущий, отключение 2FA удаляет все коды.

## OTP

- электронная почта: `trim + lowercase`;
- шесть цифр, 10 минут, повтор через 60 секунд;
- максимум пять проверок;
- новый код помечает предыдущий consumed;
- хранится `HMAC-SHA256(email:code, OTP_PEPPER)`, сравнение constant-time;
- Fastify rate limit ограничивает IP, resend rule и attempts ограничивают email/code;
- `DEV_FIXED_OTP` разрешён только в development/test.

SMTP credentials, OTP и пароль не попадают в production logs. Единственные интерактивные входы — регистрация с паролем и password login с обязательным вторым фактором.

OTP и security notices сохраняются в PostgreSQL outbox до отправки. Код в outbox зашифрован application credential key, SMTP выполняется фоновым worker с повторными попытками и дедупликацией. Создание auth session и ответ после 2FA больше не ждут SMTP; состояние доставки наблюдается через `auth_email_delivery_total`, `auth_email_delivery_duration_seconds` и структурированные outbox logs. Письма имеют отдельный текст по назначению кода, HTML/text версии и footer с allowlisted контактами поддержки.

## Сброс пароля

`POST /auth/password/reset/request-code` всегда возвращает одинаковый ответ и проходит тот же SMTP-путь как для существующего, так и для неизвестного email, поэтому не раскрывает наличие аккаунта. Reset-код имеет отдельный purpose, HMAC hash, TTL, resend и attempt limits. `POST /auth/password/reset/complete` атомарно обновляет password hash и отзывает все session rows пользователя; активные access/refresh tokens после этого не проходят серверную проверку, presence очищается, а `PASSWORD_RESET` попадает в security feed и email notice. Настроенный TOTP не отключается.

## Сессии

Access JWT: HS256, issuer/audience, 15 минут, только в renderer memory. Refresh: 48 random bytes/base64url, SHA-256 hash в PostgreSQL, 30 дней. Зашифрованный refresh читает только Electron main process: preload не имеет метода, возвращающего долгоживущий токен renderer-коду. Main самостоятельно выполняет startup refresh, rotation и logout и отдаёт renderer только новый access JWT и пользователя.

Флаг «Запомнить меня» управляет только долговечностью refresh-сессии. При включённом флаге Electron main хранит refresh token в DPAPI-encrypted `session.bin`; при выключенном — только в памяти текущего main process. Rotation сохраняет выбранную политику, а пароль никогда не записывается. После закрытия приложения незапомненная сессия не восстанавливается.

Auth UI использует gaming-композицию с фирменным знаком, но не меняет auth-контракты: password, registration, reset, email/TOTP/recovery и сообщения об ошибках остаются едиными. Минимальный поддерживаемый viewport — 1100×680; все действия доступны с клавиатуры.

Каждый refresh создаёт новую session row и отзывает старую. Повторное использование заменённого или уже отозванного token отзывает всю `token_family_id`. Desktop `ApiClient` имеет один shared refresh promise, поэтому конкурентные 401 не запускают несколько rotations. Electron main дополнительно объединяет одновременные IPC refresh-вызовы в один запрос до сохранения нового токена. После успеха или ошибки следующий вызов может начать новый запрос; refresh token остаётся только в main process.

API `GET /auth/sessions` группирует строки ротации по `token_family_id`, поэтому одно реальное устройство показано одной сессией. Сессию можно пометить доверенной (пользователь подтверждает, что узнаёт устройство; это намеренно не отключает 2FA), отозвать отдельно или завершить все остальные. После отзыва все access/refresh-токены семьи перестают проходить проверку. Критичные действия сохраняются в `security_events` и дублируются email-уведомлением. Logout отзывает текущий hash и очищает DPAPI-encrypted файл.
