import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PublicUser } from '@vatrushka/shared';

import { UserAudioSettingsPage } from './UserAudioSettingsPage';
import { UserProfileSettingsPage } from './UserProfileSettingsPage';
import { UserPresenceSettingsPage } from './UserPresenceSettingsPage';
import { UserPrivacySettingsPage } from './UserPrivacySettingsPage';

const user: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { deviceId, groupId: 'group-1', kind, label, toJSON: () => ({}) };
}

describe('routed user settings pages', () => {
  it('validates and saves the supported display name field', async () => {
    const onDirtyChange = vi.fn();
    const updatedUser = { ...user, displayName: 'Илья Форбиш' };
    const onSave = vi.fn(async () => updatedUser);
    const onUserChange = vi.fn();
    render(<UserProfileSettingsPage onDirtyChange={onDirtyChange} onSave={onSave} onUserChange={onUserChange} user={user} />);

    const input = screen.getByLabelText('Отображаемое имя');
    await userEvent.clear(input);
    await userEvent.type(input, 'Илья Форбиш');
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Илья Форбиш'));
    expect(onUserChange).toHaveBeenCalledWith(updatedUser);
    expect(screen.getByText('Изменения сохранены')).toBeInTheDocument();
  });

  it('does not send an invalid display name', async () => {
    const onSave = vi.fn(async () => user);
    render(<UserProfileSettingsPage onDirtyChange={vi.fn()} onSave={onSave} onUserChange={vi.fn()} user={user} />);

    const input = screen.getByLabelText('Отображаемое имя');
    await userEvent.clear(input);
    await userEvent.type(input, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/минимум 2/u)).toBeInTheDocument();
  });

  it('renders real device labels and persists selected device identifiers', async () => {
    const onMicrophone = vi.fn();
    const onOutput = vi.fn();
    render(<UserAudioSettingsPage busy={false} devices={{ inputs: [device('audioinput', 'default', 'Default - Studio Mic'), device('audioinput', 'mic-2', 'USB Microphone')], outputs: [device('audiooutput', 'default', 'Default - Headphones'), device('audiooutput', 'speaker-2', 'Monitor Speakers')] }} inputLevel={0.3} microphoneId="default" onMicrophone={onMicrophone} onOutput={onOutput} onRefresh={vi.fn()} onTestOutput={vi.fn()} outputId="default" voiceConnected />);

    expect(screen.getByText('Системное · Studio Mic')).toBeInTheDocument();
    expect(screen.getByText('Системное · Headphones')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Системное · Studio Mic'));
    await userEvent.click(screen.getByRole('option', { name: 'USB Microphone' }));
    await userEvent.click(screen.getByText('Системное · Headphones'));
    await userEvent.click(screen.getByRole('option', { name: 'Monitor Speakers' }));

    expect(onMicrophone).toHaveBeenCalledWith('mic-2');
    expect(onOutput).toHaveBeenCalledWith('speaker-2');
  });

  it('loads and saves DND as a server-side presence preference', async () => {
    const initial = { preference: 'online' as const, effectiveStatus: 'online' as const, customText: null, customTextExpiresAt: null, updatedAt: '2026-07-17T10:00:00.000Z' };
    const updated = { ...initial, preference: 'do_not_disturb' as const, effectiveStatus: 'dnd' as const };
    const onSave = vi.fn(async () => updated);
    const onPresenceChange = vi.fn();
    render(<UserPresenceSettingsPage onDirtyChange={vi.fn()} onLoad={vi.fn(async () => initial)} onPresenceChange={onPresenceChange} onSave={onSave} presence={initial} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Не беспокоить/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ preference: 'do_not_disturb', customText: null, customTextExpiresAt: null }));
    expect(onPresenceChange).toHaveBeenLastCalledWith(updated);
  });

  it('persists privacy controls instead of only hiding local UI', async () => {
    const initial = { directMessages: 'shared_servers' as const, presenceVisibility: 'shared_servers' as const, activityVisible: true, updatedAt: '2026-07-17T10:00:00.000Z' };
    const updated = { directMessages: 'nobody' as const, presenceVisibility: 'nobody' as const, activityVisible: false, updatedAt: '2026-07-17T10:01:00.000Z' };
    const onSave = vi.fn(async () => updated);
    render(<UserPrivacySettingsPage onDirtyChange={vi.fn()} onLoad={vi.fn(async () => initial)} onSave={onSave} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Кто может писать вам' }));
    await userEvent.click(screen.getByRole('option', { name: 'Никто' }));
    await userEvent.click(screen.getByRole('button', { name: 'Кто видит ваш online-статус' }));
    await userEvent.click(screen.getByRole('option', { name: 'Никто' }));
    await userEvent.click(screen.getByRole('switch', { name: /Показывать активность/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ directMessages: 'nobody', presenceVisibility: 'nobody', activityVisible: false }));
  });
});
