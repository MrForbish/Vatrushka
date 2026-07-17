import pg from 'pg';

import type {
  ServerAppearanceSettings,
  ServerAuditLogPage,
  ServerBanSettings,
  ServerChannelCategory,
  ServerChannelSettings,
  ServerInviteSettings,
  ServerModerationSettings,
  ServerOverviewSettings,
  ServerSettingsMember,
} from '@vatrushka/shared';

export interface ServerOverviewUpdate {
  name: string;
  description: string | null;
  language: string;
  timezone: string;
  systemChannelId: string | null;
  welcomeChannelId: string | null;
  defaultNotificationLevel: 'all' | 'mentions' | 'none';
  defaultVoiceInactivitySeconds: number;
  version: number;
}

export interface ServerModerationUpdate {
  verificationLevel: 'none' | 'email_verified' | 'account_age';
  newMemberRestrictionMinutes: number;
  messageRateLimitPerMinute: number;
  mentionLimitPerMessage: number;
  rules: string | null;
  version: number;
}

interface ServerOverviewRow {
  id: string; name: string; description: string | null; language: string; timezone: string;
  system_channel_id: string | null; welcome_channel_id: string | null; default_notification_level: 'all' | 'mentions' | 'none';
  default_voice_inactivity_seconds: number; owner_user_id: string; owner_display_name: string | null; version: number; updated_at: Date;
}

function overview(row: ServerOverviewRow): ServerOverviewSettings {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    language: row.language,
    timezone: row.timezone,
    systemChannelId: row.system_channel_id,
    welcomeChannelId: row.welcome_channel_id,
    defaultNotificationLevel: row.default_notification_level,
    defaultVoiceInactivitySeconds: row.default_voice_inactivity_seconds,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name ?? 'Удалённый пользователь',
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ServerSettingsStore {
  constructor(private readonly pool: pg.Pool) {}

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getOverview(serverId: string): Promise<ServerOverviewSettings | null> {
    const result = await this.pool.query<ServerOverviewRow>(`
      select server.id, server.name, server.description, server.language, server.timezone, server.system_channel_id,
        server.welcome_channel_id, server.default_notification_level, server.default_voice_inactivity_seconds,
        server.owner_user_id, owner.display_name as owner_display_name, server.version, server.updated_at
      from servers server left join users owner on owner.id = server.owner_user_id where server.id = $1
    `, [serverId]);
    return result.rows[0] ? overview(result.rows[0]) : null;
  }

  async updateOverview(serverId: string, input: ServerOverviewUpdate, now: Date): Promise<ServerOverviewSettings | null> {
    const result = await this.pool.query<ServerOverviewRow>(`
      update servers server set name = $2, description = $3, language = $4, timezone = $5, system_channel_id = $6,
        welcome_channel_id = $7, default_notification_level = $8, default_voice_inactivity_seconds = $9,
        version = version + 1, updated_at = $10
      from users owner
      where server.id = $1 and server.version = $11 and owner.id = server.owner_user_id
        and ($6::uuid is null or exists (select 1 from server_channels channel where channel.id = $6 and channel.server_id = server.id and channel.type = 'text' and channel.archived_at is null))
        and ($7::uuid is null or exists (select 1 from server_channels channel where channel.id = $7 and channel.server_id = server.id and channel.type = 'text' and channel.archived_at is null))
      returning server.id, server.name, server.description, server.language, server.timezone, server.system_channel_id,
        server.welcome_channel_id, server.default_notification_level, server.default_voice_inactivity_seconds,
        server.owner_user_id, owner.display_name as owner_display_name, server.version, server.updated_at
    `, [serverId, input.name, input.description, input.language, input.timezone, input.systemChannelId, input.welcomeChannelId, input.defaultNotificationLevel, input.defaultVoiceInactivitySeconds, now, input.version]);
    return result.rows[0] ? overview(result.rows[0]) : null;
  }

  async getAppearance(serverId: string, createUrl: (key: string) => Promise<string>): Promise<ServerAppearanceSettings | null> {
    const result = await this.pool.query<{ icon_object_key: string | null; banner_object_key: string | null; accent_color: string | null; version: number }>(
      'select icon_object_key, banner_object_key, accent_color, version from servers where id = $1', [serverId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const [iconUrl, bannerUrl] = await Promise.all([
      row.icon_object_key ? createUrl(row.icon_object_key) : null,
      row.banner_object_key ? createUrl(row.banner_object_key) : null,
    ]);
    return { iconUrl, bannerUrl, accentColor: row.accent_color, version: row.version };
  }

  async updateAppearance(serverId: string, input: { iconObjectKey?: string | null | undefined; bannerObjectKey?: string | null | undefined; accentColor: string | null; version: number }, now: Date): Promise<boolean> {
    const result = await this.pool.query(`
      update servers set icon_object_key = case when $2 then $3 else icon_object_key end,
        banner_object_key = case when $4 then $5 else banner_object_key end,
        accent_color = $6, version = version + 1, updated_at = $7 where id = $1 and version = $8
    `, [serverId, input.iconObjectKey !== undefined, input.iconObjectKey ?? null, input.bannerObjectKey !== undefined, input.bannerObjectKey ?? null, input.accentColor, now, input.version]);
    return result.rowCount === 1;
  }

  async listMembers(serverId: string, search: string | null): Promise<ServerSettingsMember[]> {
    const result = await this.pool.query<{
      user_id: string; display_name: string | null; username: string | null; nickname: string | null; platform_role: 'member' | 'admin' | 'owner';
      joined_at: Date; last_active_at: Date | null; muted_until: Date | null; deafened: boolean; role_ids: string[];
    }>(`
      select member.user_id, user_record.display_name, user_record.username, member.nickname, user_record.platform_role,
        member.joined_at, member.last_active_at, member.muted_until, member.deafened,
        coalesce(array_agg(assignment.role_id) filter (where assignment.role_id is not null), '{}') as role_ids
      from server_members member join users user_record on user_record.id = member.user_id
      left join server_member_roles assignment on assignment.server_id = member.server_id and assignment.user_id = member.user_id
      where member.server_id = $1 and ($2::text is null or coalesce(member.nickname, user_record.display_name, user_record.username, '') ilike '%' || $2 || '%')
      group by member.user_id, user_record.display_name, user_record.username, member.nickname, user_record.platform_role,
        member.joined_at, member.last_active_at, member.muted_until, member.deafened
      order by coalesce(member.nickname, user_record.display_name, user_record.username) asc nulls last limit 500
    `, [serverId, search]);
    return result.rows.map((row) => ({
      userId: row.user_id, displayName: row.display_name ?? row.username ?? 'Удалённый пользователь', username: row.username,
      nickname: row.nickname, platformRole: row.platform_role, joinedAt: row.joined_at.toISOString(), lastActiveAt: row.last_active_at?.toISOString() ?? null,
      mutedUntil: row.muted_until?.toISOString() ?? null, deafened: row.deafened, roleIds: row.role_ids,
    }));
  }

  async updateMember(serverId: string, userId: string, input: { nickname?: string | null; mutedUntil?: Date | null; deafened?: boolean }): Promise<boolean> {
    const result = await this.pool.query(`
      update server_members set nickname = case when $3 then $4 else nickname end,
        muted_until = case when $5 then $6 else muted_until end, deafened = case when $7 then $8 else deafened end,
        last_active_at = coalesce(last_active_at, now()) where server_id = $1 and user_id = $2
    `, [serverId, userId, input.nickname !== undefined, input.nickname ?? null, input.mutedUntil !== undefined, input.mutedUntil ?? null, input.deafened !== undefined, input.deafened ?? false]);
    return result.rowCount === 1;
  }

  async listCategories(serverId: string): Promise<ServerChannelCategory[]> {
    const result = await this.pool.query<{ id: string; name: string; position: number }>('select id, name, position from server_channel_categories where server_id = $1 order by position, name', [serverId]);
    return result.rows;
  }

  async createCategory(id: string, serverId: string, name: string, position: number, now: Date): Promise<ServerChannelCategory> {
    const result = await this.pool.query<{ id: string; name: string; position: number }>(`
      insert into server_channel_categories (id, server_id, name, position, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)
      returning id, name, position
    `, [id, serverId, name, position, now]);
    return result.rows[0]!;
  }

  async updateCategory(serverId: string, categoryId: string, input: { name?: string | undefined; position?: number | undefined }, now: Date): Promise<boolean> {
    const result = await this.pool.query(`update server_channel_categories set name = coalesce($3, name), position = coalesce($4, position), updated_at = $5 where server_id = $1 and id = $2`, [serverId, categoryId, input.name, input.position, now]);
    return result.rowCount === 1;
  }

  async deleteCategory(serverId: string, categoryId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('update server_channels set category_id = null where server_id = $1 and category_id = $2', [serverId, categoryId]);
      const result = await client.query('delete from server_channel_categories where server_id = $1 and id = $2', [serverId, categoryId]);
      await client.query('commit');
      return result.rowCount === 1;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listChannels(serverId: string): Promise<ServerChannelSettings[]> {
    const result = await this.pool.query<{
      id: string; name: string; type: 'text' | 'voice'; position: number; category_id: string | null; slow_mode_seconds: number;
      max_participants: number | null; bitrate: number | null; version: number; archived_at: Date | null;
    }>('select id, name, type, position, category_id, slow_mode_seconds, max_participants, bitrate, version, archived_at from server_channels where server_id = $1 order by position, name', [serverId]);
    return result.rows.map((row) => ({ id: row.id, name: row.name, type: row.type, position: row.position, categoryId: row.category_id, slowModeSeconds: row.slow_mode_seconds, maxParticipants: row.max_participants, bitrate: row.bitrate, version: row.version, archivedAt: row.archived_at?.toISOString() ?? null }));
  }

  async updateChannel(serverId: string, channelId: string, input: { name?: string | undefined; position?: number | undefined; categoryId?: string | null | undefined; slowModeSeconds?: number | undefined; maxParticipants?: number | null | undefined; bitrate?: number | null | undefined; archived?: boolean | undefined; version: number }, now: Date): Promise<boolean> {
    const result = await this.pool.query(`
      update server_channels set name = coalesce($3, name), position = coalesce($4, position),
        category_id = case when $5 then $6 else category_id end, slow_mode_seconds = coalesce($7, slow_mode_seconds),
        max_participants = case when $8 then $9 else max_participants end, bitrate = case when $10 then $11 else bitrate end,
        archived_at = case when $12::boolean is null then archived_at when $12 then $13 else null end,
        version = version + 1, updated_at = $13
      where server_id = $1 and id = $2 and version = $14
        and ($6::uuid is null or exists (select 1 from server_channel_categories category where category.id = $6 and category.server_id = $1))
    `, [serverId, channelId, input.name, input.position, input.categoryId !== undefined, input.categoryId ?? null, input.slowModeSeconds, input.maxParticipants !== undefined, input.maxParticipants ?? null, input.bitrate !== undefined, input.bitrate ?? null, input.archived ?? null, now, input.version]);
    return result.rowCount === 1;
  }

  async listInvites(serverId: string): Promise<ServerInviteSettings[]> {
    const result = await this.pool.query<{
      id: string; created_by_user_id: string | null; created_by_display_name: string | null; destination_channel_id: string | null;
      token_preview: string; expires_at: Date | null; max_uses: number | null; use_count: number; revoked_at: Date | null; created_at: Date;
    }>(`
      select invite.id, invite.created_by_user_id, creator.display_name as created_by_display_name, invite.destination_channel_id,
        invite.token_preview, invite.expires_at, invite.max_uses, invite.use_count, invite.revoked_at, invite.created_at
      from server_invites invite left join users creator on creator.id = invite.created_by_user_id
      where invite.server_id = $1 order by invite.created_at desc
    `, [serverId]);
    return result.rows.map((row) => ({ id: row.id, createdByUserId: row.created_by_user_id, createdByDisplayName: row.created_by_display_name ?? 'Удалённый пользователь', destinationChannelId: row.destination_channel_id, tokenPreview: row.token_preview, expiresAt: row.expires_at?.toISOString() ?? null, maxUses: row.max_uses, useCount: row.use_count, revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.created_at.toISOString() }));
  }

  async createInvite(input: { id: string; serverId: string; actorUserId: string; destinationChannelId: string | null; tokenHash: string; tokenPreview: string; expiresAt: Date | null; maxUses: number | null; now: Date }): Promise<ServerInviteSettings> {
    const result = await this.pool.query<{
      id: string; created_by_user_id: string | null; destination_channel_id: string | null; token_preview: string; expires_at: Date | null;
      max_uses: number | null; use_count: number; revoked_at: Date | null; created_at: Date;
    }>(`
      insert into server_invites (id, server_id, created_by_user_id, destination_channel_id, token_hash, token_preview, expires_at, max_uses, use_count, created_at)
      select $1, $2, $3, $4, $5, $6, $7, $8, 0, $9
      where $4::uuid is null or exists (select 1 from server_channels where id = $4 and server_id = $2 and archived_at is null)
      returning id, created_by_user_id, destination_channel_id, token_preview, expires_at, max_uses, use_count, revoked_at, created_at
    `, [input.id, input.serverId, input.actorUserId, input.destinationChannelId, input.tokenHash, input.tokenPreview, input.expiresAt, input.maxUses, input.now]);
    const row = result.rows[0];
    if (!row) throw new Error('Invalid invite destination');
    return { id: row.id, createdByUserId: row.created_by_user_id, createdByDisplayName: '', destinationChannelId: row.destination_channel_id, tokenPreview: row.token_preview, expiresAt: row.expires_at?.toISOString() ?? null, maxUses: row.max_uses, useCount: row.use_count, revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.created_at.toISOString() };
  }

  async revokeInvite(serverId: string, inviteId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query('update server_invites set revoked_at = coalesce(revoked_at, $3) where server_id = $1 and id = $2', [serverId, inviteId, now]);
    return result.rowCount === 1;
  }

  async revokeAllInvites(serverId: string, now: Date): Promise<number> {
    const result = await this.pool.query('update server_invites set revoked_at = $2 where server_id = $1 and revoked_at is null', [serverId, now]);
    return result.rowCount ?? 0;
  }

  async consumeInvite(tokenHash: string, now: Date): Promise<{ serverId: string; destinationChannelId: string | null } | null> {
    const result = await this.pool.query<{ server_id: string; destination_channel_id: string | null }>(`
      update server_invites set use_count = use_count + 1
      where token_hash = $1 and revoked_at is null and (expires_at is null or expires_at > $2)
        and (max_uses is null or use_count < max_uses)
      returning server_id, destination_channel_id
    `, [tokenHash, now]);
    const row = result.rows[0];
    return row ? { serverId: row.server_id, destinationChannelId: row.destination_channel_id } : null;
  }

  async getModeration(serverId: string): Promise<ServerModerationSettings | null> {
    const result = await this.pool.query<{ verification_level: ServerModerationSettings['verificationLevel']; new_member_restriction_minutes: number; message_rate_limit_per_minute: number; mention_limit_per_message: number; rules: string | null; version: number }>(
      'select verification_level, new_member_restriction_minutes, message_rate_limit_per_minute, mention_limit_per_message, rules, version from servers where id = $1', [serverId],
    );
    const row = result.rows[0];
    return row ? { verificationLevel: row.verification_level, newMemberRestrictionMinutes: row.new_member_restriction_minutes, messageRateLimitPerMinute: row.message_rate_limit_per_minute, mentionLimitPerMessage: row.mention_limit_per_message, rules: row.rules, version: row.version } : null;
  }

  async updateModeration(serverId: string, input: ServerModerationUpdate, now: Date): Promise<boolean> {
    const result = await this.pool.query(`
      update servers set verification_level = $2, new_member_restriction_minutes = $3, message_rate_limit_per_minute = $4,
        mention_limit_per_message = $5, rules = $6, version = version + 1, updated_at = $7 where id = $1 and version = $8
    `, [serverId, input.verificationLevel, input.newMemberRestrictionMinutes, input.messageRateLimitPerMinute, input.mentionLimitPerMessage, input.rules, now, input.version]);
    return result.rowCount === 1;
  }

  async listBans(serverId: string): Promise<ServerBanSettings[]> {
    const result = await this.pool.query<{ user_id: string; display_name: string | null; actor_user_id: string | null; actor_display_name: string | null; reason: string; created_at: Date }>(`
      select ban.user_id, target.display_name, ban.actor_user_id, actor.display_name as actor_display_name, ban.reason, ban.created_at
      from server_bans ban join users target on target.id = ban.user_id left join users actor on actor.id = ban.actor_user_id
      where ban.server_id = $1 and ban.revoked_at is null order by ban.created_at desc
    `, [serverId]);
    return result.rows.map((row) => ({ userId: row.user_id, displayName: row.display_name ?? 'Удалённый пользователь', actorUserId: row.actor_user_id, actorDisplayName: row.actor_display_name ?? 'Удалённый пользователь', reason: row.reason, createdAt: row.created_at.toISOString() }));
  }

  async banMember(serverId: string, userId: string, actorUserId: string, reason: string, now: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const exists = await client.query('select 1 from server_members where server_id = $1 and user_id = $2 for update', [serverId, userId]);
      if (exists.rowCount !== 1) { await client.query('rollback'); return false; }
      await client.query(`insert into server_bans (server_id, user_id, actor_user_id, reason, created_at, revoked_at, revoked_by_user_id)
        values ($1, $2, $3, $4, $5, null, null) on conflict (server_id, user_id) do update set actor_user_id = excluded.actor_user_id,
        reason = excluded.reason, created_at = excluded.created_at, revoked_at = null, revoked_by_user_id = null`, [serverId, userId, actorUserId, reason, now]);
      await client.query('delete from server_members where server_id = $1 and user_id = $2', [serverId, userId]);
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async unbanMember(serverId: string, userId: string, actorUserId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query('update server_bans set revoked_at = $3, revoked_by_user_id = $4 where server_id = $1 and user_id = $2 and revoked_at is null', [serverId, userId, now, actorUserId]);
    return result.rowCount === 1;
  }

  async listAudit(serverId: string, input: { before: Date | null; action: string | null; actorUserId: string | null; limit: number }): Promise<ServerAuditLogPage> {
    const result = await this.pool.query<{
      id: string; server_id: string; actor_user_id: string | null; actor_display_name: string | null; action: string; target_type: string;
      target_id: string | null; before: unknown; after: unknown; created_at: Date;
    }>(`
      select audit.id, audit.server_id, audit.actor_user_id, actor.display_name as actor_display_name, audit.action, audit.target_type,
        audit.target_id, audit.before, audit.after, audit.created_at
      from server_audit_logs audit left join users actor on actor.id = audit.actor_user_id
      where audit.server_id = $1 and ($2::timestamptz is null or audit.created_at < $2)
        and ($3::text is null or audit.action = $3) and ($4::uuid is null or audit.actor_user_id = $4)
      order by audit.created_at desc, audit.id desc limit $5
    `, [serverId, input.before, input.action, input.actorUserId, input.limit + 1]);
    const hasMore = result.rows.length > input.limit;
    const rows = result.rows.slice(0, input.limit);
    return {
      entries: rows.map((row) => ({ id: row.id, serverId: row.server_id, actorUserId: row.actor_user_id, actorDisplayName: row.actor_display_name ?? 'Система', action: row.action, targetType: row.target_type, targetId: row.target_id, before: row.before, after: row.after, createdAt: row.created_at.toISOString() })),
      nextCursor: hasMore ? rows.at(-1)?.created_at.toISOString() ?? null : null,
    };
  }

  async transferOwnership(serverId: string, currentOwnerId: string, nextOwnerId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(`update servers set owner_user_id = $3, version = version + 1, updated_at = $4
      where id = $1 and owner_user_id = $2 and exists (select 1 from server_members where server_id = $1 and user_id = $3)`, [serverId, currentOwnerId, nextOwnerId, now]);
    return result.rowCount === 1;
  }

  async setArchived(serverId: string, ownerId: string, archived: boolean, now: Date): Promise<boolean> {
    const result = await this.pool.query('update servers set archived_at = $3, version = version + 1, updated_at = $4 where id = $1 and owner_user_id = $2', [serverId, ownerId, archived ? now : null, now]);
    return result.rowCount === 1;
  }

  async deleteServer(serverId: string, ownerId: string): Promise<boolean> {
    const result = await this.pool.query('delete from servers where id = $1 and owner_user_id = $2', [serverId, ownerId]);
    return result.rowCount === 1;
  }
}

export function createServerSettingsStore(databaseUrl: string): ServerSettingsStore {
  return new ServerSettingsStore(new pg.Pool({ connectionString: databaseUrl }));
}
