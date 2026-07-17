import { Badge, Icon } from '../../../ui';

export interface SettingsPlaceholderPageProps {
  description: string;
  scope: 'server' | 'user';
  title: string;
}

export function SettingsPlaceholderPage({ description, scope, title }: SettingsPlaceholderPageProps): React.JSX.Element {
  return (
    <section className="vui-settings-placeholder">
      <header><div><span>{scope === 'server' ? 'Настройки сервера' : 'Настройки профиля'}</span><h1>{title}</h1><p>{description}</p></div><Badge tone="primary">Каркас подключён</Badge></header>
      <div className="vui-settings-placeholder__notice"><Icon name="sparkles" size={22} /><div><strong>Раздел готов к вертикальной интеграции</strong><p>На этом этапе проверяются layout, URL-навигация, состояния и доступность. Поля появятся вместе с реальными API-контрактами — без заглушек, которые выглядят рабочими.</p></div></div>
      <div className="vui-settings-placeholder__grid">
        <article><span><Icon name="settings" size={20} /></span><div><strong>Единый shell</strong><p>Глобальная навигация остаётся на месте, а раздел меняется без потери текущего контекста.</p></div></article>
        <article><span><Icon name="lock" size={20} /></span><div><strong>Backend-first права</strong><p>Интерактивные controls будут подключены только после серверной проверки permissions.</p></div></article>
      </div>
    </section>
  );
}
