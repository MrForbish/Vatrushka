import { randomUUID } from 'node:crypto';

import pg from 'pg';

import type {
  ConversationMessage,
  ConversationMessagePage,
  ConversationReadState,
  ConversationSummary,
  InternalNotification,
  UserUnreadSummary,
} from '@vatrushka/shared';

export interface CanonicalConversationRecord {
  id: string;
  type: 'server_channel' | 'direct' | 'group_direct';
  serverId: string | null;
  channelId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalMentionInput {
  type: 'user' | 'role' | 'everyone';
  userId?: string | undefined;
  roleId?: string | undefined;
  start?: number | undefined;
  length?: number | undefined;
}

export interface CreateCanonicalMessageInput {
  conversationId: string;
  authorId: string;
  clientMessageId: string;
  content: string;
  replyToMessageId: string | null;
  attachmentIds: string[];
  mentions: CanonicalMentionInput[];
  now: Date;
}

export interface CanonicalAttachmentRecord {
  id: string;
  messageId: string | null;
  uploaderUserId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  finalizedAt: Date | null;
  createdAt: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  client_message_id: string;
  author_id: string;
  author_display_name: string | null;
  author_username: string | null;
  author_avatar_object_key: string | null;
  content: string;
  reply_id: string | null;
  reply_author_id: string | null;
  reply_author_display_name: string | null;
  reply_content: string | null;
  attachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: string; width: number | null; height: number | null; durationMs: number | null }> | null;
  reactions: Array<{ emoji: string; count: number; reactedByCurrentUser: boolean }> | null;
  mentions: Array<{ id: string; type: 'user' | 'role' | 'everyone'; userId: string | null; roleId: string | null; start: number | null; length: number | null }> | null;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
}

function publicMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    clientMessageId: row.client_message_id,
    author: {
      id: row.author_id,
      displayName: row.author_display_name ?? 'Удалённый пользователь',
      username: row.author_username,
      avatarUrl: row.author_avatar_object_key ? `/api/v1/media/${encodeURIComponent(row.author_avatar_object_key)}` : null,
    },
    content: row.deleted_at ? '' : row.content,
    replyTo: row.reply_id === null ? null : {
      id: row.reply_id,
      authorId: row.reply_author_id ?? '',
      authorDisplayName: row.reply_author_display_name ?? 'Удалённый пользователь',
      content: row.reply_content ?? '',
    },
    attachments: (row.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
    })),
    reactions: row.reactions ?? [],
    mentions: row.mentions ?? [],
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at?.toISOString() ?? null,
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

export class CanonicalMessagingStore {
  constructor(private readonly pool: pg.Pool) {}

  async close(): Promise<void> { await this.pool.end(); }

  async findConversation(id: string): Promise<CanonicalConversationRecord | null> {
    const result = await this.pool.query<{
      id: string; type: CanonicalConversationRecord['type']; server_id: string | null; channel_id: string | null; created_by: string | null; created_at: Date; updated_at: Date;
    }>('select id, type, server_id, channel_id, created_by, created_at, updated_at from conversations where id = $1', [id]);
    const row = result.rows[0];
    return row ? { id: row.id, type: row.type, serverId: row.server_id, channelId: row.channel_id, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  async isDirectMember(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query('select 1 from conversation_members where conversation_id = $1 and user_id = $2 and left_at is null', [conversationId, userId]);
    return result.rowCount === 1;
  }

  async createAttachmentIntent(record: Omit<CanonicalAttachmentRecord, 'messageId' | 'finalizedAt'>): Promise<void> {
    await this.pool.query(`
      insert into conversation_message_attachments (id, uploader_user_id, object_key, original_name, mime_type, size_bytes, width, height, duration_ms, created_at)
      values ($1, $2, $3, $4, $5, $6::bigint, $7, $8, $9, $10)
    `, [record.id, record.uploaderUserId, record.objectKey, record.originalName, record.mimeType, record.sizeBytes, record.width, record.height, record.durationMs, record.createdAt]);
  }

  async findAttachment(id: string): Promise<CanonicalAttachmentRecord | null> {
    const result = await this.pool.query<{
      id: string; message_id: string | null; uploader_user_id: string; object_key: string; original_name: string; mime_type: string; size_bytes: string; width: number | null; height: number | null; duration_ms: number | null; finalized_at: Date | null; created_at: Date;
    }>('select id, message_id::text, uploader_user_id, object_key, original_name, mime_type, size_bytes::text, width, height, duration_ms, finalized_at, created_at from conversation_message_attachments where id = $1', [id]);
    const row = result.rows[0];
    return row ? { id: row.id, messageId: row.message_id, uploaderUserId: row.uploader_user_id, objectKey: row.object_key, originalName: row.original_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, width: row.width, height: row.height, durationMs: row.duration_ms, finalizedAt: row.finalized_at, createdAt: row.created_at } : null;
  }

  async finalizeAttachment(id: string, userId: string, now: Date): Promise<CanonicalAttachmentRecord | null> {
    const result = await this.pool.query<{ id: string }>('update conversation_message_attachments set finalized_at = coalesce(finalized_at, $3) where id = $1 and uploader_user_id = $2 and message_id is null returning id', [id, userId, now]);
    return result.rows[0] ? this.findAttachment(id) : null;
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const result = await this.pool.query<{
      id: string; type: CanonicalConversationRecord['type']; server_id: string | null; channel_id: string | null; title: string; updated_at: Date;
      last_message_id: string | null; last_author_id: string | null; last_content: string | null; last_created_at: Date | null; unread_count: number; mention_count: number;
    }>(`
      select c.id, c.type, c.server_id, c.channel_id,
        coalesce(channel.name, peer.display_name, peer.username, 'Личные сообщения') as title,
        c.updated_at,
        latest.id as last_message_id, latest.author_id as last_author_id, latest.content as last_content, latest.created_at as last_created_at,
        (select count(*)::int from messages unread where unread.conversation_id = c.id and unread.deleted_at is null and unread.author_id <> $1 and unread.id > coalesce(state.last_read_message_id, 0)) as unread_count,
        coalesce(state.mention_count, 0)::int as mention_count
      from conversations c
      left join server_channels channel on channel.id = c.channel_id
      left join conversation_read_states state on state.conversation_id = c.id and state.user_id = $1
      left join lateral (
        select m.id, m.author_id, m.content, m.created_at from messages m where m.conversation_id = c.id order by m.id desc limit 1
      ) latest on true
      left join lateral (
        select u.display_name, u.username from conversation_members cm join users u on u.id = cm.user_id
        where cm.conversation_id = c.id and cm.user_id <> $1 and cm.left_at is null limit 1
      ) peer on true
      where (c.type = 'server_channel' and exists (select 1 from server_members sm where sm.server_id = c.server_id and sm.user_id = $1))
         or (c.type in ('direct', 'group_direct') and exists (select 1 from conversation_members own where own.conversation_id = c.id and own.user_id = $1 and own.left_at is null))
      order by c.updated_at desc
      limit 200
    `, [userId]);
    return result.rows.map((row) => ({
      id: row.id, type: row.type, serverId: row.server_id, channelId: row.channel_id, title: row.title, updatedAt: row.updated_at.toISOString(),
      lastMessage: row.last_message_id && row.last_author_id && row.last_created_at ? { id: row.last_message_id, authorId: row.last_author_id, content: row.last_content ?? '', createdAt: row.last_created_at.toISOString() } : null,
      unreadCount: row.unread_count, mentionCount: row.mention_count,
    }));
  }

  async getOrCreateDirectConversation(userId: string, otherUserId: string, now: Date): Promise<{ conversation: CanonicalConversationRecord; blocked: boolean; allowed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const pair = [userId, otherUserId].sort();
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [pair.join(':')]);
      const policy = await client.query<{ blocked: boolean; allowed: boolean }>(`
        select
          exists(select 1 from blocked_users where (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1)) as blocked,
          exists(
            select 1 from users target where target.id = $2 and target.deleted_at is null and (
              target.direct_message_privacy <> 'nobody' and exists (
                select 1 from server_members mine join server_members theirs on theirs.server_id = mine.server_id
                where mine.user_id = $1 and theirs.user_id = $2
              )
            )
          ) as allowed
      `, [userId, otherUserId]);
      if (policy.rows[0]?.blocked || !policy.rows[0]?.allowed) {
        await client.query('rollback');
        return { conversation: null as never, blocked: Boolean(policy.rows[0]?.blocked), allowed: Boolean(policy.rows[0]?.allowed) };
      }
      const existing = await client.query<{ id: string }>(`
        select c.id from conversations c
        join conversation_members a on a.conversation_id = c.id and a.user_id = $1 and a.left_at is null
        join conversation_members b on b.conversation_id = c.id and b.user_id = $2 and b.left_at is null
        where c.type = 'direct'
        limit 1
      `, [userId, otherUserId]);
      const id = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rows[0]) {
        await client.query("insert into conversations (id, type, created_by, created_at, updated_at) values ($1, 'direct', $2, $3, $3)", [id, userId, now]);
        await client.query('insert into conversation_members (conversation_id, user_id, joined_at) values ($1, $2, $4), ($1, $3, $4)', [id, userId, otherUserId, now]);
      }
      await client.query('commit');
      return { conversation: (await this.findConversation(id))!, blocked: false, allowed: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private messageSelect(): string {
    return `
      select m.id::text, m.conversation_id, m.client_message_id, m.author_id, author.display_name as author_display_name,
        author.username as author_username, author.avatar_object_key as author_avatar_object_key, m.content,
        reply.id::text as reply_id, reply.author_id as reply_author_id, reply_author.display_name as reply_author_display_name, reply.content as reply_content,
        coalesce(attachments.items, '[]'::json) as attachments,
        coalesce(reactions.items, '[]'::json) as reactions,
        coalesce(mentions.items, '[]'::json) as mentions,
        m.created_at, m.edited_at, m.deleted_at
      from messages m
      join users author on author.id = m.author_id
      left join messages reply on reply.id = m.reply_to_message_id
      left join users reply_author on reply_author.id = reply.author_id
      left join lateral (
        select json_agg(json_build_object('id', a.id, 'originalName', a.original_name, 'mimeType', a.mime_type, 'sizeBytes', a.size_bytes::text, 'width', a.width, 'height', a.height, 'durationMs', a.duration_ms) order by a.created_at) as items
        from conversation_message_attachments a where a.message_id = m.id
      ) attachments on true
      left join lateral (
        select json_agg(json_build_object('emoji', grouped.emoji, 'count', grouped.count, 'reactedByCurrentUser', grouped.reacted)) as items
        from (select r.emoji, count(*)::int as count, bool_or(r.user_id = $2) as reacted from conversation_message_reactions r where r.message_id = m.id group by r.emoji) grouped
      ) reactions on true
      left join lateral (
        select json_agg(json_build_object('id', mention.id, 'type', mention.mention_type, 'userId', mention.mentioned_user_id, 'roleId', mention.mentioned_role_id, 'start', mention.start, 'length', mention.length) order by mention.created_at) as items
        from conversation_message_mentions mention where mention.message_id = m.id
      ) mentions on true
    `;
  }

  async listMessages(conversationId: string, userId: string, before: string | null, after: string | null, limit: number): Promise<ConversationMessagePage> {
    const direction = after ? 'asc' : 'desc';
    const cursor = after ?? before;
    const comparison = after ? '>' : '<';
    const result = await this.pool.query<MessageRow>(`${this.messageSelect()} where m.conversation_id = $1 ${cursor ? `and m.id ${comparison} $3::bigint` : ''} order by m.id ${direction} limit $4`, [conversationId, userId, cursor, limit + 1]);
    const hasMore = result.rows.length > limit;
    const selected = result.rows.slice(0, limit);
    if (!after) selected.reverse();
    const items = selected.map(publicMessage);
    return { items, pageInfo: { before: items[0]?.id ?? null, after: items.at(-1)?.id ?? null, hasMore } };
  }

  async findMessage(messageId: string, userId: string): Promise<ConversationMessage | null> {
    const result = await this.pool.query<MessageRow>(`${this.messageSelect()} where m.id = $1::bigint`, [messageId, userId]);
    return result.rows[0] ? publicMessage(result.rows[0]) : null;
  }

  async createMessage(input: CreateCanonicalMessageInput): Promise<{ message: ConversationMessage; created: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const existing = await client.query<{ id: string }>('select id::text from messages where author_id = $1 and client_message_id = $2', [input.authorId, input.clientMessageId]);
      if (existing.rows[0]) {
        await client.query('commit');
        return { message: (await this.findMessage(existing.rows[0].id, input.authorId))!, created: false };
      }
      if (input.replyToMessageId) {
        const reply = await client.query('select 1 from messages where id = $1::bigint and conversation_id = $2', [input.replyToMessageId, input.conversationId]);
        if (reply.rowCount !== 1) throw new Error('INVALID_REPLY');
      }
      if (input.attachmentIds.length > 0) {
        const attachments = await client.query('select id from conversation_message_attachments where id = any($1::uuid[]) and uploader_user_id = $2 and finalized_at is not null and message_id is null for update', [input.attachmentIds, input.authorId]);
        if (attachments.rowCount !== input.attachmentIds.length) throw new Error('INVALID_ATTACHMENTS');
      }
      const inserted = await client.query<{ id: string }>(`
        insert into messages (conversation_id, author_id, content, reply_to_message_id, client_message_id, created_at)
        values ($1, $2, $3, $4::bigint, $5, $6) returning id::text
      `, [input.conversationId, input.authorId, input.content, input.replyToMessageId, input.clientMessageId, input.now]);
      const messageId = inserted.rows[0]!.id;
      if (input.attachmentIds.length > 0) await client.query('update conversation_message_attachments set message_id = $1::bigint where id = any($2::uuid[])', [messageId, input.attachmentIds]);
      for (const mention of input.mentions) {
        await client.query(`insert into conversation_message_mentions (id, message_id, mention_type, mentioned_user_id, mentioned_role_id, start, length, created_at) values ($1, $2::bigint, $3, $4, $5, $6, $7, $8)`, [randomUUID(), messageId, mention.type, mention.userId ?? null, mention.roleId ?? null, mention.start ?? null, mention.length ?? null, input.now]);
      }
      const recipients = new Map<string, 'direct_message' | 'mention' | 'reply'>();
      const conversation = await client.query<{ type: CanonicalConversationRecord['type'] }>('select type from conversations where id = $1 for update', [input.conversationId]);
      if (conversation.rows[0]?.type !== 'server_channel') {
        const members = await client.query<{ user_id: string }>('select user_id from conversation_members where conversation_id = $1 and user_id <> $2 and left_at is null', [input.conversationId, input.authorId]);
        for (const member of members.rows) recipients.set(member.user_id, 'direct_message');
      }
      for (const mention of input.mentions) if (mention.userId && mention.userId !== input.authorId && !recipients.has(mention.userId)) recipients.set(mention.userId, 'mention');
      if (input.replyToMessageId) {
        const reply = await client.query<{ author_id: string }>('select author_id from messages where id = $1::bigint', [input.replyToMessageId]);
        const replyAuthor = reply.rows[0]?.author_id;
        if (replyAuthor && replyAuthor !== input.authorId && !recipients.has(replyAuthor)) recipients.set(replyAuthor, 'reply');
      }
      for (const [recipientId, type] of recipients) {
        await client.query('insert into notifications (id, user_id, type, actor_user_id, conversation_id, message_id, payload, created_at) values ($1, $2, $3, $4, $5, $6::bigint, $7, $8)', [randomUUID(), recipientId, type, input.authorId, input.conversationId, messageId, { preview: input.content.slice(0, 160) }, input.now]);
      }
      await client.query('update conversations set updated_at = $2 where id = $1', [input.conversationId, input.now]);
      await client.query('insert into outbox_events (event_type, aggregate_type, aggregate_id, payload, created_at, available_at) values ($1, $2, $3, $4, $5, $5)', ['message.created', 'conversation', input.conversationId, { conversationId: input.conversationId, messageId, recipientIds: [...recipients.keys()] }, input.now]);
      await client.query('commit');
      return { message: (await this.findMessage(messageId, input.authorId))!, created: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async editMessage(messageId: string, authorId: string, content: string, mentions: CanonicalMentionInput[], now: Date): Promise<ConversationMessage | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const changed = await client.query<{ conversation_id: string }>('update messages set content = $3, edited_at = $4 where id = $1::bigint and author_id = $2 and deleted_at is null returning conversation_id', [messageId, authorId, content, now]);
      if (!changed.rows[0]) { await client.query('rollback'); return null; }
      await client.query('delete from conversation_message_mentions where message_id = $1::bigint', [messageId]);
      for (const mention of mentions) await client.query('insert into conversation_message_mentions (id, message_id, mention_type, mentioned_user_id, mentioned_role_id, start, length, created_at) values ($1, $2::bigint, $3, $4, $5, $6, $7, $8)', [randomUUID(), messageId, mention.type, mention.userId ?? null, mention.roleId ?? null, mention.start ?? null, mention.length ?? null, now]);
      await client.query('insert into outbox_events (event_type, aggregate_type, aggregate_id, payload, created_at, available_at) values ($1, $2, $3, $4, $5, $5)', ['message.updated', 'conversation', changed.rows[0].conversation_id, { conversationId: changed.rows[0].conversation_id, messageId }, now]);
      await client.query('commit');
      return this.findMessage(messageId, authorId);
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async softDeleteMessage(messageId: string, actorId: string, canManage: boolean, now: Date): Promise<boolean> {
    const result = await this.pool.query<{ conversation_id: string }>('update messages set content = $4, deleted_at = $3 where id = $1::bigint and deleted_at is null and (author_id = $2 or $5) returning conversation_id', [messageId, actorId, now, '', canManage]);
    if (!result.rows[0]) return false;
    await this.pool.query('insert into outbox_events (event_type, aggregate_type, aggregate_id, payload, created_at, available_at) values ($1, $2, $3, $4, $5, $5)', ['message.deleted', 'conversation', result.rows[0].conversation_id, { conversationId: result.rows[0].conversation_id, messageId }, now]);
    return true;
  }

  async setReaction(messageId: string, userId: string, emoji: string, active: boolean, now: Date): Promise<ConversationMessage | null> {
    const message = await this.pool.query<{ conversation_id: string }>('select conversation_id from messages where id = $1::bigint and deleted_at is null', [messageId]);
    if (!message.rows[0]) return null;
    if (active) await this.pool.query('insert into conversation_message_reactions (message_id, user_id, emoji, created_at) values ($1::bigint, $2, $3, $4) on conflict do nothing', [messageId, userId, emoji, now]);
    else await this.pool.query('delete from conversation_message_reactions where message_id = $1::bigint and user_id = $2 and emoji = $3', [messageId, userId, emoji]);
    await this.pool.query('insert into outbox_events (event_type, aggregate_type, aggregate_id, payload, created_at, available_at) values ($1, $2, $3, $4, $5, $5)', ['message.reaction.updated', 'conversation', message.rows[0].conversation_id, { conversationId: message.rows[0].conversation_id, messageId, emoji, active, userId }, now]);
    return this.findMessage(messageId, userId);
  }

  async updateReadState(conversationId: string, userId: string, deliveredId: string | null, readId: string | null, now: Date): Promise<ConversationReadState | null> {
    const target = readId ?? deliveredId;
    if (!target) return null;
    const belongs = await this.pool.query('select 1 from messages where id = $1::bigint and conversation_id = $2', [target, conversationId]);
    if (belongs.rowCount !== 1) return null;
    const result = await this.pool.query<{
      conversation_id: string; last_delivered_message_id: string | null; last_read_message_id: string | null; last_delivered_at: Date | null; last_read_at: Date | null; mention_count: number;
    }>(`
      insert into conversation_read_states (conversation_id, user_id, last_delivered_message_id, last_read_message_id, last_delivered_at, last_read_at, mention_count)
      values ($1, $2, $3::bigint, $4::bigint, case when $3::bigint is null then null else $5 end, case when $4::bigint is null then null else $5 end, 0)
      on conflict (conversation_id, user_id) do update set
        last_delivered_message_id = greatest(conversation_read_states.last_delivered_message_id, excluded.last_delivered_message_id),
        last_read_message_id = greatest(conversation_read_states.last_read_message_id, excluded.last_read_message_id),
        last_delivered_at = case when excluded.last_delivered_message_id > coalesce(conversation_read_states.last_delivered_message_id, 0) then excluded.last_delivered_at else conversation_read_states.last_delivered_at end,
        last_read_at = case when excluded.last_read_message_id > coalesce(conversation_read_states.last_read_message_id, 0) then excluded.last_read_at else conversation_read_states.last_read_at end,
        mention_count = case when excluded.last_read_message_id > coalesce(conversation_read_states.last_read_message_id, 0) then (
          select count(*)::int from conversation_message_mentions mention join messages m on m.id = mention.message_id
          where m.conversation_id = $1 and mention.mentioned_user_id = $2 and m.id > excluded.last_read_message_id
        ) else conversation_read_states.mention_count end
      returning conversation_id, last_delivered_message_id::text, last_read_message_id::text, last_delivered_at, last_read_at, mention_count
    `, [conversationId, userId, deliveredId, readId, now]);
    const row = result.rows[0];
    if (!row) return null;
    return { conversationId: row.conversation_id, lastDeliveredMessageId: row.last_delivered_message_id, lastReadMessageId: row.last_read_message_id, lastDeliveredAt: row.last_delivered_at?.toISOString() ?? null, lastReadAt: row.last_read_at?.toISOString() ?? null, mentionCount: row.mention_count };
  }

  async unreadSummary(userId: string): Promise<UserUnreadSummary> {
    const result = await this.pool.query<{ conversation_id: string; unread_count: number; mention_count: number; first_unread_message_id: string | null; type: CanonicalConversationRecord['type'] }>(`
      select c.id as conversation_id, c.type,
        count(m.id) filter (where m.author_id <> $1 and m.deleted_at is null)::int as unread_count,
        coalesce(state.mention_count, 0)::int as mention_count,
        min(m.id)::text as first_unread_message_id
      from conversations c
      left join conversation_read_states state on state.conversation_id = c.id and state.user_id = $1
      left join messages m on m.conversation_id = c.id and m.id > coalesce(state.last_read_message_id, 0)
      where (c.type = 'server_channel' and exists (select 1 from server_members sm where sm.server_id = c.server_id and sm.user_id = $1))
         or (c.type in ('direct', 'group_direct') and exists (select 1 from conversation_members cm where cm.conversation_id = c.id and cm.user_id = $1 and cm.left_at is null))
      group by c.id, c.type, state.mention_count
    `, [userId]);
    const conversations = result.rows.map((row) => ({ conversationId: row.conversation_id, unreadCount: row.unread_count, mentionCount: row.mention_count, firstUnreadMessageId: row.first_unread_message_id }));
    return {
      totalDirectUnread: result.rows.filter((row) => row.type !== 'server_channel').reduce((sum, row) => sum + row.unread_count, 0),
      totalMentionUnread: result.rows.reduce((sum, row) => sum + row.mention_count, 0),
      totalReplyUnread: 0,
      conversations,
    };
  }

  async listNotifications(userId: string, before: Date | null, limit: number, unreadOnly: boolean): Promise<InternalNotification[]> {
    const result = await this.pool.query<{
      id: string; type: InternalNotification['type']; actor_user_id: string | null; conversation_id: string | null; message_id: string | null; payload: Record<string, unknown>; created_at: Date; read_at: Date | null; dismissed_at: Date | null;
    }>(`select id, type, actor_user_id, conversation_id, message_id::text, payload, created_at, read_at, dismissed_at from notifications where user_id = $1 and dismissed_at is null ${before ? 'and created_at < $2' : ''} ${unreadOnly ? 'and read_at is null' : ''} order by created_at desc, id desc limit $3`, [userId, before, limit]);
    return result.rows.map((row) => ({ id: row.id, type: row.type, actorUserId: row.actor_user_id, conversationId: row.conversation_id, messageId: row.message_id, payload: row.payload, createdAt: row.created_at.toISOString(), readAt: row.read_at?.toISOString() ?? null, dismissedAt: row.dismissed_at?.toISOString() ?? null }));
  }

  async markNotificationRead(userId: string, notificationId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query('update notifications set read_at = coalesce(read_at, $3) where id = $1 and user_id = $2 returning id', [notificationId, userId, now]);
    return result.rowCount === 1;
  }

  async markAllNotificationsRead(userId: string, now: Date): Promise<number> {
    const result = await this.pool.query('update notifications set read_at = $2 where user_id = $1 and read_at is null and dismissed_at is null', [userId, now]);
    return result.rowCount ?? 0;
  }
}

export function createCanonicalMessagingStore(databaseUrl: string): CanonicalMessagingStore {
  return new CanonicalMessagingStore(new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 }));
}
