import type { IconName } from '../../../ui';

export interface SettingsNavigationItem<TSection extends string = string> {
  section: TSection;
  label: string;
  description: string;
  icon: IconName;
  dangerous?: boolean;
}

export type SettingsSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
