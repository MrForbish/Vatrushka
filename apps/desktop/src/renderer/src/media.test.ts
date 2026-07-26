import { describe, expect, it, vi } from "vitest";
import { ConnectionState, Track } from "livekit-client";

import type { RoomConnection } from "@vatrushka/shared";

import { ClientError, type ApiClient } from "./api";
import { MediaSession } from "./media";

interface DeviceSwitchRoom {
  switchActiveDevice(
    kind: "audioinput" | "audiooutput",
    deviceId: string,
    exact: boolean,
  ): Promise<boolean>;
}

function sessionWithRoom(room: DeviceSwitchRoom): MediaSession {
  const session = new MediaSession({} as ApiClient);
  (session as unknown as { room: DeviceSwitchRoom }).room = room;
  return session;
}

describe("MediaSession audio devices", () => {
  it("switches LiveKit input and output devices immediately", async () => {
    const switchActiveDevice = vi.fn().mockResolvedValue(true);
    const session = sessionWithRoom({ switchActiveDevice });

    await session.switchMicrophone("microphone-studio");
    await session.switchOutput("headphones-usb");

    expect(switchActiveDevice).toHaveBeenNthCalledWith(
      1,
      "audioinput",
      "microphone-studio",
      true,
    );
    expect(switchActiveDevice).toHaveBeenNthCalledWith(
      2,
      "audiooutput",
      "headphones-usb",
      true,
    );
  });

  it("does not silently accept a device rejected by LiveKit", async () => {
    const session = sessionWithRoom({
      switchActiveDevice: vi.fn().mockResolvedValue(false),
    });

    await expect(
      session.switchMicrophone("missing-microphone"),
    ).rejects.toThrow("Не удалось выбрать микрофон");
    await expect(session.switchOutput("missing-output")).rejects.toThrow(
      "Не удалось выбрать устройство вывода",
    );
  });

  it("keeps a microphone enabled when optional gain processing is unavailable", async () => {
    const session = new MediaSession({} as ApiClient);
    const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
    const setProcessor = vi.fn().mockRejectedValue(new Error("Audio context unavailable"));
    const internals = session as unknown as {
      room: {
        localParticipant: {
          setMicrophoneEnabled: typeof setMicrophoneEnabled;
          getTrackPublication(source: Track.Source): { track: { kind: Track.Kind; setProcessor: typeof setProcessor } } | undefined;
        };
      };
      microphoneGainProcessor: object;
      microphoneEnabledBeforeDeafen: boolean;
      refreshSnapshot(): void;
      syncOwnVoiceState(): Promise<void>;
    };
    internals.room = {
      localParticipant: {
        setMicrophoneEnabled,
        getTrackPublication: (source) =>
          source === Track.Source.Microphone
            ? { track: { kind: Track.Kind.Audio, setProcessor } }
            : undefined,
      },
    };
    internals.microphoneGainProcessor = {};
    vi.spyOn(internals, "refreshSnapshot").mockImplementation(() => undefined);
    vi.spyOn(internals, "syncOwnVoiceState").mockResolvedValue(undefined);

    await expect(session.setMuted(false)).resolves.toBeUndefined();

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ echoCancellation: true }),
    );
    expect(setProcessor).toHaveBeenCalledTimes(1);
  });
});

describe("MediaSession incoming audio", () => {
  function deafeningSession(): {
    session: MediaSession;
    setMicrophoneEnabled: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
  } {
    const session = new MediaSession({} as ApiClient);
    const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
    const localParticipant = {
      isMicrophoneEnabled: true,
      setMicrophoneEnabled: async (enabled: boolean): Promise<void> => {
        localParticipant.isMicrophoneEnabled = enabled;
        await setMicrophoneEnabled(enabled);
      },
    };
    const setVolume = vi.fn();
    const participant = { identity: "remote-1", setVolume };
    const internals = session as unknown as {
      room: {
        localParticipant: typeof localParticipant;
        remoteParticipants: Map<string, typeof participant>;
      };
      refreshSnapshot(): void;
    };
    internals.room = {
      localParticipant,
      remoteParticipants: new Map([[participant.identity, participant]]),
    };
    vi.spyOn(internals, "refreshSnapshot").mockImplementation(() => undefined);
    return { session, setMicrophoneEnabled, setVolume };
  }

  it("restores incoming audio when an explicit microphone enable exits deafen", async () => {
    const { session, setMicrophoneEnabled, setVolume } = deafeningSession();
    session.setParticipantVolume("remote-1", 0.4);
    session.setScreenShareAudioVolume(0.6);

    await session.setDeafened(true);
    session.setParticipantVolume("remote-1", 0.7);
    await session.setMuted(false);

    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(3);
    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(setVolume).toHaveBeenCalledWith(0, Track.Source.Microphone);
    expect(setVolume).toHaveBeenCalledWith(0.7, Track.Source.Microphone);
    expect(setVolume).toHaveBeenCalledWith(0, Track.Source.ScreenShareAudio);

    await session.setDeafened(false);

    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(3);
    expect(setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(setVolume).toHaveBeenCalledWith(0.7, Track.Source.Microphone);
    expect(setVolume).toHaveBeenCalledWith(0.6, Track.Source.ScreenShareAudio);
  });

  it("applies the selected output gain without overwriting participant gain", () => {
    const { session, setVolume } = deafeningSession();

    session.setParticipantVolume("remote-1", 0.8);
    session.setOutputVolume(0.5);

    expect(setVolume).toHaveBeenCalledWith(0.4, Track.Source.Microphone);
  });

  it("keeps the microphone muted after undeafening when it was muted before", async () => {
    const { session, setMicrophoneEnabled } = deafeningSession();

    await session.setMuted(true);
    await session.setDeafened(true);
    await session.setDeafened(false);

    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(2);
    expect(setMicrophoneEnabled).toHaveBeenNthCalledWith(1, false);
    expect(setMicrophoneEnabled).toHaveBeenNthCalledWith(2, false);
  });

  it("publishes the authenticated local mute state for the current voice session", async () => {
    const updateOwnVoiceState = vi.fn().mockResolvedValue(undefined);
    const session = new MediaSession({ updateOwnVoiceState } as unknown as ApiClient);
    const localParticipant = {
      isMicrophoneEnabled: true,
      isSpeaking: false,
      connectionQuality: 0,
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
        localParticipant.isMicrophoneEnabled = enabled;
      }),
    };
    const internals = session as unknown as {
      room: {
        localParticipant: typeof localParticipant;
        remoteParticipants: Map<string, never>;
      };
      connection: RoomConnection;
      refreshSnapshot(): void;
    };
    internals.room = {
      localParticipant,
      remoteParticipants: new Map<string, never>(),
    };
    internals.connection = {
      roomId: "channel-1",
      ownerUserId: "owner-1",
      livekitUrl: "ws://test",
      livekitToken: "token",
      participantIdentity: "user-1",
      participantDisplayName: "User",
      isOwner: false,
      contextType: "channel",
      serverId: "11111111-1111-4111-8111-111111111111",
      channelId: "22222222-2222-4222-8222-222222222222",
      voiceSessionId: "voice-session-1",
    };
    vi.spyOn(internals, "refreshSnapshot").mockImplementation(() => undefined);

    await session.setMuted(true);

    expect(updateOwnVoiceState).toHaveBeenCalledWith(
      internals.connection.channelId,
      expect.objectContaining({
        sessionId: "voice-session-1",
        muted: true,
        deafened: false,
        speaking: false,
      }),
    );
  });

  it("reattaches existing remote audio tracks after LiveKit reconnect", async () => {
    const session = new MediaSession({} as ApiClient);
    const audio = document.createElement("audio");
    const attach = vi.fn(() => audio);
    const detach = vi.fn(() => []);
    const setVolume = vi.fn();
    const track = { kind: Track.Kind.Audio, attach, detach };
    const publication = {
      trackSid: "TR_audio",
      source: Track.Source.Microphone,
      track,
    };
    const participant = {
      identity: "remote-1",
      setVolume,
      trackPublications: new Map([[publication.trackSid, publication]]),
    };
    const startAudio = vi.fn().mockResolvedValue(undefined);
    const internals = session as unknown as {
      room: {
        remoteParticipants: Map<string, typeof participant>;
        startAudio(): Promise<void>;
      };
      connection: RoomConnection;
      restoreIncomingAudio(reason: string): Promise<void>;
      refreshSnapshot(): void;
    };
    internals.room = {
      remoteParticipants: new Map([[participant.identity, participant]]),
      startAudio,
    };
    internals.connection = {
      roomId: "channel-1",
      ownerUserId: "owner-1",
      livekitUrl: "ws://test",
      livekitToken: "token",
      participantIdentity: "local",
      participantDisplayName: "Local",
      isOwner: true,
      contextType: "channel",
      serverId: "11111111-1111-4111-8111-111111111111",
      channelId: "22222222-2222-4222-8222-222222222222",
      voiceSessionId: "voice-session-1",
    };
    vi.spyOn(internals, "refreshSnapshot").mockImplementation(() => undefined);

    await internals.restoreIncomingAudio("reconnected");

    expect(detach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(startAudio).toHaveBeenCalledTimes(1);
    expect(audio.dataset.vatrushkaParticipant).toBe(participant.identity);
    expect(setVolume).toHaveBeenCalledWith(1, Track.Source.Microphone);
    audio.remove();
  });
});

describe("MediaSession connection latency", () => {
  it("uses the measured LiveKit signalling RTT", () => {
    const session = new MediaSession({} as ApiClient);
    const internals = session as unknown as {
      room: {
        state: ConnectionState;
        engine: { client: { rtt: number } };
      };
      sampleLatency(): void;
    };
    internals.room = {
      state: ConnectionState.Connected,
      engine: { client: { rtt: 42 } },
    };

    internals.sampleLatency();

    expect(session.getSnapshot().pingMs).toBe(42);
  });
});

describe("ClientError support identifiers", () => {
  it("shows a request ID only for server failures", () => {
    expect(
      new ClientError("INTERNAL_ERROR", "Внутренняя ошибка сервера", 500, null, "req-500")
        .message,
    ).toContain("код поддержки req-500");
    expect(
      new ClientError("SCREEN_SHARE_BUSY", "Занято", 409, null, "req-409")
        .message,
    ).toBe("Занято");
  });
});

describe("MediaSession screen share", () => {
  function screenShareSession(
    setScreenShareEnabled: (...args: unknown[]) => Promise<void>,
    restrictOwnAudio = true,
    api: ApiClient = {} as ApiClient,
  ): MediaSession {
    const session = new MediaSession(api);
    const internals = session as unknown as {
      room: {
        state: ConnectionState;
        localParticipant: {
          isScreenShareEnabled: boolean;
          setScreenShareEnabled: typeof setScreenShareEnabled;
          getTrackPublication(
            source: Track.Source,
          ):
            | {
                track: {
                  mediaStreamTrack: {
                    getSettings(): { restrictOwnAudio: boolean };
                  };
                };
              }
            | undefined;
        };
      };
      connection: RoomConnection;
      startHeartbeat(): void;
      refreshSnapshot(): void;
    };
    const localParticipant = {
      isScreenShareEnabled: false,
      setScreenShareEnabled: vi.fn(async (...args: unknown[]) => {
        await setScreenShareEnabled(...args);
        localParticipant.isScreenShareEnabled = args[0] === true;
      }),
      getTrackPublication: (source: Track.Source) =>
        source === Track.Source.ScreenShareAudio
          ? {
              track: {
                mediaStreamTrack: { getSettings: () => ({ restrictOwnAudio }) },
              },
            }
          : undefined,
    };
    internals.room = {
      state: ConnectionState.Connected,
      localParticipant,
    };
    internals.connection = {
      roomId: "channel-1",
      ownerUserId: "owner-1",
      livekitUrl: "ws://test",
      livekitToken: "token",
      participantIdentity: "local",
      participantDisplayName: "Local",
      isOwner: true,
      contextType: "channel",
      serverId: "server-1",
      channelId: "channel-1",
    };
    vi.spyOn(internals, "startHeartbeat").mockImplementation(() => undefined);
    vi.spyOn(internals, "refreshSnapshot").mockImplementation(() => undefined);
    return session;
  }

  it("requests system audio while excluding the app own audio", async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare(
      { width: 3840, height: 2160 },
      "1080p60",
      true,
    );

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        audio: expect.objectContaining({ restrictOwnAudio: true }),
        resolution: { width: 1920, height: 1080, frameRate: 60 },
        systemAudio: "include",
      }),
      expect.objectContaining({
        degradationPreference: "maintain-resolution",
        screenShareEncoding: expect.objectContaining({
          maxBitrate: 10_000_000,
          maxFramerate: 60,
        }),
      }),
    );
  });

  it("stops an unsafe audio share when Chromium did not exclude the app voices", async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled, false);

    await expect(session.startScreenShare({}, "1080p60", true)).rejects.toThrow(
      "Windows не смогла безопасно исключить голоса участников",
    );
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false);
  });

  it("turns the LiveKit publishing timeout into a reconnect instruction", async () => {
    const session = screenShareSession(
      vi
        .fn()
        .mockRejectedValue(
          new Error(
            "publishing rejected as engine not connected within timeout",
          ),
        ),
    );

    await expect(session.startScreenShare()).rejects.toThrow(
      "Дождитесь переподключения",
    );
  });

  it("reports a closed source instead of a generic publish failure", async () => {
    const session = screenShareSession(
      vi.fn().mockRejectedValue(new DOMException("gone", "NotFoundError")),
    );

    await expect(session.startScreenShare()).rejects.toThrow(
      "Выбранный экран или окно больше недоступны",
    );
  });

  it("publishes the optional 1440p preset at 60 FPS", async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare(
      { width: 3840, height: 2160 },
      "1440p60",
      true,
    );

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        resolution: { width: 2560, height: 1440, frameRate: 60 },
      }),
      expect.objectContaining({
        screenShareEncoding: expect.objectContaining({
          maxBitrate: 18_000_000,
          maxFramerate: 60,
        }),
      }),
    );
  });

  it("keeps sharing after a transient heartbeat failure", async () => {
    vi.useFakeTimers();
    const heartbeatScreenShare = vi
      .fn()
      .mockRejectedValue(
        new ClientError("LIVEKIT_UNAVAILABLE", "temporary", 503),
      );
    const session = screenShareSession(
      vi.fn().mockResolvedValue(undefined),
      true,
      { heartbeatScreenShare } as unknown as ApiClient,
    );
    await session.startScreenShare();
    const stop = vi.spyOn(session, "stopScreenShare").mockResolvedValue();
    const internals = session as unknown as {
      runHeartbeat(): Promise<void>;
      stopHeartbeat(): void;
      heartbeatLastSuccessAt: number;
    };
    internals.heartbeatLastSuccessAt = Date.now();

    await internals.runHeartbeat();

    expect(heartbeatScreenShare).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    internals.stopHeartbeat();
    vi.useRealTimers();
  });

  it("stops sharing when the server confirms that ownership was lost", async () => {
    vi.useFakeTimers();
    const heartbeatScreenShare = vi
      .fn()
      .mockRejectedValue(
        new ClientError("SCREEN_SHARE_BUSY", "ownership lost", 409),
      );
    const session = screenShareSession(
      vi.fn().mockResolvedValue(undefined),
      true,
      { heartbeatScreenShare } as unknown as ApiClient,
    );
    await session.startScreenShare();
    const stop = vi.spyOn(session, "stopScreenShare").mockResolvedValue();
    const internals = session as unknown as {
      runHeartbeat(): Promise<void>;
      stopHeartbeat(): void;
      heartbeatLastSuccessAt: number;
    };
    internals.heartbeatLastSuccessAt = Date.now();

    await internals.runHeartbeat();

    expect(stop).toHaveBeenCalledWith(false);
    internals.stopHeartbeat();
    vi.useRealTimers();
  });

  it("ignores a late heartbeat failure from a stopped share", async () => {
    vi.useFakeTimers();
    let rejectHeartbeat: ((reason: unknown) => void) | undefined;
    const heartbeatScreenShare = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectHeartbeat = reject;
        }),
    );
    const session = screenShareSession(
      vi.fn().mockResolvedValue(undefined),
      true,
      { heartbeatScreenShare } as unknown as ApiClient,
    );
    await session.startScreenShare();
    const stop = vi.spyOn(session, "stopScreenShare").mockResolvedValue();
    const internals = session as unknown as {
      runHeartbeat(): Promise<void>;
      stopHeartbeat(): void;
    };

    const heartbeat = internals.runHeartbeat();
    internals.stopHeartbeat();
    rejectHeartbeat?.(new ClientError("LIVEKIT_UNAVAILABLE", "late", 503));
    await heartbeat;

    expect(stop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
