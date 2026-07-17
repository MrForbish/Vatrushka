import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PublicUser, SecurityEvent } from '@vatrushka/shared';

import { SecurityCenter, type SecurityClient } from './SecurityCenter';

const user: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };

function client(): SecurityClient {
  return {
    requestPasswordSetup: vi.fn(async () => ({ retryAfterSeconds: 60 })),
    setPassword: vi.fn(async () => user),
    beginTwoFactorSetup: vi.fn(async () => ({ secret: 'ABCDEFGHIJKLMNOP', otpauthUri: 'otpauth://totp/test' })),
    enableTwoFactor: vi.fn(async () => ({ user, recoveryCodes: ['AAAA-BBBB-CCCC'] })),
    disableTwoFactor: vi.fn(async () => ({ ...user, twoFactorEnabled: false })),
    regenerateRecoveryCodes: vi.fn(async () => ({ recoveryCodes: ['ABCD-EFGH-JKLM', 'NPQR-STUV-WXYZ'] })),
    listSessions: vi.fn(async () => [
      { id: '11111111-1111-4111-8111-111111111111', deviceName: 'Ватрушка · win32 Desktop', current: true, trusted: true, createdAt: '2026-07-15T10:00:00.000Z', lastUsedAt: '2026-07-17T10:00:00.000Z', expiresAt: '2026-08-15T10:00:00.000Z' },
      { id: '22222222-2222-4222-8222-222222222222', deviceName: 'Рабочий ноутбук', current: false, trusted: false, createdAt: '2026-07-10T10:00:00.000Z', lastUsedAt: '2026-07-16T10:00:00.000Z', expiresAt: '2026-08-10T10:00:00.000Z' },
    ]),
    setSessionTrusted: vi.fn(async () => undefined),
    revokeSession: vi.fn(async () => ({ current: false })),
    revokeOtherSessions: vi.fn(async () => ({ revokedCount: 1 })),
    listSecurityEvents: vi.fn(async (): Promise<SecurityEvent[]> => [{ id: 'event-1', type: 'SESSION_CREATED', deviceName: 'Ватрушка · win32 Desktop', createdAt: '2026-07-17T10:00:00.000Z' }]),
  };
}

describe('SecurityCenter', () => {
  it('lists sessions, changes trust, and revokes another device with confirmation', async () => {
    const mock = client();
    render(<SecurityCenter client={mock} onClose={vi.fn()} onCurrentSessionRevoked={vi.fn()} onSettingsChange={vi.fn()} onUserChange={vi.fn()} open settings={{ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true }} user={user} />);
    await waitFor(() => expect(mock.listSessions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Сессии' }));
    expect(await screen.findByText('Рабочий ноутбук')).toBeInTheDocument();
    const trustButtons = screen.getAllByRole('button', { name: 'Доверять' });
    await userEvent.click(trustButtons[0]!);
    expect(mock.setSessionTrusted).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', true);
    await userEvent.click(screen.getAllByRole('button', { name: 'Завершить' })[1]!);
    expect(screen.getByRole('heading', { name: 'Завершить сессию?' })).toBeInTheDocument();
    const confirmation = screen.getByRole('heading', { name: 'Завершить сессию?' }).closest<HTMLElement>('[role="dialog"]');
    await userEvent.click(within(confirmation!).getByRole('button', { name: 'Завершить' }));
    expect(mock.revokeSession).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('regenerates recovery codes only after a TOTP confirmation', async () => {
    const mock = client();
    render(<SecurityCenter client={mock} onClose={vi.fn()} onCurrentSessionRevoked={vi.fn()} onSettingsChange={vi.fn()} onUserChange={vi.fn()} open settings={{ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true }} user={user} />);
    await userEvent.click(screen.getByRole('button', { name: 'Резервные коды' }));
    await userEvent.click(screen.getByRole('button', { name: 'Создать новый набор' }));
    await userEvent.type(screen.getByLabelText('Код из приложения'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Обновить коды' }));
    expect(mock.regenerateRecoveryCodes).toHaveBeenCalledWith('123456');
    expect(await screen.findByText('ABCD-EFGH-JKLM')).toBeInTheDocument();
  });

  it('shows the security activity feed', async () => {
    const mock = client();
    render(<SecurityCenter client={mock} onClose={vi.fn()} onCurrentSessionRevoked={vi.fn()} onSettingsChange={vi.fn()} onUserChange={vi.fn()} open settings={{ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true }} user={user} />);
    await waitFor(() => expect(mock.listSecurityEvents).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Активность' }));
    expect(screen.getByText('Вход в аккаунт')).toBeInTheDocument();
    expect(screen.getByText(/Ватрушка · win32 Desktop/u)).toBeInTheDocument();
  });

  it('updates desktop and sound notification preferences independently', async () => {
    const onSettingsChange = vi.fn();
    render(<SecurityCenter client={client()} onClose={vi.fn()} onCurrentSessionRevoked={vi.fn()} onSettingsChange={onSettingsChange} onUserChange={vi.fn()} open settings={{ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true }} user={user} />);

    const notificationTab = document.querySelectorAll<HTMLButtonElement>('.security-center__tabs button')[1];
    expect(notificationTab).toBeDefined();
    await userEvent.click(notificationTab!);
    const switches = screen.getAllByRole('switch');
    await userEvent.click(switches[0]!);
    await userEvent.click(switches[1]!);

    expect(onSettingsChange).toHaveBeenNthCalledWith(1, { desktopNotificationsEnabled: false, messageSoundsEnabled: true });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, { desktopNotificationsEnabled: true, messageSoundsEnabled: false });
  });
});
