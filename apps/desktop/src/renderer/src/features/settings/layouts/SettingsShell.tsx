import type { ReactNode } from 'react';

import { AppShell } from '../../../ui';
import { SettingsNavigation } from '../components/SettingsNavigation';
import { SettingsPageHeader } from '../components/SettingsPageHeader';
import type { SettingsNavigationItem } from '../model/settings.types';
import './settings-shell.css';

export interface SettingsShellProps<TSection extends string> {
  activeSection: TSection;
  children: ReactNode;
  entityLabel: string;
  entityName: string;
  entityAvatarUrl?: string | null;
  entityBannerUrl?: string | null;
  items: readonly SettingsNavigationItem<TSection>[];
  onBack(): void;
  onSelect(section: TSection): void;
  workspaceLibrary: ReactNode;
}

export function SettingsShell<TSection extends string>({ activeSection, children, entityAvatarUrl, entityBannerUrl, entityLabel, entityName, items, onBack, onSelect, workspaceLibrary }: SettingsShellProps<TSection>): React.JSX.Element {
  const activeItem = items.find((item) => item.section === activeSection) ?? items[0];
  if (activeItem === undefined) throw new Error('SettingsShell requires at least one navigation item');
  return (
    <AppShell
      serverContext={<SettingsNavigation activeSection={activeSection} {...(entityAvatarUrl === undefined ? {} : { entityAvatarUrl })} {...(entityBannerUrl === undefined ? {} : { entityBannerUrl })} entityLabel={entityLabel} entityName={entityName} items={items} onSelect={onSelect} />}
      topBar={<SettingsPageHeader entityName={entityName} onBack={onBack} sectionLabel={activeItem.label} />}
      variant="settings"
      workspaceLibrary={workspaceLibrary}
    >
      <div className="vui-settings-shell__viewport"><div className="vui-settings-shell__content">{children}</div></div>
    </AppShell>
  );
}
