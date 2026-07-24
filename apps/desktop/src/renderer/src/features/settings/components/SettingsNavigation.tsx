import { Avatar, Badge, Icon, StableImage } from '../../../ui';
import type { SettingsNavigationItem } from '../model/settings.types';

export interface SettingsNavigationProps<TSection extends string> {
  activeSection: TSection;
  entityLabel: string;
  entityName: string;
  entityAvatarUrl?: string | null;
  entityBannerUrl?: string | null;
  items: readonly SettingsNavigationItem<TSection>[];
  onSelect(section: TSection): void;
}

export function SettingsNavigation<TSection extends string>({ activeSection, entityAvatarUrl = null, entityBannerUrl = null, entityLabel, entityName, items, onSelect }: SettingsNavigationProps<TSection>): React.JSX.Element {
  return (
    <aside aria-label={`Настройки: ${entityName}`} className="vui-settings-navigation">
      <header className="vui-settings-navigation__identity" data-has-banner={entityBannerUrl !== null || undefined}>
        {entityBannerUrl === null ? null : <StableImage alt="" aria-hidden="true" className="vui-settings-navigation__cover" fallback={null} src={entityBannerUrl} />}
        <Avatar name={entityName} size="lg" src={entityAvatarUrl ?? undefined} />
        <div><small>{entityLabel}</small><strong>{entityName}</strong></div>
        <Badge>beta</Badge>
      </header>
      <nav aria-label="Разделы настроек" className="vui-settings-navigation__items">
        {items.map((item) => (
          <button
            aria-current={item.section === activeSection ? 'page' : undefined}
            data-active={item.section === activeSection || undefined}
            data-danger={item.dangerous || undefined}
            key={item.section}
            onClick={() => onSelect(item.section)}
            type="button"
          >
            <span><Icon name={item.icon} size={18} /></span>
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
