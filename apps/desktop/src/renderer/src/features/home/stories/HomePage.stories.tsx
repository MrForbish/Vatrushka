import type { GamingHomeVoiceSpace, HomeDashboardResponse } from "@vatrushka/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { HomePage } from "../pages/HomePage";

const microphone = {
  deviceId: "microphone-studio",
  groupId: "input",
  kind: "audioinput",
  label: "HyperX QuadCast S",
  toJSON: () => ({}),
} as MediaDeviceInfo;
const headset = {
  deviceId: "headset-usb",
  groupId: "output",
  kind: "audiooutput",
  label: "Arctis Nova 7",
  toJSON: () => ({}),
} as MediaDeviceInfo;
const user = {
  id: "owner",
  email: "owner@myvatrushka.ru",
  displayName: "Илья Форбиш",
  platformRole: "owner" as const,
  hasPassword: true,
  twoFactorEnabled: true,
};
const servers = [
  { id: "server-1", name: "Команда разработки", inviteUrl: "https://myvatrushka.ru/i/development", ownerUserId: "owner", memberCount: 8, createdAt: "2026-07-17T10:00:00.000Z" },
  { id: "server-2", name: "Друзья и игры", inviteUrl: "https://myvatrushka.ru/i/friends", ownerUserId: "friend", memberCount: 14, createdAt: "2026-07-16T10:00:00.000Z" },
];
const voiceSpaces: GamingHomeVoiceSpace[] = [
  {
    channelId: "voice-1",
    serverId: "server-1",
    serverName: "Команда разработки",
    serverIconUrl: null,
    serverAccentColor: "#7c5cff",
    channelName: "Вечерний рейд",
    gameName: "Destiny 2",
    coverUrl: null,
    participantCount: 5,
    participantLimit: 10,
    friendCount: 3,
    participantAvatars: [],
    hasScreenShare: true,
    hasFreeSlots: true,
    canJoin: true,
    lastActivityAt: "2026-07-17T12:00:00.000Z",
  },
  {
    channelId: "voice-2",
    serverId: "server-2",
    serverName: "Друзья и игры",
    serverIconUrl: null,
    serverAccentColor: "#24c8db",
    channelName: "Лобби",
    gameName: "Counter-Strike 2",
    coverUrl: null,
    participantCount: 3,
    participantLimit: null,
    friendCount: 2,
    participantAvatars: [],
    hasScreenShare: false,
    hasFreeSlots: true,
    canJoin: true,
    lastActivityAt: "2026-07-17T11:55:00.000Z",
  },
];

const dashboard: HomeDashboardResponse = {
  user: {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: null,
    presence: "online",
    platformBadge: "FOUNDER_DEVELOPER",
  },
  readiness: { connection: "healthy", audioSetupRequired: false },
  servers: servers.map((server) => ({ ...server, iconUrl: null, accentColor: null, unreadCount: 0, activeVoiceCount: 1 })),
  continueItems: [],
  activeSpaces: [],
  recentActivity: [],
  onboarding: { visible: false, steps: [] },
  gaming: {
    voiceStatus: {
      microphone: { available: true, enabled: true, label: microphone.label },
      output: { available: true, label: headset.label },
      pingMs: 34,
      connectionQuality: "excellent",
    },
    quickReturn: [
      { ...voiceSpaces[0]!, returnReason: "recently_left" },
      { ...voiceSpaces[1]!, returnReason: "friends_inside" },
    ],
    activeSpaces: [...voiceSpaces],
    friendsInGame: [
      { userId: "friend-1", displayName: "Анна", avatarUrl: null, presence: "online", gameName: "Destiny 2", gameDetails: "В рейде", voiceChannel: { channelId: "voice-1", serverId: "server-1", channelName: "Вечерний рейд", canJoin: true } },
      { userId: "friend-2", displayName: "Максим", avatarUrl: null, presence: "dnd", gameName: "Counter-Strike 2", gameDetails: "Соревновательный режим", voiceChannel: null },
      { userId: "friend-3", displayName: "Лена", avatarUrl: null, presence: "away", gameName: null, gameDetails: null, voiceChannel: { channelId: "voice-2", serverId: "server-2", channelName: "Лобби", canJoin: true } },
    ],
  },
};

const meta = {
  title: "Home/HomePage",
  component: HomePage,
  parameters: { layout: "fullscreen" },
  args: {
    user,
    version: "0.6.10",
    devices: { inputs: [microphone], outputs: [headset] },
    microphoneId: microphone.deviceId,
    outputId: headset.deviceId,
    busy: false,
    error: null,
    servers,
    serverName: "",
    directUnreadCount: 3,
    dashboard,
    onLogout: fn(),
    onSecurity: fn(),
    onAudioSettings: fn(),
    onServerName: fn(),
    onCreateServer: fn(),
    onOpenServer: fn(),
    onOpenDestination: fn(),
    onJoinVoice: fn(),
    onMessageFriend: fn(),
    onDirectMessages: fn(),
  },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReturningUser: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/войти по коду/iu)).not.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Быстрый возврат" })).toBeInTheDocument();
    await expect(canvas.getByText("Активные пространства", { exact: true })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Друзья в сети")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Вернуться в канал" }));
    await expect(args.onJoinVoice).toHaveBeenCalledWith("server-1", "voice-1");
    await userEvent.click(canvas.getByRole("button", { name: "Написать Анна" }));
    await expect(args.onMessageFriend).toHaveBeenCalledWith("friend-1");
  },
};

export const NewUser: Story = {
  args: {
    servers: [],
    dashboard: {
      ...dashboard,
      servers: [],
      gaming: { ...dashboard.gaming, quickReturn: [], activeSpaces: [], friendsInGame: [] },
    },
    devices: { inputs: [], outputs: [] },
    microphoneId: undefined,
    outputId: undefined,
    directUnreadCount: 0,
  },
};

export const Offline: Story = { args: { dashboardError: "Нет подключения к серверу.", error: null } };
export const PartialWidgetError: Story = { args: { error: "Не удалось обновить игровой центр." } };
export const CompactWidth: Story = { parameters: { viewport: { defaultViewport: "desktop" } } };
export const ProfileDrawerMode: Story = { parameters: { viewport: { defaultViewport: "desktop" } } };
