import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import type { PublicUser, SecurityEvent } from '@vatrushka/shared';

import { SecurityCenter, type SecurityClient } from './SecurityCenter';

const user: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };
const client: SecurityClient = {
  requestPasswordSetup: fn(() => Promise.resolve({ retryAfterSeconds: 60 })),
  setPassword: fn(() => Promise.resolve(user)),
  beginTwoFactorSetup: fn(() => Promise.resolve({ secret: 'ABCDEFGHIJKLMNOP', otpauthUri: 'otpauth://totp/Vatrushka' })),
  enableTwoFactor: fn(() => Promise.resolve({ user, recoveryCodes: ['ABCD-EFGH-JKLM'] })),
  disableTwoFactor: fn(() => Promise.resolve({ ...user, twoFactorEnabled: false })),
  regenerateRecoveryCodes: fn(() => Promise.resolve({ recoveryCodes: ['ABCD-EFGH-JKLM', 'NPQR-STUV-WXYZ'] })),
  listSessions: fn(() => Promise.resolve([
    { id: '11111111-1111-4111-8111-111111111111', deviceName: 'Ватрушка · Windows Desktop', current: true, trusted: true, createdAt: '2026-07-15T10:00:00.000Z', lastUsedAt: '2026-07-17T10:00:00.000Z', expiresAt: '2026-08-15T10:00:00.000Z' },
    { id: '22222222-2222-4222-8222-222222222222', deviceName: 'Рабочий ноутбук', current: false, trusted: false, createdAt: '2026-07-10T10:00:00.000Z', lastUsedAt: '2026-07-16T10:00:00.000Z', expiresAt: '2026-08-10T10:00:00.000Z' },
  ])),
  setSessionTrusted: fn(() => Promise.resolve()),
  revokeSession: fn(() => Promise.resolve({ current: false })),
  revokeOtherSessions: fn(() => Promise.resolve({ revokedCount: 1 })),
  listSecurityEvents: fn(() => Promise.resolve<SecurityEvent[]>([
    { id: 'event-1', type: 'SESSION_CREATED', deviceName: 'Ватрушка · Windows Desktop', createdAt: '2026-07-17T10:00:00.000Z' },
    { id: 'event-2', type: 'TWO_FACTOR_ENABLED', deviceName: null, createdAt: '2026-07-16T09:30:00.000Z' },
    { id: 'event-3', type: 'REFRESH_TOKEN_REUSE_DETECTED', deviceName: 'Старый ноутбук', createdAt: '2026-07-15T08:10:00.000Z' },
  ])),
};

const meta = {
  title: 'Features/Security Center',
  component: SecurityCenter,
  parameters: { layout: 'fullscreen' },
  args: { client, onClose: fn(), onCurrentSessionRevoked: fn(), onUserChange: fn(), open: true, user },
} satisfies Meta<typeof SecurityCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Protection: Story = {};

export const Sessions: Story = {
  play: async () => {
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Сессии' }));
    await expect(screen.getByText('Рабочий ноутбук')).toBeInTheDocument();
  },
};

export const Activity: Story = {
  play: async () => {
    await waitFor(() => expect(client.listSecurityEvents).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Активность' }));
    await expect(screen.getByText('Подозрительная активность')).toBeInTheDocument();
  },
};
