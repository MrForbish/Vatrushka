import type { ServerPermission } from '@vatrushka/shared';

export interface PermissionDefinition {
  permission: ServerPermission;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDefinition[];
}

const definitions: Record<ServerPermission, Omit<PermissionDefinition, 'permission'>> = {
  ADMINISTRATOR: { label: 'Администратор', description: 'Даёт все права и обходит ограничения каналов.' },
  VIEW_SERVER: { label: 'Видеть сервер', description: 'Открывать сервер и видеть его доступные разделы.' },
  VIEW_SERVER_SETTINGS: { label: 'Видеть настройки сервера', description: 'Открывать доступные разделы настроек сервера.' },
  MANAGE_SERVER: { label: 'Управлять сервером', description: 'Менять название и основные настройки сервера.' },
  MANAGE_APPEARANCE: { label: 'Управлять оформлением', description: 'Менять значок, обложку и акцентный цвет сервера.' },
  MANAGE_MEMBERS: { label: 'Управлять участниками', description: 'Менять роли, имена и состояние участников с учётом иерархии.' },
  MANAGE_CHANNELS: { label: 'Управлять каналами', description: 'Создавать, изменять и удалять каналы.' },
  MANAGE_ROLES: { label: 'Управлять ролями', description: 'Настраивать роли ниже своей и права каналов.' },
  MANAGE_INVITES: { label: 'Управлять приглашениями', description: 'Создавать и отзывать приглашения.' },
  MANAGE_INTEGRATIONS: { label: 'Управлять интеграциями', description: 'Подключать внешние сервисы и автоматизацию.' },
  VIEW_AUDIT_LOG: { label: 'Просматривать аудит', description: 'Видеть журнал административных действий.' },
  EXPORT_AUDIT_LOG: { label: 'Экспортировать аудит', description: 'Выгружать разрешённые записи журнала аудита.' },
  MANAGE_MODERATION: { label: 'Управлять модерацией', description: 'Настраивать правила, ограничения и список блокировок.' },
  MANAGE_BACKUPS: { label: 'Управлять резервными копиями', description: 'Запускать и восстанавливать доступные резервные копии.' },
  TRANSFER_OWNERSHIP: { label: 'Передавать владение', description: 'Передавать сервер другому участнику после подтверждения.' },
  DELETE_SERVER: { label: 'Удалять сервер', description: 'Безвозвратно удалять сервер после повторной проверки личности.' },
  MANAGE_SERVER_SECURITY: { label: 'Управлять безопасностью', description: 'Менять требования безопасности сервера.' },
  KICK_MEMBERS: { label: 'Исключать участников', description: 'Удалять участников с сервера.' },
  BAN_MEMBERS: { label: 'Блокировать участников', description: 'Запрещать повторное присоединение.' },
  TIMEOUT_MEMBERS: { label: 'Ограничивать участников', description: 'Временно запрещать общение.' },
  MANAGE_NICKNAMES: { label: 'Управлять именами', description: 'Изменять отображаемые имена участников.' },
  VIEW_MODERATION_NOTES: { label: 'Заметки модерации', description: 'Просматривать внутренние заметки команды.' },
  MANAGE_REPORTS: { label: 'Обрабатывать жалобы', description: 'Просматривать и закрывать жалобы.' },
  VIEW_CHANNEL: { label: 'Видеть канал', description: 'Видеть канал в списке и открывать его.' },
  READ_MESSAGE_HISTORY: { label: 'Читать историю', description: 'Просматривать ранее отправленные сообщения.' },
  SEND_MESSAGES: { label: 'Отправлять сообщения', description: 'Писать в текстовых каналах.' },
  SEND_ATTACHMENTS: { label: 'Прикреплять файлы', description: 'Загружать изображения и документы.' },
  ADD_REACTIONS: { label: 'Добавлять реакции', description: 'Ставить эмодзи-реакции на сообщения.' },
  EMBED_LINKS: { label: 'Встраивать ссылки', description: 'Показывать предпросмотр ссылок.' },
  MENTION_EVERYONE: { label: 'Упоминать всех', description: 'Отправлять массовые упоминания.' },
  MANAGE_OWN_MESSAGES: { label: 'Управлять своими сообщениями', description: 'Редактировать и удалять собственные сообщения.' },
  MANAGE_MESSAGES: { label: 'Управлять сообщениями', description: 'Редактировать и удалять чужие сообщения.' },
  PIN_MESSAGES: { label: 'Закреплять сообщения', description: 'Добавлять сообщения в список важных.' },
  CREATE_THREADS: { label: 'Создавать обсуждения', description: 'Создавать ветки по сообщениям.' },
  CONNECT_VOICE: { label: 'Подключаться к голосу', description: 'Входить в голосовые каналы.' },
  SPEAK: { label: 'Говорить', description: 'Передавать голос в голосовом канале.' },
  STREAM_VIDEO: { label: 'Включать камеру', description: 'Передавать видео с камеры в голосовом канале.' },
  STREAM_SCREEN: { label: 'Демонстрировать экран', description: 'Запускать показ экрана или приложения.' },
  STREAM_APPLICATION_AUDIO: { label: 'Передавать звук приложения', description: 'Добавлять системный звук к демонстрации.' },
  USE_PRIORITY_VOICE: { label: 'Приоритет голоса', description: 'Получать приоритет во время разговора.' },
  MUTE_MEMBERS: { label: 'Выключать микрофоны', description: 'Принудительно отключать голос участников.' },
  DEAFEN_MEMBERS: { label: 'Отключать звук участникам', description: 'Запрещать участникам слышать канал.' },
  MOVE_MEMBERS: { label: 'Перемещать участников', description: 'Переводить участников между каналами.' },
  STOP_OTHERS_STREAM: { label: 'Останавливать демонстрации', description: 'Завершать чужой показ экрана.' },
  CREATE_TEMPORARY_VOICE: { label: 'Временные голосовые каналы', description: 'Создавать голосовые комнаты на время.' },
  MANAGE_2FA_POLICY: { label: 'Политика 2FA', description: 'Требовать двухфакторную защиту от команды.' },
  MANAGE_SESSIONS: { label: 'Управлять сессиями', description: 'Завершать активные сессии участников.' },
  VIEW_TECHNICAL_LOGS: { label: 'Технические журналы', description: 'Просматривать диагностические события.' },
  EXPORT_SERVER_DATA: { label: 'Экспортировать данные', description: 'Создавать выгрузку данных сервера.' },
};

function group(id: string, label: string, permissions: ServerPermission[]): PermissionGroup {
  return { id, label, permissions: permissions.map((permission) => ({ permission, ...definitions[permission] })) };
}

export const permissionDefinitions = Object.fromEntries(
  Object.entries(definitions).map(([permission, definition]) => [permission, { permission, ...definition }]),
) as Record<ServerPermission, PermissionDefinition>;

export const channelPermissionGroups = [
  group('text', 'Текстовые каналы', ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'EMBED_LINKS', 'MENTION_EVERYONE', 'MANAGE_OWN_MESSAGES', 'MANAGE_MESSAGES', 'PIN_MESSAGES', 'CREATE_THREADS']),
  group('voice', 'Голос, камера и демонстрация', ['CONNECT_VOICE', 'SPEAK', 'STREAM_VIDEO', 'STREAM_SCREEN', 'STREAM_APPLICATION_AUDIO', 'USE_PRIORITY_VOICE', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS', 'STOP_OTHERS_STREAM', 'CREATE_TEMPORARY_VOICE']),
];
