import {
  ConnectionQuality,
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteTrack,
  type RoomOptions,
} from 'livekit-client';

import type { LocalSettings, RoomConnection } from '@vatrushka/shared';

import type { ApiClient } from './api.js';

export interface ParticipantView {
  identity: string;
  displayName: string;
  isLocal: boolean;
  isOwner: boolean;
  isGuest: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  connectionQuality: string;
}

export interface MediaSnapshot {
  connectionState: ConnectionState;
  participants: ParticipantView[];
  isMuted: boolean;
  isScreenSharing: boolean;
  screenTrack: RemoteTrack | LocalTrack | null;
  screenSharerName: string | null;
  canPlayAudio: boolean;
  error: string | null;
}

const initialSnapshot: MediaSnapshot = {
  connectionState: ConnectionState.Disconnected,
  participants: [],
  isMuted: true,
  isScreenSharing: false,
  screenTrack: null,
  screenSharerName: null,
  canPlayAudio: true,
  error: null,
};

export class MediaSession {
  private room: Room | null = null;
  private connection: RoomConnection | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private snapshot: MediaSnapshot = initialSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly api: ApiClient) {}

  getSnapshot = (): MediaSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async connect(connection: RoomConnection, settings: LocalSettings): Promise<void> {
    await this.disconnect(false);
    this.connection = connection;
    const options: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(settings.microphoneDeviceId ? { deviceId: settings.microphoneDeviceId } : {}),
      },
      ...(settings.outputDeviceId ? { audioOutput: { deviceId: settings.outputDeviceId } } : {}),
      publishDefaults: {
        screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 30, priority: 'high' },
        simulcast: true,
      },
    };
    const room = new Room(options);
    this.room = room;
    this.registerEvents(room);
    this.patch({ connectionState: ConnectionState.Connecting, error: null });
    try {
      await room.connect(connection.livekitUrl, connection.livekitToken, { autoSubscribe: true });
      this.refreshSnapshot();
      try {
        await room.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(settings.microphoneDeviceId ? { deviceId: settings.microphoneDeviceId } : {}),
        });
      } catch (error) {
        this.patch({ error: deviceErrorMessage(error), isMuted: true });
      }
      this.refreshSnapshot();
    } catch (error) {
      await this.disconnect(false);
      throw new Error(error instanceof Error ? error.message : 'Не удалось подключиться к LiveKit', { cause: error });
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.refreshSnapshot();
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.room) return;
    const switched = await this.room.switchActiveDevice('audioinput', deviceId, true);
    if (!switched) throw new Error('Не удалось выбрать микрофон');
  }

  async switchOutput(deviceId: string): Promise<void> {
    if (!this.room) return;
    const switched = await this.room.switchActiveDevice('audiooutput', deviceId, true);
    if (!switched) throw new Error('Не удалось выбрать устройство вывода');
  }

  async startScreenShare(includeAudio: boolean): Promise<void> {
    if (!this.room || !this.connection) throw new Error('Комната не подключена');
    await this.room.localParticipant.setScreenShareEnabled(
      true,
      {
        audio: includeAudio,
        video: true,
        resolution: { width: 1920, height: 1080, frameRate: 30 },
        contentHint: 'detail',
        systemAudio: includeAudio ? 'include' : 'exclude',
      },
      { screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 30, priority: 'high' }, simulcast: true },
    );
    this.startHeartbeat();
    this.refreshSnapshot();
  }

  async stopScreenShare(release = true): Promise<void> {
    this.stopHeartbeat();
    const room = this.room;
    if (room?.localParticipant.isScreenShareEnabled) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch {
        // Continue with the server-side release even if unpublishing failed.
      }
    }
    if (release && this.connection) {
      try {
        await this.api.releaseScreenShare(this.connection);
      } catch {
        // The short lease expires automatically if release cannot reach the API.
      }
    }
    this.refreshSnapshot();
  }

  async startAudio(): Promise<void> {
    await this.room?.startAudio();
  }

  async disconnect(release = true): Promise<void> {
    this.stopHeartbeat();
    if (this.room) {
      if (this.room.localParticipant.isScreenShareEnabled) await this.stopScreenShare(release);
      try {
        await this.room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        // Tracks are also force-stopped by Room.disconnect(true).
      }
      await this.room.disconnect(true);
      this.room.removeAllListeners();
    }
    this.room = null;
    this.connection = null;
    this.snapshot.screenTrack?.detach().forEach((element) => element.remove());
    this.snapshot = initialSnapshot;
    this.emit();
  }

  private registerEvents(room: Room): void {
    const refresh = (): void => this.refreshSnapshot();
    room
      .on(RoomEvent.ConnectionStateChanged, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) void this.stopScreenShare();
        refresh();
      })
      .on(RoomEvent.TrackSubscribed, (track, publication) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.dataset.vatrushkaAudio = publication.trackSid;
          document.body.appendChild(element);
        }
        if (publication.source === Track.Source.ScreenShare && this.snapshot.screenTrack && this.snapshot.screenTrack !== track) {
          console.error('Multiple active screen-share video tracks detected');
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
        refresh();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
      .on(RoomEvent.MediaDevicesError, (error) => this.patch({ error: deviceErrorMessage(error) }))
      .on(RoomEvent.Disconnected, () => this.patch({ connectionState: ConnectionState.Disconnected }));
  }

  private refreshSnapshot(): void {
    const room = this.room;
    if (!room) return;
    const allParticipants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    const participants = allParticipants.map((participant) => ({
      identity: participant.identity,
      displayName: participant.name || 'Участник',
      isLocal: participant === room.localParticipant,
      isOwner: Boolean(this.connection && participant.identity.startsWith(`user_${this.connection.ownerUserId}_`)),
      isGuest: participant.identity.startsWith('guest_'),
      isMuted: !participant.isMicrophoneEnabled,
      isSpeaking: participant.isSpeaking,
      isScreenSharing: participant.isScreenShareEnabled,
      connectionQuality: connectionQualityLabel(participant.connectionQuality),
    }));

    const screenCandidates = allParticipants.flatMap((participant) =>
      [...participant.trackPublications.values()]
        .filter((publication) => publication.source === Track.Source.ScreenShare && publication.track)
        .map((publication) => ({ participant, track: publication.track as RemoteTrack | LocalTrack })),
    );
    if (screenCandidates.length > 1) console.error('Multiple active screen-share tracks detected; displaying the first');
    const firstScreen = screenCandidates[0];
    this.snapshot = {
      ...this.snapshot,
      connectionState: room.state,
      participants,
      isMuted: !room.localParticipant.isMicrophoneEnabled,
      isScreenSharing: room.localParticipant.isScreenShareEnabled,
      screenTrack: firstScreen?.track ?? null,
      screenSharerName: firstScreen?.participant.name || null,
      canPlayAudio: room.canPlaybackAudio,
    };
    this.emit();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      const connection = this.connection;
      if (!connection) return;
      void this.api.heartbeatScreenShare(connection).catch(() => {
        this.patch({ error: 'Право на демонстрацию потеряно — показ экрана остановлен' });
        void this.stopScreenShare(false);
      });
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private patch(update: Partial<MediaSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function connectionQualityLabel(quality: ConnectionQuality): string {
  if (quality === ConnectionQuality.Excellent) return 'Отличное';
  if (quality === ConnectionQuality.Good) return 'Хорошее';
  if (quality === ConnectionQuality.Poor) return 'Слабое';
  return 'Определяется';
}

function deviceErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Доступ к микрофону запрещён. Разрешите его в настройках Windows.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'Микрофон не найден';
  if (error instanceof DOMException && error.name === 'NotReadableError') return 'Микрофон используется другим приложением';
  return 'Не удалось включить микрофон';
}
