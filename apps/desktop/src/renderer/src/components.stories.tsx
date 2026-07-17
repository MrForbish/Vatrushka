import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AuthPanel, HomePanel } from './components';
import './styles.css';

const microphone = { deviceId: 'microphone-studio', groupId: 'input-group', kind: 'audioinput', label: 'Studio Microphone', toJSON: () => ({}) } as MediaDeviceInfo;
const headset = { deviceId: 'headphones-usb', groupId: 'output-group', kind: 'audiooutput', label: 'USB Headphones', toJSON: () => ({}) } as MediaDeviceInfo;

const meta = {
  title: 'Screens/Current',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const PasswordLogin: Story = {
  render: () => <AuthPanel mode="password" stage="credentials" factor="email" totpAvailable email="owner@myvatrushka.ru" code="" password="secure-vatrushka-42" passwordConfirmation="" retrySeconds={0} busy={false} error={null} onMode={fn()} onEmailChange={fn()} onCodeChange={fn()} onPasswordChange={fn()} onPasswordConfirmationChange={fn()} onRequest={fn()} onVerify={fn()} onFactor={fn()} onBack={fn()} />,
};

export const ServerHome: Story = {
  render: () => <HomePanel
    user={{ id: 'owner', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }}
    version="0.4.0"
    devices={{ inputs: [microphone], outputs: [headset] }}
    microphoneId="microphone-studio"
    outputId="headphones-usb"
    busy={false}
    error={null}
    servers={[
      { id: 'server-1', name: 'Команда разработки', inviteUrl: 'https://myvatrushka.ru/i/ABCD2345test', ownerUserId: 'owner', memberCount: 8, createdAt: '2026-07-17T00:00:00.000Z' },
      { id: 'server-2', name: 'Друзья', inviteUrl: 'https://myvatrushka.ru/i/FGHJ6789test', ownerUserId: 'friend', memberCount: 14, createdAt: '2026-07-17T00:00:00.000Z' },
    ]}
    serverName=""
    directUnreadCount={3}
    onLogout={fn()}
    onSecurity={fn()}
    onMicrophone={fn()}
    onOutput={fn()}
    onRefreshDevices={fn()}
    onServerName={fn()}
    onCreateServer={fn()}
    onOpenServer={fn()}
    onDirectMessages={fn()}
  />,
};
