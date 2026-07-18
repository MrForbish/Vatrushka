import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerDetail, ServerOverviewSettings } from '@vatrushka/shared';

import { apiClient } from '../../../api';
import { ServerSettingsPage } from './ServerSettingsPage';

const server: ServerDetail = {
  id: 'server-1', name: 'Ватрушка', inviteUrl: 'https://myvatrushka.ru/i/legacy', ownerUserId: 'owner-1', memberCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
  channels: [{ id: 'channel-1', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0 }],
  roles: [], members: [{ userId: 'owner-1', displayName: 'Владелец', serverDisplayName: null, privateAlias: null, platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', roles: [] }],
  permissions: ['VIEW_SERVER', 'MANAGE_SERVER', 'MANAGE_INVITES'],
};
const overview: ServerOverviewSettings = {
  id: server.id, name: server.name, description: null, language: 'ru', timezone: 'Europe/Moscow', systemChannelId: 'channel-1', welcomeChannelId: null,
  defaultNotificationLevel: 'mentions', defaultVoiceInactivitySeconds: 300, ownerUserId: 'owner-1', ownerDisplayName: 'Владелец', version: 1, updatedAt: '2026-07-18T10:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

describe('server settings routes', () => {
  it('loads and persists overview with optimistic version', async () => {
    vi.spyOn(apiClient, 'getServerOverviewSettings').mockResolvedValue(overview);
    const update = vi.spyOn(apiClient, 'updateServerOverviewSettings').mockImplementation(async (_serverId, input) => ({ ...overview, ...input, version: 2 }));
    const onChanged = vi.fn(async () => undefined);
    render(<ServerSettingsPage onChanged={onChanged} onDeleted={vi.fn()} section="overview" server={server} />);

    const name = await screen.findByLabelText('Название');
    await userEvent.clear(name);
    await userEvent.type(name, 'Новая Ватрушка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(server.id, expect.objectContaining({ name: 'Новая Ватрушка', version: 1 })));
    expect(onChanged).toHaveBeenCalled();
  });

  it('creates invite links without rendering a manual code field', async () => {
    vi.spyOn(apiClient, 'listServerInvites').mockResolvedValue([]);
    const create = vi.spyOn(apiClient, 'createServerInvite').mockResolvedValue({ id: 'invite-1', createdByUserId: 'owner-1', createdByDisplayName: 'Владелец', destinationChannelId: null, tokenPreview: '…abc123', expiresAt: null, maxUses: null, useCount: 0, revokedAt: null, createdAt: '2026-07-18T10:00:00.000Z', inviteUrl: 'https://myvatrushka.ru/i/link-token' });
    render(<ServerSettingsPage onChanged={vi.fn(async () => undefined)} onDeleted={vi.fn()} section="invites" server={server} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Создать ссылку' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByText('https://myvatrushka.ru/i/link-token')).toBeInTheDocument();
    expect(screen.queryByLabelText(/код/u)).not.toBeInTheDocument();
  });

  it('confirms and persists administrator access in the active roles page', async () => {
    const roleServer: ServerDetail = {
      ...server,
      permissions: [...server.permissions, 'MANAGE_ROLES'],
      roles: [{ id: 'role-moderator', serverId: server.id, name: 'Модератор', color: '#d77b63', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER'] }],
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const update = vi.spyOn(apiClient, 'updateServerRole').mockResolvedValue(roleServer.roles[0]!);
    render(<ServerSettingsPage onChanged={vi.fn(async () => undefined)} onDeleted={vi.fn()} section="roles" server={roleServer} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Администратор/u }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('полный доступ'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить роль' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(server.id, 'role-moderator', expect.objectContaining({ permissions: expect.arrayContaining(['ADMINISTRATOR']) })));
  });
});
