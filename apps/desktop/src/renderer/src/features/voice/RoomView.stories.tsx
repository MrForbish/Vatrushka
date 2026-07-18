import { ConnectionState, type LocalTrack } from 'livekit-client';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { RoomView } from './RoomView';

const microphone = { deviceId: 'microphone-studio', groupId: 'group-input', kind: 'audioinput', label: 'Studio Microphone', toJSON: () => ({}) } as MediaDeviceInfo;
const headset = { deviceId: 'headphones-usb', groupId: 'group-output', kind: 'audiooutput', label: 'USB Headphones', toJSON: () => ({}) } as MediaDeviceInfo;

const meta = {
  title: 'Features/Voice Room',
  component: RoomView,
  decorators: [(Story) => <div style={{ height: '100vh' }}><Story /></div>],
  parameters: { layout: 'fullscreen' },
  args: {
    connection: { roomId: 'channel-1', ownerUserId: 'founder', livekitUrl: 'wss://livekit.example', livekitToken: 'storybook', participantIdentity: 'user_founder_local', participantDisplayName: 'Илья Форбиш', isOwner: true, contextType: 'channel', serverId: 'server-1', channelId: 'channel-1' },
    snapshot: {
      connectionState: ConnectionState.Connected,
      participants: [
        { identity: 'user_founder_local', displayName: 'Илья Форбиш', isLocal: true, isOwner: true, isMuted: false, isSpeaking: false, audioLevel: 0.08, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'owner', connectionQuality: 'Отличное' },
        { identity: 'user_anna_remote', displayName: 'Анна Белова', isLocal: false, isOwner: false, isMuted: false, isSpeaking: true, audioLevel: 0.76, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'member', connectionQuality: 'Отличное' },
        { identity: 'user_max_remote', displayName: 'Максим Орлов', isLocal: false, isOwner: false, isMuted: true, isSpeaking: false, audioLevel: 0, isScreenSharing: false, volume: 0.8, locallyMuted: false, platformRole: 'member', connectionQuality: 'Хорошее' },
      ],
      isMuted: false,
      isScreenSharing: false,
      screenTrack: null,
      screenSharerName: null,
      screenShareIsLocal: false,
      hasScreenShareAudio: false,
      screenShareAudioMuted: false,
      screenShareAudioVolume: 1,
      canPlayAudio: true,
      error: null,
    },
    devices: { inputs: [microphone], outputs: [headset] },
    microphoneId: undefined,
    outputId: undefined,
    busy: false,
    error: null,
    onMute: fn(),
    onShare: fn(),
    onCopy: fn(),
    onLeave: fn(),
    onKick: fn(),
    onMicrophone: fn(),
    onOutput: fn(),
    onRefreshDevices: fn(),
    onStartAudio: fn(),
    onScreenAudioMute: fn(),
    onScreenAudioVolume: fn(),
    onParticipantMute: fn(),
    onParticipantVolume: fn(),
  },
} satisfies Meta<typeof RoomView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeviceSelection: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Устройства' }));
    await userEvent.click(canvas.getByLabelText('Устройство ввода'));
    await userEvent.click(canvas.getByRole('option', { name: 'Studio Microphone' }));
    await userEvent.click(canvas.getByLabelText('Устройство вывода'));
    await userEvent.click(canvas.getByRole('option', { name: 'USB Headphones' }));
    await expect(args.onMicrophone).toHaveBeenCalledWith('microphone-studio');
    await expect(args.onOutput).toHaveBeenCalledWith('headphones-usb');
    await userEvent.click(canvas.getByRole('button', { name: 'Обновить список аудиоустройств' }));
    await expect(args.onRefreshDevices).toHaveBeenCalledOnce();
  },
};

export const VisualRoom: Story = { args: { microphoneId: 'microphone-studio', outputId: 'headphones-usb' } };

const screenTrack = { attach: () => undefined, detach: () => [] } as unknown as LocalTrack;

export const ScreenShareViewer: Story = {
  args: {
    snapshot: {
      ...meta.args.snapshot,
      screenTrack,
      screenSharerName: 'Анна Белова',
      screenShareIsLocal: false,
      hasScreenShareAudio: true,
      screenShareAudioVolume: 0.72,
    },
  },
};
