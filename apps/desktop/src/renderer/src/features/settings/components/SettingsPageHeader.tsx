import { Button, Icon } from '../../../ui';

export interface SettingsPageHeaderProps {
  entityName: string;
  sectionLabel: string;
  onBack(): void;
}

export function SettingsPageHeader({ entityName, onBack, sectionLabel }: SettingsPageHeaderProps): React.JSX.Element {
  return (
    <div className="vui-settings-page-header">
      <span className="vui-settings-page-header__crumb"><Icon name="settings" size={18} /><span><small>{entityName}</small><strong>{sectionLabel}</strong></span></span>
      <Button icon="logout" onClick={onBack} size="sm" type="button" variant="quiet">Вернуться</Button>
    </div>
  );
}
