import type { RealtimeEvent } from '@vatrushka/shared';

import { RealtimeClient } from './realtime';

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  message(payload: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code = 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code }));
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    } satisfies Storage);
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('authenticates, restores subscriptions and deduplicates events', async () => {
    const credentials = vi.fn(async () => ({ token: 't'.repeat(40), url: 'ws://localhost/ws' }));
    const client = new RealtimeClient(credentials);
    const events: RealtimeEvent[] = [];
    client.subscribe('11111111-1111-4111-8111-111111111111');
    client.setActiveConversation('11111111-1111-4111-8111-111111111111');
    client.onEvent((event) => events.push(event));
    client.start();
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    const socket = MockWebSocket.instances[0]!;
    socket.open();
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: 'auth', token: 't'.repeat(40) });
    socket.message({ type: 'authenticated', userId: 'user-1' });
    expect(socket.sent.map((payload): unknown => JSON.parse(payload) as unknown)).toEqual(expect.arrayContaining([
      { type: 'subscribe', conversationId: '11111111-1111-4111-8111-111111111111' },
      { type: 'active_conversation.set', conversationId: '11111111-1111-4111-8111-111111111111' },
    ]));

    const event: RealtimeEvent = { id: 'event-1', type: 'message.created', occurredAt: new Date().toISOString(), conversationId: '11111111-1111-4111-8111-111111111111', targetUserIds: [], payload: {} };
    socket.message({ type: 'event', event });
    socket.message({ type: 'event', event });
    expect(events).toEqual([event]);
    client.stop();
  });
});
