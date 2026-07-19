import { randomUUID } from 'node:crypto';

import type { RawData, WebSocket } from 'ws';

import { realtimeClientCommandSchema, type RealtimeEvent } from '@vatrushka/shared';

import type { VatrushkaService } from '../service.js';
import type { RedisRealtimeBus } from './realtime.js';
import { technicalMetrics } from './metrics.js';

interface ConnectionState {
  id: string;
  socket: WebSocket;
  userId: string | null;
  deviceId: string | null;
  authorization: string | null;
  subscriptions: Set<string>;
  voiceSubscriptions: Set<string>;
  alive: boolean;
}

export class WebSocketGateway {
  private readonly connections = new Map<string, ConnectionState>();
  private readonly seenDevices = new Set<string>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly unsubscribe: () => void;

  constructor(private readonly service: VatrushkaService, private readonly bus: RedisRealtimeBus) {
    this.unsubscribe = bus.onEvent((event) => this.deliver(event));
    this.heartbeat = setInterval(() => void this.pingConnections(), 30_000);
    this.heartbeat.unref();
  }

  handle(socket: WebSocket): void {
    const state: ConnectionState = { id: randomUUID(), socket, userId: null, deviceId: null, authorization: null, subscriptions: new Set(), voiceSubscriptions: new Set(), alive: true };
    this.connections.set(state.id, state);
    technicalMetrics.set('chat_ws_connections_active', this.connections.size);
    const authTimeout = setTimeout(() => {
      if (!state.userId) socket.close(4401, 'Authentication timeout');
    }, 5_000);
    authTimeout.unref();
    socket.on('pong', () => { state.alive = true; });
    socket.on('message', (data) => void this.onMessage(state, data));
    socket.on('close', () => {
      clearTimeout(authTimeout);
      this.connections.delete(state.id);
      technicalMetrics.set('chat_ws_connections_active', this.connections.size);
      if (state.userId) void this.bus.unregisterConnection(state.userId, state.id);
    });
    socket.on('error', () => undefined);
    this.send(state, { type: 'hello', connectionId: state.id, protocolVersion: 1 });
  }

  close(): void {
    clearInterval(this.heartbeat);
    this.unsubscribe();
    for (const connection of this.connections.values()) connection.socket.close(1001, 'Server shutdown');
    this.connections.clear();
    technicalMetrics.set('chat_ws_connections_active', 0);
  }

  private async onMessage(state: ConnectionState, raw: RawData): Promise<void> {
    const buffer = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : Buffer.from(raw);
    if (buffer.length > 16 * 1024) return state.socket.close(1009, 'Message too large');
    let value: unknown;
    try { value = JSON.parse(buffer.toString('utf8')); } catch { return this.sendError(state, 'INVALID_JSON'); }
    const parsed = realtimeClientCommandSchema.safeParse(value);
    if (!parsed.success) return this.sendError(state, 'VALIDATION_ERROR');
    const command = parsed.data;
    try {
      if (command.type === 'auth') {
        if (state.userId) return this.sendError(state, 'ALREADY_AUTHENTICATED');
        const user = await this.service.authenticate(`Bearer ${command.token}`);
        state.userId = user.id;
        state.deviceId = command.deviceId;
        state.authorization = `Bearer ${command.token}`;
        const deviceKey = `${user.id}:${command.deviceId}`;
        if (this.seenDevices.has(deviceKey)) technicalMetrics.increment('chat_ws_reconnects_total');
        else this.seenDevices.add(deviceKey);
        await this.bus.registerConnection(user.id, state.id, command.deviceId);
        return this.send(state, { type: 'authenticated', userId: user.id });
      }
      if (!state.userId || !state.authorization || !state.deviceId) return state.socket.close(4401, 'Authentication required');
      if (command.type === 'ping') {
        await this.bus.refreshConnection(state.userId);
        return this.send(state, { type: 'pong', at: new Date().toISOString() });
      }
      if (command.type === 'subscribe') {
        await this.service.getCanonicalConversation(state.authorization, command.conversationId);
        state.subscriptions.add(command.conversationId);
        return this.send(state, { type: 'subscribed', conversationId: command.conversationId });
      }
      if (command.type === 'unsubscribe') {
        state.subscriptions.delete(command.conversationId);
        return;
      }
      if (command.type === 'voice.server.subscribe') {
        const snapshot = await this.service.getServerVoiceState(state.authorization, command.serverId);
        state.voiceSubscriptions.add(command.serverId);
        if (command.knownVersion !== undefined && command.knownVersion !== snapshot.version)
          technicalMetrics.increment('voice_websocket_version_gap_total');
        return this.send(state, {
          type: 'voice.server.subscribed',
          serverId: command.serverId,
          version: snapshot.version,
          snapshotRequired: command.knownVersion !== undefined && command.knownVersion !== snapshot.version,
        });
      }
      if (command.type === 'voice.server.unsubscribe') {
        state.voiceSubscriptions.delete(command.serverId);
        return;
      }
      if (command.type === 'active_conversation.set') {
        if (command.conversationId) await this.service.getCanonicalConversation(state.authorization, command.conversationId);
        await this.bus.setActiveConversation(state.userId, state.deviceId, command.conversationId);
        return;
      }
      if (command.type === 'typing.start' || command.type === 'typing.stop') {
        await this.service.getCanonicalConversation(state.authorization, command.conversationId);
        await this.bus.setTyping(command.conversationId, state.userId, command.type === 'typing.start');
        return;
      }
      if (command.type === 'delivery.ack') {
        await this.service.updateCanonicalReadState(state.authorization, command.conversationId, command.messageId, undefined);
        return;
      }
      await this.service.updateCanonicalReadState(state.authorization, command.conversationId, command.messageId, command.messageId);
    } catch {
      this.sendError(state, 'COMMAND_REJECTED');
    }
  }

  private deliver(event: RealtimeEvent): void {
    technicalMetrics.observe('chat_ws_delivery_latency_ms', Math.max(0, Date.now() - new Date(event.occurredAt).getTime()));
    for (const connection of this.connections.values()) {
      if (!connection.userId || connection.socket.readyState !== connection.socket.OPEN) continue;
      const targeted = event.targetUserIds.includes(connection.userId);
      const subscribed = Boolean(event.conversationId && connection.subscriptions.has(event.conversationId));
      const readStateEvent = event.type === 'conversation.read_state.updated';
      if ((readStateEvent && targeted) || (!readStateEvent && (targeted || subscribed))) this.send(connection, { type: 'event', event });
    }
  }

  private async pingConnections(): Promise<void> {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
      if (connection.userId && connection.authorization) {
        try {
          await this.service.authenticate(connection.authorization);
          await this.bus.refreshConnection(connection.userId);
        } catch {
          connection.socket.close(4401, 'Session revoked');
        }
      }
    }
  }

  private send(state: ConnectionState, payload: unknown): void {
    if (state.socket.readyState === state.socket.OPEN) state.socket.send(JSON.stringify(payload));
  }

  private sendError(state: ConnectionState, code: string): void {
    this.send(state, { type: 'error', code });
  }
}
