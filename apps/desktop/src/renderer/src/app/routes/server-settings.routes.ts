import type { SettingsNavigationItem } from '../../features/settings';
import type { ServerSettingsSection } from './route-paths';

export const serverSettingsNavigation = [
  { section: 'overview', label: 'Обзор', description: 'Основные параметры сервера', icon: 'info' },
  { section: 'appearance', label: 'Оформление', description: 'Иконка, обложка и акцент', icon: 'sparkles' },
  { section: 'members', label: 'Участники', description: 'Роли и модерационные действия', icon: 'users' },
  { section: 'roles', label: 'Роли и права', description: 'Иерархия и разрешения', icon: 'lock' },
  { section: 'channels', label: 'Каналы и категории', description: 'Структура и права каналов', icon: 'hash' },
  { section: 'invites', label: 'Приглашения', description: 'Короткие ссылки на сервер', icon: 'invite' },
  { section: 'moderation', label: 'Модерация', description: 'Ограничения и заблокированные участники', icon: 'warning' },
  { section: 'audit-log', label: 'Журнал аудита', description: 'Административные события', icon: 'search' },
  { section: 'danger', label: 'Опасная зона', description: 'Владение и удаление сервера', icon: 'warning', dangerous: true },
] as const satisfies readonly SettingsNavigationItem<ServerSettingsSection>[];
