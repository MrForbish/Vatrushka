import {
  ConnectionQuality,
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RoomOptions,
} from "livekit-client";

import type {
  DesktopSourceInfo,
  LocalSettings,
  PlatformRole,
  RoomConnection,
} from "@vatrushka/shared";
import { SCREEN_SHARE_HEARTBEAT_SECONDS } from "@vatrushka/shared";

import { ClientError, type ApiClient } from "./api.js";

export interface ParticipantView {
  identity: string;
  displayName: string;
  isLocal: boolean;
  isOwner: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  isScreenSharing: boolean;
  volume: number;
  locallyMuted: boolean;
  platformRole: PlatformRole;
  connectionQuality: string;
}

export interface MediaSnapshot {
  connectionState: ConnectionState;
  participants: ParticipantView[];
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  screenTrack: RemoteTrack | LocalTrack | null;
  screenSharerName: string | null;
  screenShareIsLocal: boolean;
  hasScreenShareAudio: boolean;
  screenShareAudioMuted: boolean;
  screenShareAudioVolume: number;
  canPlayAudio: boolean;
  error: string | null;
}

const initialSnapshot: MediaSnapshot = {
  connectionState: ConnectionState.Disconnected,
  participants: [],
  isMuted: true,
  isDeafened: false,
  isScreenSharing: false,
  screenTrack: null,
  screenSharerName: null,
  screenShareIsLocal: false,
  hasScreenShareAudio: false,
  screenShareAudioMuted: false,
  screenShareAudioVolume: 1,
  canPlayAudio: true,
  error: null,
};

export type ScreenShareQuality = "1080p60" | "1440p60";
const defaultScreenShareEncoding = {
  maxBitrate: 10_000_000,
  maxFramerate: 60,
  priority: "high" as const,
};
const publishingReadyTimeoutMs = 20_000;
const screenShareHeartbeatIntervalMs = SCREEN_SHARE_HEARTBEAT_SECONDS * 1_000;
const screenShareHeartbeatRetryMs = 2_500;
const screenShareHeartbeatGraceMs = 25_000;

class UserFacingMediaError extends Error {}

export class MediaSession {
  private room: Room | null = null;
  private connection: RoomConnection | null = null;
  private heartbeat: ReturnType<typeof setTimeout> | null = null;
  private heartbeatLastSuccessAt = 0;
  private heartbeatFailureCount = 0;
  private heartbeatGeneration = 0;
  private heartbeatInFlightGeneration: number | null = null;
  private snapshot: MediaSnapshot = initialSnapshot;
  private screenShareAudioVolume = 1;
  private screenShareAudioMuted = false;
  private isDeafened = false;
  private stoppingScreenShare = false;
  private screenShareTransition: Promise<void> = Promise.resolve();
  private readonly participantVolumes = new Map<string, number>();
  private readonly locallyMutedParticipants = new Set<string>();
  private readonly audioElements = new Map<string, HTMLMediaElement>();
  private readonly listeners = new Set<() => void>();
  private readonly terminationListeners = new Set<(reason: unknown) => void>();

  constructor(private readonly api: ApiClient) {}

  getSnapshot = (): MediaSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeTerminated = (listener: (reason: unknown) => void): (() => void) => {
    this.terminationListeners.add(listener);
    return () => this.terminationListeners.delete(listener);
  };

  async connect(
    connection: RoomConnection,
    settings: LocalSettings,
  ): Promise<void> {
    await this.disconnect(false);
    this.connection = connection;
    this.isDeafened = false;
    this.screenShareAudioVolume = settings.volume;
    this.screenShareAudioMuted = false;
    const options: RoomOptions = {
      adaptiveStream: false,
      dynacast: false,
      disconnectOnPageLeave: true,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(settings.microphoneDeviceId
          ? { deviceId: settings.microphoneDeviceId }
          : {}),
      },
      ...(settings.outputDeviceId
        ? { audioOutput: { deviceId: settings.outputDeviceId } }
        : {}),
      publishDefaults: {
        screenShareEncoding: defaultScreenShareEncoding,
        simulcast: false,
      },
    };
    const room = new Room(options);
    this.room = room;
    this.registerEvents(room);
    this.patch({ connectionState: ConnectionState.Connecting, error: null });
    try {
      await room.connect(connection.livekitUrl, connection.livekitToken, {
        autoSubscribe: true,
      });
      this.refreshSnapshot();
      try {
        if (connection.canSpeak === false) {
          this.refreshSnapshot();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(settings.microphoneDeviceId
            ? { deviceId: settings.microphoneDeviceId }
            : {}),
        });
      } catch (error) {
        this.patch({ error: deviceErrorMessage(error), isMuted: true });
      }
      this.refreshSnapshot();
    } catch (error) {
      await this.disconnect(false);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Не удалось подключиться к LiveKit",
        { cause: error },
      );
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    if (this.isDeafened && !muted) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.refreshSnapshot();
  }

  async setDeafened(deafened: boolean): Promise<void> {
    if (!this.room) return;
    if (deafened) await this.room.localParticipant.setMicrophoneEnabled(false);
    this.isDeafened = deafened;
    for (const participant of this.room.remoteParticipants.values())
      this.applyParticipantAudioPreferences(participant);
    this.applyScreenShareAudioPreferences();
    this.refreshSnapshot();
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.room) return;
    const switched = await this.room.switchActiveDevice(
      "audioinput",
      deviceId,
      true,
    );
    if (!switched) throw new Error("Не удалось выбрать микрофон");
  }

  async switchOutput(deviceId: string): Promise<void> {
    if (!this.room) return;
    const switched = await this.room.switchActiveDevice(
      "audiooutput",
      deviceId,
      true,
    );
    if (!switched) throw new Error("Не удалось выбрать устройство вывода");
  }

  setParticipantVolume(identity: string, volume: number): void {
    const participant = this.room?.remoteParticipants.get(identity);
    if (!participant) return;
    const normalized = Math.max(0, Math.min(1, volume));
    this.participantVolumes.set(identity, normalized);
    if (normalized > 0) this.locallyMutedParticipants.delete(identity);
    participant.setVolume(
      this.isDeafened ? 0 : normalized,
      Track.Source.Microphone,
    );
    this.refreshSnapshot();
  }

  setParticipantMuted(identity: string, muted: boolean): void {
    const participant = this.room?.remoteParticipants.get(identity);
    if (!participant) return;
    if (muted) this.locallyMutedParticipants.add(identity);
    else this.locallyMutedParticipants.delete(identity);
    participant.setVolume(
      this.isDeafened || muted
        ? 0
        : (this.participantVolumes.get(identity) ?? 1),
      Track.Source.Microphone,
    );
    this.refreshSnapshot();
  }

  setScreenShareAudioVolume(volume: number): void {
    this.screenShareAudioVolume = Math.max(0, Math.min(1, volume));
    if (this.screenShareAudioVolume > 0) this.screenShareAudioMuted = false;
    this.applyScreenShareAudioPreferences();
    this.patch({
      screenShareAudioVolume: this.screenShareAudioVolume,
      screenShareAudioMuted: this.screenShareAudioMuted,
    });
  }

  setScreenShareAudioMuted(muted: boolean): void {
    this.screenShareAudioMuted = muted;
    this.applyScreenShareAudioPreferences();
    this.patch({ screenShareAudioMuted: muted });
  }

  async waitForPublishingReady(
    timeoutMs = publishingReadyTimeoutMs,
  ): Promise<void> {
    const room = this.room;
    if (!room || !this.connection)
      throw new UserFacingMediaError("Голосовой канал не подключён");
    if (room.state === ConnectionState.Connected) return;
    if (room.state === ConnectionState.Disconnected) {
      throw new UserFacingMediaError(
        "Соединение с голосовым сервером потеряно. Переподключитесь к каналу и повторите попытку.",
      );
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        window.clearTimeout(timeout);
        room.off(RoomEvent.ConnectionStateChanged, onStateChanged);
        room.off(RoomEvent.Disconnected, onDisconnected);
      };
      const finish = (): void => {
        cleanup();
        resolve();
      };
      const fail = (): void => {
        cleanup();
        reject(
          new UserFacingMediaError(
            "Связь с голосовым сервером ещё восстанавливается. Дождитесь статуса «Голосовая связь активна» и повторите показ.",
          ),
        );
      };
      const onStateChanged = (state: ConnectionState): void => {
        if (state === ConnectionState.Connected) finish();
        else if (state === ConnectionState.Disconnected) fail();
      };
      const onDisconnected = (): void => fail();
      const timeout = window.setTimeout(fail, timeoutMs);
      room.on(RoomEvent.ConnectionStateChanged, onStateChanged);
      room.on(RoomEvent.Disconnected, onDisconnected);
      onStateChanged(room.state);
    });
  }

  async startScreenShare(
    source: Pick<DesktopSourceInfo, "width" | "height"> = {},
    quality: ScreenShareQuality = "1080p60",
    includeAudio = false,
  ): Promise<void> {
    const operation = this.screenShareTransition.then(() =>
      this.startScreenShareInternal(source, quality, includeAudio),
    );
    this.screenShareTransition = operation.catch(() => undefined);
    return operation;
  }

  private async startScreenShareInternal(
    source: Pick<DesktopSourceInfo, "width" | "height">,
    quality: ScreenShareQuality,
    includeAudio: boolean,
  ): Promise<void> {
    if (!this.room || !this.connection)
      throw new Error("Комната не подключена");
    await this.waitForPublishingReady();
    if (this.room.localParticipant.isScreenShareEnabled)
      await this.stopScreenShareInternal(true);
    this.stoppingScreenShare = false;
    const resolution = screenShareResolution(source, quality);
    const encoding =
      quality === "1440p60"
        ? {
            maxBitrate: 18_000_000,
            maxFramerate: 60,
            priority: "high" as const,
          }
        : defaultScreenShareEncoding;
    try {
      await this.room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: includeAudio
            ? {
                // getDisplayMedia treats this boolean as an ideal constraint.
                // Using `{ exact: true }` can reject an otherwise valid Windows
                // loopback stream with OverconstrainedError.
                restrictOwnAudio: true,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : false,
          video: true,
          resolution,
          contentHint: "detail",
          systemAudio: includeAudio ? "include" : "exclude",
        },
        {
          degradationPreference: "maintain-resolution",
          screenShareEncoding: encoding,
          simulcast: false,
        },
      );
      if (includeAudio && !this.isOwnAudioRestricted()) {
        await this.stopScreenShareInternal(false);
        throw new UserFacingMediaError(
          "Windows не смогла безопасно исключить голоса участников из звука демонстрации. Показ остановлен, чтобы не создавать эхо.",
        );
      }
    } catch (error) {
      throw new Error(screenShareErrorMessage(error), { cause: error });
    }
    this.startHeartbeat();
    this.refreshSnapshot();
  }

  async stopScreenShare(release = true): Promise<void> {
    const operation = this.screenShareTransition.then(() =>
      this.stopScreenShareInternal(release),
    );
    this.screenShareTransition = operation.catch(() => undefined);
    return operation;
  }

  private async stopScreenShareInternal(release: boolean): Promise<void> {
    this.stopHeartbeat();
    const room = this.room;
    if (room?.localParticipant.isScreenShareEnabled) {
      this.stoppingScreenShare = true;
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch {
        // Continue with the server-side release even if unpublishing failed.
      } finally {
        this.stoppingScreenShare = false;
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
      if (this.room.localParticipant.isScreenShareEnabled)
        await this.stopScreenShare(release);
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
    this.isDeafened = false;
    this.participantVolumes.clear();
    this.locallyMutedParticipants.clear();
    this.removeRemoteAudioElements();
    this.snapshot.screenTrack?.detach().forEach((element) => element.remove());
    this.snapshot = initialSnapshot;
    this.emit();
  }

  private registerEvents(room: Room): void {
    const refresh = (): void => this.refreshSnapshot();
    room
      .on(RoomEvent.ConnectionStateChanged, refresh)
      .on(RoomEvent.Reconnecting, () => {
        this.reportDiagnostic("voice_reconnecting");
        refresh();
      })
      .on(RoomEvent.Reconnected, () => {
        this.reportDiagnostic("voice_reconnected");
        void this.restoreIncomingAudio("reconnected");
        refresh();
      })
      .on(RoomEvent.Moved, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.participantVolumes.delete(participant.identity);
        this.locallyMutedParticipants.delete(participant.identity);
        for (const [trackSid, element] of this.audioElements) {
          if (element.dataset.vatrushkaParticipant !== participant.identity)
            continue;
          element.remove();
          this.audioElements.delete(trackSid);
        }
        refresh();
      })
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          if (this.stoppingScreenShare) this.stoppingScreenShare = false;
          else {
            this.patch({
              error: "Источник демонстрации закрыт — показ экрана остановлен",
            });
            void this.stopScreenShare();
          }
        }
        refresh();
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          this.attachRemoteAudioTrack(track, publication, participant);
        }
        if (
          publication.source === Track.Source.ScreenShare &&
          this.snapshot.screenTrack &&
          this.snapshot.screenTrack !== track
        ) {
          console.error("Multiple active screen-share video tracks detected");
        }
        if (publication.source === Track.Source.ScreenShare) {
          publication.setVideoQuality(VideoQuality.HIGH);
          publication.setVideoFPS(60);
        }
        refresh();
      })
      .on(RoomEvent.TrackSubscriptionFailed, (trackSid) => {
        this.reportDiagnostic("voice_track_subscription_failed", {
          reason: trackSid ? "track_subscription_failed" : "unknown_track",
        });
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        track.detach().forEach((element) => element.remove());
        this.audioElements.delete(publication.trackSid);
        refresh();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
      .on(RoomEvent.MediaDevicesError, (error) =>
        this.patch({ error: deviceErrorMessage(error) }),
      )
      .on(RoomEvent.Disconnected, (reason) => {
        this.patch({ connectionState: ConnectionState.Disconnected });
        for (const listener of this.terminationListeners) listener(reason);
      });
  }

  private refreshSnapshot(): void {
    const room = this.room;
    if (!room) return;
    const allParticipants: Participant[] = [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ];
    const participants = allParticipants.map((participant) => ({
      identity: participant.identity,
      displayName: participant.name || "Участник",
      isLocal: participant === room.localParticipant,
      isOwner: Boolean(
        this.connection &&
        participant.identity.startsWith(`user_${this.connection.ownerUserId}_`),
      ),
      isMuted: !participant.isMicrophoneEnabled,
      isSpeaking: participant.isSpeaking,
      audioLevel: participant.audioLevel,
      isScreenSharing: participant.isScreenShareEnabled,
      volume:
        participant === room.localParticipant
          ? 1
          : (this.participantVolumes.get(participant.identity) ?? 1),
      locallyMuted:
        participant !== room.localParticipant &&
        this.locallyMutedParticipants.has(participant.identity),
      platformRole: participantPlatformRole(participant),
      connectionQuality: connectionQualityLabel(participant.connectionQuality),
    }));

    const screenCandidates = allParticipants.flatMap((participant) =>
      [...participant.trackPublications.values()]
        .filter(
          (publication) =>
            publication.source === Track.Source.ScreenShare &&
            publication.track,
        )
        .map((publication) => ({
          participant,
          track: publication.track as RemoteTrack | LocalTrack,
        })),
    );
    if (screenCandidates.length > 1)
      console.error(
        "Multiple active screen-share tracks detected; displaying the first",
      );
    const firstScreen = screenCandidates[0];
    const screenAudioPublication = firstScreen?.participant.getTrackPublication(
      Track.Source.ScreenShareAudio,
    );
    const screenShareIsLocal =
      firstScreen?.participant === room.localParticipant;
    this.snapshot = {
      ...this.snapshot,
      connectionState: room.state,
      participants,
      isMuted: !room.localParticipant.isMicrophoneEnabled,
      isDeafened: this.isDeafened,
      isScreenSharing: room.localParticipant.isScreenShareEnabled,
      screenTrack: firstScreen?.track ?? null,
      screenSharerName: firstScreen?.participant.name || null,
      screenShareIsLocal,
      hasScreenShareAudio: Boolean(
        !screenShareIsLocal && screenAudioPublication?.track,
      ),
      screenShareAudioMuted: this.screenShareAudioMuted,
      screenShareAudioVolume: this.screenShareAudioVolume,
      canPlayAudio: room.canPlaybackAudio,
    };
    this.emit();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatLastSuccessAt = Date.now();
    this.heartbeatFailureCount = 0;
    this.scheduleHeartbeat(
      screenShareHeartbeatIntervalMs,
      this.heartbeatGeneration,
    );
  }

  private scheduleHeartbeat(delayMs: number, generation: number): void {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(
      () => void this.runHeartbeat(generation),
      delayMs,
    );
  }

  private async runHeartbeat(
    generation = this.heartbeatGeneration,
  ): Promise<void> {
    const connection = this.connection;
    const room = this.room;
    if (
      generation !== this.heartbeatGeneration ||
      !connection ||
      !room?.localParticipant.isScreenShareEnabled ||
      this.heartbeatInFlightGeneration === generation
    )
      return;
    this.heartbeatInFlightGeneration = generation;
    try {
      await this.api.heartbeatScreenShare(connection);
      if (generation !== this.heartbeatGeneration) return;
      if (this.heartbeatFailureCount > 0)
        this.reportDiagnostic("screen_share_heartbeat_recovered", {
          attempt: this.heartbeatFailureCount + 1,
        });
      this.heartbeatLastSuccessAt = Date.now();
      this.heartbeatFailureCount = 0;
      this.scheduleHeartbeat(screenShareHeartbeatIntervalMs, generation);
    } catch (error) {
      if (generation !== this.heartbeatGeneration) return;
      this.heartbeatFailureCount += 1;
      const confirmedLoss = isConfirmedScreenShareLeaseLoss(error);
      const graceExpired =
        Date.now() - this.heartbeatLastSuccessAt >= screenShareHeartbeatGraceMs;
      this.reportDiagnostic(
        confirmedLoss
          ? "screen_share_lease_lost"
          : "screen_share_heartbeat_failed",
        {
          attempt: this.heartbeatFailureCount,
          reason: mediaFailureReason(error),
        },
      );
      if (confirmedLoss || graceExpired) {
        this.patch({
          error: confirmedLoss
            ? "Право на демонстрацию занято или отозвано — запустите показ повторно"
            : "Сервер не подтвердил демонстрацию после восстановления сети — запустите показ повторно",
        });
        void this.stopScreenShare(false);
      } else {
        this.scheduleHeartbeat(screenShareHeartbeatRetryMs, generation);
      }
    } finally {
      if (this.heartbeatInFlightGeneration === generation)
        this.heartbeatInFlightGeneration = null;
    }
  }

  private stopHeartbeat(): void {
    this.heartbeatGeneration += 1;
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = null;
    this.heartbeatInFlightGeneration = null;
    this.heartbeatFailureCount = 0;
  }

  private attachRemoteAudioTrack(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    forceReplace = false,
  ): void {
    const existing = this.audioElements.get(publication.trackSid);
    if (existing && !forceReplace && existing.isConnected) return;
    if (forceReplace) track.detach().forEach((element) => element.remove());
    existing?.remove();
    const element = track.attach();
    element.dataset.vatrushkaAudio = publication.trackSid;
    element.dataset.vatrushkaAudioSource = publication.source;
    element.dataset.vatrushkaParticipant = participant.identity;
    document.body.appendChild(element);
    this.audioElements.set(publication.trackSid, element);
    if (publication.source === Track.Source.ScreenShareAudio)
      this.applyScreenShareAudioPreferences();
    if (publication.source === Track.Source.Microphone)
      this.applyParticipantAudioPreferences(participant);
  }

  private async restoreIncomingAudio(reason: string): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          const track = publication.track;
          if (!track || track.kind !== Track.Kind.Audio) continue;
          this.attachRemoteAudioTrack(
            track,
            publication,
            participant,
            true,
          );
        }
      }
      await room.startAudio();
      this.reportDiagnostic("voice_audio_restored", { reason });
    } catch (error) {
      this.reportDiagnostic("voice_audio_restore_failed", {
        reason: mediaFailureReason(error),
      });
    } finally {
      this.refreshSnapshot();
    }
  }

  private removeRemoteAudioElements(): void {
    for (const element of this.audioElements.values()) element.remove();
    this.audioElements.clear();
  }

  private reportDiagnostic(
    event: Parameters<typeof window.desktop.logMediaDiagnostic>[0]["event"],
    details: { reason?: string; attempt?: number } = {},
  ): void {
    const connection = this.connection;
    if (!connection) return;
    void window.desktop
      .logMediaDiagnostic({
        event,
        occurredAt: new Date().toISOString(),
        serverId: connection.serverId,
        channelId: connection.channelId,
        ...(connection.voiceSessionId
          ? { voiceSessionId: connection.voiceSessionId }
          : {}),
        ...details,
      })
      .catch(() => undefined);
  }

  private applyScreenShareAudioPreferences(): void {
    const volume =
      this.isDeafened || this.screenShareAudioMuted
        ? 0
        : this.screenShareAudioVolume;
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      participant.setVolume(volume, Track.Source.ScreenShareAudio);
    }
  }

  private applyParticipantAudioPreferences(
    participant: RemoteParticipant,
  ): void {
    const muted =
      this.isDeafened ||
      this.locallyMutedParticipants.has(participant.identity);
    participant.setVolume(
      muted ? 0 : (this.participantVolumes.get(participant.identity) ?? 1),
      Track.Source.Microphone,
    );
  }

  private isOwnAudioRestricted(): boolean {
    const publication = this.room?.localParticipant.getTrackPublication(
      Track.Source.ScreenShareAudio,
    );
    const settings = publication?.track?.mediaStreamTrack.getSettings() as
      (MediaTrackSettings & { restrictOwnAudio?: boolean }) | undefined;
    return settings?.restrictOwnAudio === true;
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
  if (quality === ConnectionQuality.Excellent) return "Отличное";
  if (quality === ConnectionQuality.Good) return "Хорошее";
  if (quality === ConnectionQuality.Poor) return "Слабое";
  return "Определяется";
}

function participantPlatformRole(participant: Participant): PlatformRole {
  try {
    const value = JSON.parse(participant.metadata || "{}") as {
      platformRole?: unknown;
    };
    if (value.platformRole === "owner" || value.platformRole === "admin")
      return value.platformRole;
  } catch {
    // LiveKit metadata is untrusted and an invalid value has no visual privileges.
  }
  return "member";
}

function deviceErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Доступ к микрофону запрещён. Разрешите его в настройках Windows.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "Микрофон не найден";
  if (error instanceof DOMException && error.name === "NotReadableError")
    return "Микрофон используется другим приложением";
  return "Не удалось включить микрофон";
}

function isConfirmedScreenShareLeaseLoss(error: unknown): boolean {
  return (
    error instanceof ClientError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 409 ||
      error.code === "SCREEN_SHARE_BUSY" ||
      error.code === "PARTICIPANT_NOT_FOUND")
  );
}

function mediaFailureReason(error: unknown): string {
  if (error instanceof ClientError)
    return `${error.code.toLowerCase()}:${error.status}`.slice(0, 100);
  if (error instanceof DOMException) return error.name.slice(0, 100);
  if (error instanceof Error) return error.name.slice(0, 100);
  return "unknown";
}

function screenShareErrorMessage(error: unknown): string {
  if (error instanceof UserFacingMediaError) return error.message;
  if (
    error instanceof Error &&
    /publishing rejected as engine not connected within timeout/iu.test(
      error.message,
    )
  ) {
    return "Связь с голосовым сервером прервалась во время запуска демонстрации. Дождитесь переподключения и повторите попытку.";
  }
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Доступ к записи экрана запрещён. Разрешите его в настройках Windows.";
  if (error instanceof DOMException && error.name === "OverconstrainedError")
    return "Windows не смогла безопасно захватить звук без голосов участников. Демонстрация не запущена.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "Выбранный экран или окно больше недоступны";
  if (error instanceof DOMException && error.name === "NotReadableError")
    return "Не удалось прочитать выбранный экран или окно";
  if (error instanceof DOMException && error.name === "AbortError")
    return "Запуск демонстрации был отменён";
  return "Не удалось запустить демонстрацию экрана";
}

function screenShareResolution(
  source: Pick<DesktopSourceInfo, "width" | "height">,
  quality: ScreenShareQuality,
): { width: number; height: number; frameRate: number } {
  const sourceWidth = source.width ?? 2560;
  const sourceHeight = source.height ?? 1440;
  const maxWidth = quality === "1440p60" ? 2560 : 1920;
  const maxHeight = quality === "1440p60" ? 1440 : 1080;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(2, Math.round((sourceWidth * scale) / 2) * 2),
    height: Math.max(2, Math.round((sourceHeight * scale) / 2) * 2),
    frameRate: 60,
  };
}
