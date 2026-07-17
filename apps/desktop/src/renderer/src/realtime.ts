import type { RealtimeClientCommand, RealtimeEvent } from '@vatrushka/shared';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type CredentialsProvider = (forceRefresh: boolean) => Promise<{ token: string; url: string }>;
type EventListener = (event: RealtimeEvent) => void;
type StatusListener = (status: RealtimeStatus) => void;

interface ServerEnvelope {
  type?: string;
  event?: RealtimeEvent;
}

const installationIdKey = 'vatrushka.installation-id';

function installationId(): string {
  const current = window.localStorage.getItem(installationIdKey);
  if (current) return current;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(installationIdKey, created);
  return created;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private running = false;
  private authenticated = false;
  private forceRefresh = false;
  private reconnectAttempt = 0;
  private generation = 0;
  private activeConversationId: string | null = null;
  private readonly subscriptions = new Set<string>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly receivedEventIds = new Set<string>();
  private status: RealtimeStatus = 'idle';

  constructor(private readonly credentials: CredentialsProvider) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    void this.connect(this.generation);
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.clearTimers();
    this.authenticated = false;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Signed out');
    this.setStatus('idle');
  }

  subscribe(conversationId: string): void {
    if (this.subscriptions.has(conversationId)) return;
    this.subscriptions.add(conversationId);
    this.send({ type: 'subscribe', conversationId });
  }

  unsubscribe(conversationId: string): void {
    if (!this.subscriptions.delete(conversationId)) return;
    this.send({ type: 'unsubscribe', conversationId });
  }

  setActiveConversation(conversationId: string | null): void {
    this.activeConversationId = conversationId;
    this.send({ type: 'active_conversation.set', conversationId });
  }

  sendCommand(command: RealtimeClientCommand): void {
    this.send(command);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private async connect(generation: number): Promise<void> {
    if (!this.running || generation !== this.generation) return;
    this.setStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    try {
      const credentials = await this.credentials(this.forceRefresh);
      this.forceRefresh = false;
      if (!this.running || generation !== this.generation) return;
      const socket = new WebSocket(credentials.url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (socket !== this.socket) return;
        socket.send(JSON.stringify({ type: 'auth', token: credentials.token, deviceId: installationId() } satisfies RealtimeClientCommand));
      });
      socket.addEventListener('message', (message) => this.handleMessage(socket, message.data));
      socket.addEventListener('close', (event) => this.handleClose(socket, event.code));
      socket.addEventListener('error', () => undefined);
    } catch {
      this.scheduleReconnect(generation);
    }
  }

  private handleMessage(socket: WebSocket, raw: unknown): void {
    if (socket !== this.socket || typeof raw !== 'string') return;
    let envelope: ServerEnvelope;
    try { envelope = JSON.parse(raw) as ServerEnvelope; } catch { return; }
    if (envelope.type === 'authenticated') {
      this.authenticated = true;
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      for (const conversationId of this.subscriptions) this.send({ type: 'subscribe', conversationId });
      this.send({ type: 'active_conversation.set', conversationId: this.activeConversationId });
      this.heartbeatTimer = window.setInterval(() => this.send({ type: 'ping' }), 20_000);
      return;
    }
    const event = envelope.type === 'event' ? envelope.event : undefined;
    if (!event || typeof event.id !== 'string' || this.receivedEventIds.has(event.id)) return;
    this.receivedEventIds.add(event.id);
    if (this.receivedEventIds.size > 500) this.receivedEventIds.delete(this.receivedEventIds.values().next().value!);
    for (const listener of this.eventListeners) listener(event);
  }

  private handleClose(socket: WebSocket, code: number): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.authenticated = false;
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (code === 4401) this.forceRefresh = true;
    this.scheduleReconnect(this.generation);
  }

  private scheduleReconnect(generation: number): void {
    if (!this.running || generation !== this.generation || this.reconnectTimer !== null) return;
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    const baseDelay = Math.min(30_000, 750 * 2 ** Math.min(this.reconnectAttempt - 1, 6));
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(generation);
    }, delay);
  }

  private send(command: RealtimeClientCommand): void {
    if (!this.authenticated || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(command));
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
