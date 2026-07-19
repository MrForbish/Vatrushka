import type { AppConfig } from "../config.js";
import type { MediaService, MediaTokenOptions } from "../ports.js";

export interface MoveParticipantInput {
  sourceRoomName: string;
  destinationRoomName: string;
  participantIdentity: string;
  permissions: Pick<
    MediaTokenOptions,
    "canPublishMicrophone" | "canPublishScreen" | "canPublishScreenAudio"
  >;
}

export interface MoveDispatchResult {
  strategy: "livekit-cloud" | "controlled-reconnect";
  reconnectRequired: boolean;
}

export interface VoiceTransportParticipant {
  identity: string;
}

export interface VoiceTransportAdapter {
  moveParticipant(input: MoveParticipantInput): Promise<MoveDispatchResult>;
  removeParticipant(roomName: string, participantIdentity: string): Promise<void>;
  listParticipants(roomName: string): Promise<VoiceTransportParticipant[]>;
}

export class LiveKitCloudVoiceTransportAdapter
  implements VoiceTransportAdapter
{
  constructor(private readonly media: MediaService) {}

  async moveParticipant(
    input: MoveParticipantInput,
  ): Promise<MoveDispatchResult> {
    await this.media.moveParticipant(
      input.sourceRoomName,
      input.participantIdentity,
      input.destinationRoomName,
      input.permissions,
    );
    return { strategy: "livekit-cloud", reconnectRequired: false };
  }

  removeParticipant(
    roomName: string,
    participantIdentity: string,
  ): Promise<void> {
    return this.media.removeParticipant(roomName, participantIdentity);
  }

  async listParticipants(
    roomName: string,
  ): Promise<VoiceTransportParticipant[]> {
    return (await this.media.participantIdentities(roomName)).map((identity) => ({
      identity,
    }));
  }
}

export class ControlledReconnectVoiceTransportAdapter
  implements VoiceTransportAdapter
{
  constructor(private readonly media: MediaService) {}

  moveParticipant(input: MoveParticipantInput): Promise<MoveDispatchResult> {
    void input;
    return Promise.resolve({
      strategy: "controlled-reconnect",
      reconnectRequired: true,
    });
  }

  removeParticipant(
    roomName: string,
    participantIdentity: string,
  ): Promise<void> {
    return this.media.removeParticipant(roomName, participantIdentity);
  }

  async listParticipants(
    roomName: string,
  ): Promise<VoiceTransportParticipant[]> {
    return (await this.media.participantIdentities(roomName)).map((identity) => ({
      identity,
    }));
  }
}

export function createVoiceTransportAdapter(
  config: AppConfig,
  media: MediaService,
): VoiceTransportAdapter {
  return config.VOICE_MOVE_STRATEGY === "livekit-cloud"
    ? new LiveKitCloudVoiceTransportAdapter(media)
    : new ControlledReconnectVoiceTransportAdapter(media);
}
