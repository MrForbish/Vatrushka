import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PublicUser } from '@vatrushka/shared';

import { UserAudioSettingsPage } from './UserAudioSettingsPage';
import { UserAccountSettingsPage } from './UserAccountSettingsPage';
import { UserProfileSettingsPage } from './UserProfileSettingsPage';
import { UserPresenceSettingsPage } from './UserPresenceSettingsPage';
import { UserPrivacySettingsPage } from './UserPrivacySettingsPage';

const user: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };
const profile = { id: user.id, email: user.email, displayName: user.displayName!, username: 'ilya', bio: null, avatarUrl: null, usernameChangedAt: null, updatedAt: '2026-07-18T10:00:00.000Z' };

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { deviceId, groupId: 'group-1', kind, label, toJSON: () => ({}) };
}

describe('routed user settings pages', () => {
  it('opens avatar crop preview and leaves the current avatar unchanged on cancel', async () => {
    const onAvatar = vi.fn(async () => profile);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    render(<UserProfileSettingsPage onAvatar={onAvatar} onDirtyChange={vi.fn()} onLoad={vi.fn(async () => profile)} onResetAvatar={vi.fn(async () => profile)} onSave={vi.fn(async () => profile)} onUserChange={vi.fn()} user={user} />);

    const input = await screen.findByLabelText('Загрузить аватар: файл');
    await userEvent.upload(
      input,
      new File(['avatar'], 'portrait.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Выберите область аватара' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog', { name: 'Выберите область аватара' })).not.toBeInTheDocument();
    expect(onAvatar).not.toHaveBeenCalled();
  });

  it('validates and saves the supported display name field', async () => {
    const onDirtyChange = vi.fn();
    const updatedUser = { ...user, displayName: 'Илья Форбиш', avatarUrl: null };
    const updatedProfile = { ...profile, displayName: updatedUser.displayName };
    const onSave = vi.fn(async () => updatedProfile);
    const onUserChange = vi.fn();
    const onProfileMediaChange = vi.fn();
    render(<UserProfileSettingsPage onAvatar={vi.fn(async () => profile)} onDirtyChange={onDirtyChange} onLoad={vi.fn(async () => profile)} onProfileMediaChange={onProfileMediaChange} onResetAvatar={vi.fn(async () => profile)} onSave={onSave} onUserChange={onUserChange} user={user} />);

    const input = await screen.findByLabelText('Отображаемое имя');
    await userEvent.clear(input);
    await userEvent.type(input, 'Илья Форбиш');
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ displayName: 'Илья Форбиш', username: 'ilya', bio: null }));
    expect(onUserChange).toHaveBeenCalledWith(updatedUser);
    expect(onProfileMediaChange).toHaveBeenCalledWith(updatedProfile);
    expect(screen.getByText('Изменения сохранены')).toBeInTheDocument();
  });

  it('does not send an invalid display name', async () => {
    const onSave = vi.fn(async () => profile);
    render(<UserProfileSettingsPage onAvatar={vi.fn(async () => profile)} onDirtyChange={vi.fn()} onLoad={vi.fn(async () => profile)} onResetAvatar={vi.fn(async () => profile)} onSave={onSave} onUserChange={vi.fn()} user={user} />);

    const input = await screen.findByLabelText('Отображаемое имя');
    await userEvent.clear(input);
    await userEvent.type(input, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/минимум 2/u)).toBeInTheDocument();
  });

  it('renders real device labels and persists selected device identifiers', async () => {
    const onMicrophone = vi.fn();
    const onMicrophoneVolume = vi.fn();
    const onOutput = vi.fn();
    const onOutputVolume = vi.fn();
    const onAppSoundVolume = vi.fn();
    render(<UserAudioSettingsPage appSoundVolume={1} busy={false} devices={{ inputs: [device('audioinput', 'default', 'Default - Studio Mic'), device('audioinput', 'mic-2', 'USB Microphone')], outputs: [device('audiooutput', 'default', 'Default - Headphones'), device('audiooutput', 'speaker-2', 'Monitor Speakers')] }} inputLevel={0.3} microphoneId="default" microphoneVolume={1} onAppSoundVolume={onAppSoundVolume} onMicrophone={onMicrophone} onMicrophoneVolume={onMicrophoneVolume} onOutput={onOutput} onOutputVolume={onOutputVolume} onRefresh={vi.fn()} onTestOutput={vi.fn()} outputId="default" outputVolume={1} voiceConnected />);

    expect(screen.getByText('Системное · Studio Mic')).toBeInTheDocument();
    expect(screen.getByText('Системное · Headphones')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Системное · Studio Mic'));
    await userEvent.click(screen.getByRole('option', { name: 'USB Microphone' }));
    await userEvent.click(screen.getByText('Системное · Headphones'));
    await userEvent.click(screen.getByRole('option', { name: 'Monitor Speakers' }));

    expect(onMicrophone).toHaveBeenCalledWith('mic-2');
    expect(onOutput).toHaveBeenCalledWith('speaker-2');
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость микрофона' }), { target: { value: '55' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость вывода' }), { target: { value: '65' } });
    expect(onMicrophoneVolume).toHaveBeenCalledWith(0.55);
    expect(onOutputVolume).toHaveBeenCalledWith(0.65);
    await userEvent.click(screen.getByRole('slider', { name: 'Громкость уведомлений' }));
    expect(screen.getByText(/Системный toast остаётся без отдельного звука/u)).toBeInTheDocument();
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
    render(<UserPrivacySettingsPage onDirtyChange={vi.fn()} onLoad={vi.fn(async () => initial)} onLoadBlocked={vi.fn(async () => [])} onSave={onSave} onUnblock={vi.fn(async () => undefined)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Кто может писать вам' }));
    await userEvent.click(screen.getByRole('option', { name: 'Никто' }));
    await userEvent.click(screen.getByRole('button', { name: 'Кто видит ваш online-статус' }));
    await userEvent.click(screen.getByRole('option', { name: 'Никто' }));
    await userEvent.click(screen.getByRole('switch', { name: /Показывать активность/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ directMessages: 'nobody', presenceVisibility: 'nobody', activityVisible: false }));
  });

  it('renders and removes server-side blocked users', async () => {
    const initial = { directMessages: 'shared_servers' as const, presenceVisibility: 'shared_servers' as const, activityVisible: true, updatedAt: '2026-07-17T10:00:00.000Z' };
    const onUnblock = vi.fn(async () => undefined);
    render(<UserPrivacySettingsPage onDirtyChange={vi.fn()} onLoad={vi.fn(async () => initial)} onLoadBlocked={vi.fn(async () => [{ userId: 'blocked-1', displayName: 'Заблокированный', username: 'blocked', blockedAt: '2026-07-18T10:00:00.000Z' }])} onSave={vi.fn(async () => initial)} onUnblock={onUnblock} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Разблокировать' }));
    await waitFor(() => expect(onUnblock).toHaveBeenCalledWith('blocked-1'));
    expect(screen.queryByText('Заблокированный')).not.toBeInTheDocument();
  });

  it('requires reauthentication before scheduling account deletion', async () => {
    const account = { email: user.email, emailVerified: true, pendingEmail: null, deactivationScheduledAt: null, deletionAt: null, ownsServers: false };
    const scheduled = { ...account, deactivationScheduledAt: '2026-07-18T10:00:00.000Z', deletionAt: '2026-08-01T10:00:00.000Z' };
    const onDeactivate = vi.fn(async () => scheduled);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UserAccountSettingsPage onCancelDeactivation={vi.fn(async () => account)} onConfirmEmail={vi.fn(async () => user)} onDeactivate={onDeactivate} onExport={vi.fn(async () => ({}))} onLoad={vi.fn(async () => account)} onLogout={vi.fn()} onRequestEmail={vi.fn(async () => ({ status: 'CODE_SENT' }))} onUserChange={vi.fn()} user={user} />);
    const password = await screen.findByLabelText('Пароль');
    await userEvent.type(password, 'correct-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Запланировать удаление' }));
    await waitFor(() => expect(onDeactivate).toHaveBeenCalledWith({ password: 'correct-password-1', totpCode: null }));
    expect((await screen.findAllByText('Удаление запланировано')).length).toBeGreaterThan(0);
  });
});
