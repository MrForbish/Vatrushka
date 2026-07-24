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
      pingMs: 31,
      participants: [
        { identity: 'user_founder_local', displayName: 'Илья Форбиш', isLocal: true, isOwner: true, isMuted: false, isSpeaking: false, audioLevel: 0.08, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'owner', connectionQuality: 'Отличное' },
        { identity: 'user_anna_remote', displayName: 'Анна Белова', isLocal: false, isOwner: false, isMuted: false, isSpeaking: true, audioLevel: 0.76, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'member', connectionQuality: 'Отличное' },
        { identity: 'user_max_remote', displayName: 'Максим Орлов', isLocal: false, isOwner: false, isMuted: true, isSpeaking: false, audioLevel: 0, isScreenSharing: false, volume: 0.8, locallyMuted: false, platformRole: 'member', connectionQuality: 'Хорошее' },
      ],
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      screenTrack: null,
      screenSharerName: null,
      screenShareIsLocal: false,
      hasScreenShareAudio: false,
      screenShareAudioMuted: false,
      screenShareAudioVolume: 1,
      screenAnnotations: [],
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
    onLeave: fn(),
    onKick: fn(),
    onMicrophone: fn(),
    onOutput: fn(),
    onStartAudio: fn(),
    onScreenAudioMute: fn(),
    onScreenAudioVolume: fn(),
    onScreenAnnotationStroke: fn(),
    onScreenAnnotationUndo: fn(),
    onScreenAnnotationClear: fn(),
    onParticipantMute: fn(),
    onParticipantVolume: fn(),
  },
} satisfies Meta<typeof RoomView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeviceSelection: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Выбрать устройство: Микрофон' }));
    await userEvent.click(page.getByRole('option', { name: 'Studio Microphone' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Выбрать устройство: Звук' }));
    await userEvent.click(page.getByRole('option', { name: 'USB Headphones' }));
    await expect(args.onMicrophone).toHaveBeenCalledWith('microphone-studio');
    await expect(args.onOutput).toHaveBeenCalledWith('headphones-usb');
  },
};

export const VisualRoom: Story = { args: { microphoneId: 'microphone-studio', outputId: 'headphones-usb' } };

export const SingleParticipant: Story = {
  args: {
    snapshot: {
      ...meta.args.snapshot,
      participants: [meta.args.snapshot.participants[0]!],
    },
  },
};

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

export const ScreenShareAnnotations: Story = {
  args: {
    snapshot: {
      ...meta.args.snapshot,
      isScreenSharing: true,
      screenTrack,
      screenSharerName: 'Илья Форбиш',
      screenShareIsLocal: true,
      screenAnnotations: [{ id: 'stroke-demo', color: '#facc15', size: 8, points: [{ x: 0.15, y: 0.65 }, { x: 0.35, y: 0.45 }, { x: 0.62, y: 0.58 }] }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Рисовать' }));
    await expect(canvas.getByRole('toolbar', { name: 'Рисование поверх демонстрации' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Очистить' })).toBeEnabled();
  },
};
