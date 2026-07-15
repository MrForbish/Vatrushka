import type { Mailer, MediaRoomOptions, MediaService, MediaTokenOptions } from '../ports.js';

export class FakeMailer implements Mailer {
  readonly messages: Array<{ email: string; code: string }> = [];
  shouldFail = false;

  async sendOtp(email: string, code: string): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP unavailable');
    this.messages.push({ email, code });
  }
}

export class FakeMediaService implements MediaService {
  readonly rooms = new Map<string, Set<string>>();
  readonly tokens: MediaTokenOptions[] = [];
  available = true;

  async createRoom(options: MediaRoomOptions): Promise<void> {
    if (!this.available) throw new Error('LiveKit unavailable');
    this.rooms.set(options.name, new Set());
  }

  async deleteRoom(roomName: string): Promise<void> {
    this.rooms.delete(roomName);
  }

  async participantCount(roomName: string): Promise<number> {
    return this.rooms.get(roomName)?.size ?? 0;
  }

  async participantExists(roomName: string, identity: string): Promise<boolean> {
    return this.rooms.get(roomName)?.has(identity) ?? false;
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    const participants = this.rooms.get(roomName);
    if (!participants?.delete(identity)) throw new Error('participant not found');
  }

  async issueToken(options: MediaTokenOptions): Promise<string> {
    if (!this.available) throw new Error('LiveKit unavailable');
    this.tokens.push(options);
    return `fake-livekit-token-${options.identity}`;
  }

  async healthCheck(): Promise<void> {
    if (!this.available) throw new Error('LiveKit unavailable');
  }

  connect(roomName: string, identity: string): void {
    this.rooms.get(roomName)?.add(identity);
  }
}
