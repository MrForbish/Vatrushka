import type { Mailer, MediaRoomOptions, MediaService, MediaTokenOptions, ObjectStorage, ObjectStoragePutInput } from '../ports.js';

export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { content: Buffer; mimeType: string }>();
  available = true;

  async healthCheck(): Promise<void> {
    if (!this.available) throw new Error('Object storage unavailable');
  }

  async putObject({ content, key, mimeType }: ObjectStoragePutInput): Promise<void> {
    if (!this.available) throw new Error('Object storage unavailable');
    this.objects.set(key, { content: Buffer.from(content), mimeType });
  }

  async getObject(key: string): Promise<Buffer> {
    if (!this.available) throw new Error('Object storage unavailable');
    const object = this.objects.get(key);
    if (!object) throw new Error('Object not found');
    return Buffer.from(object.content);
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.available) throw new Error('Object storage unavailable');
    this.objects.delete(key);
  }

  createPutUrl(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/put/${encodeURIComponent(key)}`);
  }

  createGetUrl(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/get/${encodeURIComponent(key)}`);
  }

  headObject(key: string): Promise<{ size: number; mimeType: string | null }> {
    const object = this.objects.get(key);
    if (!object) return Promise.reject(new Error('Object not found'));
    return Promise.resolve({ size: object.content.length, mimeType: object.mimeType });
  }

  close(): void {}
}

export class FakeMailer implements Mailer {
  readonly messages: Array<{ email: string; code: string }> = [];
  readonly securityNotices: Array<{ email: string; title: string; message: string }> = [];
  shouldFail = false;

  async sendOtp(email: string, code: string): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP unavailable');
    this.messages.push({ email, code });
  }

  async sendSecurityNotice(email: string, title: string, message: string): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP unavailable');
    this.securityNotices.push({ email, title, message });
  }
}

export class FakeMediaService implements MediaService {
  readonly rooms = new Map<string, Set<string>>();
  readonly tokens: MediaTokenOptions[] = [];
  available = true;

  async createRoom(options: MediaRoomOptions): Promise<void> {
    if (!this.available) throw new Error('LiveKit unavailable');
    if (!this.rooms.has(options.name)) this.rooms.set(options.name, new Set());
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

  async moveParticipant(sourceRoomName: string, identity: string, destinationRoomName: string): Promise<void> {
    const source = this.rooms.get(sourceRoomName);
    const destination = this.rooms.get(destinationRoomName);
    if (!source?.delete(identity) || !destination) throw new Error('participant or room not found');
    destination.add(identity);
  }

  async participantIdentities(roomName: string): Promise<string[]> {
    return [...(this.rooms.get(roomName) ?? [])];
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
