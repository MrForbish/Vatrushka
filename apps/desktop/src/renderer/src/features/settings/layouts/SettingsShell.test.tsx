import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceLibrary } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import { SettingsShell } from './SettingsShell';

const sections = [
  { section: 'profile', label: 'Мой профиль', description: 'Основные данные', icon: 'users' },
  { section: 'notifications', label: 'Уведомления', description: 'Звуки и баннеры', icon: 'bell' },
] as const;

function workspace(): React.JSX.Element {
  return <WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={[]} />;
}

describe('SettingsShell', () => {
  it('navigates between sections and returns without rendering a members toggle', async () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    render(<SettingsShell activeSection="profile" entityLabel="Личные настройки" entityName="Илья" globalSidebar={workspace()} items={sections} onBack={onBack} onSelect={onSelect}><h1>Мой профиль</h1></SettingsShell>);

    expect(screen.getByRole('button', { name: /Мой профиль/u })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Открыть участников' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
    expect(onSelect).toHaveBeenCalledWith('notifications');
    await userEvent.click(screen.getByRole('button', { name: 'Вернуться' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('exposes loading, conflict and dirty states accessibly', async () => {
    const onSave = vi.fn();
    render(<><SettingsPageState kind="loading" /><SettingsPageState kind="conflict" onAction={vi.fn()} /><SettingsSaveBar onCancel={vi.fn()} onSave={onSave} state="dirty" /></>);
    expect(screen.getByLabelText('Загрузка настроек')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Настройки изменились');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
