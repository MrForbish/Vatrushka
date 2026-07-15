import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type CreateOptions,
} from 'livekit-server-sdk';

import type { AppConfig } from '../config.js';
import type { MediaRoomOptions, MediaService, MediaTokenOptions } from '../ports.js';

export class LiveKitMediaService implements MediaService {
  private readonly rooms: RoomServiceClient;

  constructor(private readonly config: AppConfig) {
    this.rooms = new RoomServiceClient(config.LIVEKIT_HTTP_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  async createRoom(options: MediaRoomOptions): Promise<void> {
    const roomOptions: CreateOptions = {
      name: options.name,
      maxParticipants: options.maxParticipants,
      emptyTimeout: 10 * 60,
      departureTimeout: 60,
      metadata: JSON.stringify({ appRoomId: options.id, ownerUserId: options.ownerUserId }),
    };
    await this.rooms.createRoom(roomOptions);
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.rooms.deleteRoom(roomName);
    } catch (error) {
      if (!(error instanceof Error) || !/not found/iu.test(error.message)) throw error;
    }
  }

  async participantCount(roomName: string): Promise<number> {
    try {
      return (await this.rooms.listParticipants(roomName)).length;
    } catch (error) {
      if (error instanceof Error && /not found/iu.test(error.message)) return 0;
      throw error;
    }
  }

  async participantExists(roomName: string, identity: string): Promise<boolean> {
    return (await this.rooms.listParticipants(roomName)).some((participant) => participant.identity === identity);
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    await this.rooms.removeParticipant(roomName, identity);
  }

  async issueToken(options: MediaTokenOptions): Promise<string> {
    const token = new AccessToken(this.config.LIVEKIT_API_KEY, this.config.LIVEKIT_API_SECRET, {
      identity: options.identity,
      name: options.displayName,
      metadata: JSON.stringify(options.metadata),
      ttl: '10m',
    });
    token.addGrant({
      room: options.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return token.toJwt();
  }

  async healthCheck(): Promise<void> {
    await this.rooms.listRooms();
  }
}
