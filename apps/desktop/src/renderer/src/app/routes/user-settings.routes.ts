import type { SettingsNavigationItem } from '../../features/settings';
import type { UserSettingsSection } from './route-paths';

export const userSettingsNavigation = [
  { section: 'profile', label: 'Мой профиль', description: 'Имя, статус и уведомления', icon: 'users' },
  { section: 'audio', label: 'Звук и видео', description: 'Локальные устройства этого компьютера', icon: 'headphones' },
  { section: 'security', label: 'Безопасность', description: 'Пароль, 2FA и резервные коды', icon: 'lock' },
  { section: 'sessions', label: 'Устройства и сессии', description: 'Активные входы в аккаунт', icon: 'screen' },
  { section: 'activity', label: 'Активность аккаунта', description: 'История значимых событий', icon: 'info' },
  { section: 'privacy', label: 'Конфиденциальность', description: 'Кто может видеть и писать вам', icon: 'eye' },
  { section: 'account', label: 'Аккаунт', description: 'Email и управление аккаунтом', icon: 'settings', dangerous: true },
] as const satisfies readonly SettingsNavigationItem<UserSettingsSection>[];
