import { Badge, Icon } from '../../../ui';
import type { SettingsNavigationItem } from '../model/settings.types';

export interface SettingsNavigationProps<TSection extends string> {
  activeSection: TSection;
  entityLabel: string;
  entityName: string;
  items: readonly SettingsNavigationItem<TSection>[];
  onSelect(section: TSection): void;
}

export function SettingsNavigation<TSection extends string>({ activeSection, entityLabel, entityName, items, onSelect }: SettingsNavigationProps<TSection>): React.JSX.Element {
  return (
    <aside aria-label={`Настройки: ${entityName}`} className="vui-settings-navigation">
      <header className="vui-settings-navigation__identity">
        <span aria-hidden="true">{entityName.slice(0, 1).toUpperCase()}</span>
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
      <footer><Icon name="info" size={15} /><span>Разделы подключаются поэтапно. Работающие функции остаются доступны в прежних окнах.</span></footer>
    </aside>
  );
}
