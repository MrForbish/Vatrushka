import { ConnectionState } from "livekit-client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import type { RoomConnection, ServerDetail } from "@vatrushka/shared";

import type { MediaSnapshot } from "../../media";
import { RoomView, VoiceConnectionPanel } from "../voice/RoomView";
import { ServerView } from "./ServerView";

const connection: RoomConnection = {
  roomId: "voice-1",
  ownerUserId: "owner",
  livekitUrl: "wss://livekit.myvatrushka.ru",
  livekitToken: "storybook",
  participantIdentity: "owner-local",
  participantDisplayName: "Илья Форбиш",
  isOwner: true,
  contextType: "channel",
  serverId: "server-1",
  channelId: "voice-1",
  canSpeak: true,
  canStream: true,
  canStreamApplicationAudio: true,
};

const snapshot: MediaSnapshot = {
  connectionState: ConnectionState.Connected,
  pingMs: 28,
  participants: [
    {
      identity: "owner-local",
      displayName: "Илья Форбиш",
      isLocal: true,
      isOwner: true,
      isMuted: false,
      isSpeaking: false,
      audioLevel: 0.08,
      isScreenSharing: false,
      volume: 1,
      locallyMuted: false,
      platformRole: "owner",
      connectionQuality: "Отличное",
    },
    {
      identity: "anna-remote",
      displayName: "Анна Белова",
      isLocal: false,
      isOwner: false,
      isMuted: false,
      isSpeaking: true,
      audioLevel: 0.78,
      isScreenSharing: false,
      volume: 1,
      locallyMuted: false,
      platformRole: "member",
      connectionQuality: "Отличное",
    },
    {
      identity: "max-remote",
      displayName: "Максим Орлов",
      isLocal: false,
      isOwner: false,
      isMuted: true,
      isSpeaking: false,
      audioLevel: 0,
      isScreenSharing: false,
      volume: 0.8,
      locallyMuted: false,
      platformRole: "member",
      connectionQuality: "Хорошее",
    },
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
};

const microphone = {
  deviceId: "microphone-studio",
  groupId: "input-group",
  kind: "audioinput",
  label: "HyperX QuadCast S",
  toJSON: () => ({}),
} as MediaDeviceInfo;
const headset = {
  deviceId: "headphones-usb",
  groupId: "output-group",
  kind: "audiooutput",
  label: "Headphones (Arctis Nova 7)",
  toJSON: () => ({}),
} as MediaDeviceInfo;

const server: ServerDetail = {
  id: "server-1",
  name: "Команда разработки",
  description: "Проектируем, проверяем и выпускаем новые версии Ватрушки.",
  inviteUrl: "https://myvatrushka.ru/i/ABCD2345test",
  ownerUserId: "owner",
  memberCount: 3,
  createdAt: "2026-07-17T00:00:00.000Z",
  permissions: [
    "VIEW_SERVER",
    "VIEW_CHANNEL",
    "READ_MESSAGE_HISTORY",
    "SEND_MESSAGES",
    "SEND_ATTACHMENTS",
    "ADD_REACTIONS",
    "MANAGE_OWN_MESSAGES",
    "CONNECT_VOICE",
    "SPEAK",
    "STREAM_SCREEN",
    "STREAM_APPLICATION_AUDIO",
    "MANAGE_CHANNELS",
    "MANAGE_ROLES",
  ],
  channels: [
    {
      id: "text-1",
      serverId: "server-1",
      name: "общий",
      type: "text",
      position: 0,
      unreadCount: 2,
    },
    {
      id: "text-2",
      serverId: "server-1",
      name: "разработка",
      type: "text",
      position: 1,
      unreadCount: 0,
    },
    {
      id: "voice-1",
      serverId: "server-1",
      name: "Голосовой",
      type: "voice",
      position: 2,
      unreadCount: 0,
    },
    {
      id: "voice-2",
      serverId: "server-1",
      name: "Переговорная",
      type: "voice",
      position: 3,
      unreadCount: 0,
    },
  ],
  roles: [
    {
      id: "everyone",
      serverId: "server-1",
      name: "@everyone",
      color: "#8d7a72",
      position: 0,
      isDefault: true,
      permissions: ["VIEW_SERVER", "VIEW_CHANNEL"],
    },
  ],
  members: [
    {
      userId: "owner",
      displayName: "Илья Форбиш",
      serverDisplayName: null,
      privateAlias: null,
      platformRole: "owner",
      joinedAt: "2026-07-17T00:00:00.000Z",
      roles: [],
    },
    {
      userId: "anna",
      displayName: "Анна Белова",
      serverDisplayName: null,
      privateAlias: null,
      platformRole: "member",
      joinedAt: "2026-07-17T00:00:00.000Z",
      roles: [],
    },
    {
      userId: "max",
      displayName: "Максим Орлов",
      serverDisplayName: null,
      privateAlias: null,
      platformRole: "member",
      joinedAt: "2026-07-17T00:00:00.000Z",
      roles: [],
    },
  ],
};

const voiceStage = (
  <RoomView
    connection={connection}
    snapshot={snapshot}
    devices={{ inputs: [microphone], outputs: [headset] }}
    microphoneId="microphone-studio"
    outputId="headphones-usb"
    busy={false}
    error={null}
    onMute={fn()}
    onDeafen={fn()}
    onShare={fn()}
    onCopy={fn()}
    onLeave={fn()}
    onKick={fn()}
    onMicrophone={fn()}
    onOutput={fn()}
    onRefreshDevices={fn()}
    onStartAudio={fn()}
    onScreenAudioMute={fn()}
    onScreenAudioVolume={fn()}
    onParticipantMute={fn()}
    onParticipantVolume={fn()}
  />
);
const voiceConnectionPanel = (
  <VoiceConnectionPanel
    canShare
    channelName="Голосовой"
    snapshot={snapshot}
    onOpen={fn()}
    onMute={fn()}
    onDeafen={fn()}
    onShare={fn()}
    onLeave={fn()}
  />
);

const meta = {
  title: "Screens/Server",
  component: ServerView,
  parameters: { layout: "fullscreen" },
  args: {
    user: {
      id: "owner",
      email: "owner@myvatrushka.ru",
      displayName: "Илья Форбиш",
      platformRole: "owner",
      hasPassword: true,
      twoFactorEnabled: true,
    },
    server,
    servers: [server],
    activeChannelId: "voice-1",
    connectedVoiceChannelId: "voice-1",
    connectedVoiceServerId: "server-1",
    voiceStage,
    voiceConnectionPanel,
    messages: [],
    messageDraft: "",
    serverName: "",
    busy: false,
    error: null,
    directUnreadCount: 3,
    onBack: fn(),
    onDirectMessages: fn(),
    onSwitchServer: fn(),
    onChannel: fn(),
    onMessageDraft: fn(),
    onSendMessage: fn(),
    onUpdateMessage: fn(),
    onMessageReaction: fn(),
    onDeleteMessage: fn(),
    onDeleteAttachment: fn(),
    onDownloadAttachment: fn(),
    onConnectVoice: fn(),
    onCopyInvite: fn(),
    onCreateChannel: fn(),
    onRenameChannel: fn(),
    onDeleteChannel: fn(),
    onKickMember: fn(),
    onServerName: fn(),
    onCreateServer: fn(),
    onSecurity: fn(),
    onServerSettings: fn(),
    onLogout: fn(),
  },
} satisfies Meta<typeof ServerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectedVoice: Story = {};

export const InviteLink: Story = {
  args: {
    activeChannelId: "text-1",
    connectedVoiceChannelId: undefined,
    connectedVoiceServerId: undefined,
    voiceStage: undefined,
    voiceConnectionPanel: undefined,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Пригласить на сервер",
      }),
    );
  },
};

export const RenameChannel: Story = {
  args: { activeChannelId: "text-1" },
  play: async ({ canvasElement, args }) => {
    await fireEvent.contextMenu(
      within(canvasElement).getByRole("button", { name: /^общий/u }),
    );
    await userEvent.click(
      within(document.body).getByRole("menuitem", { name: "Переименовать" }),
    );
    const input = within(document.body).getByLabelText("Название канала");
    await userEvent.clear(input);
    await userEvent.type(input, "релизы");
    await userEvent.click(
      within(document.body).getByRole("button", { name: "Сохранить" }),
    );
    await expect(args.onRenameChannel).toHaveBeenCalledWith("text-1", "релизы");
  },
};
