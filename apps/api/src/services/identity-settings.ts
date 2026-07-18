import pg from 'pg';

import type { BlockedUserSettings, UserAccountSettings, UserProfileSettings } from '@vatrushka/shared';

interface ProfileRow {
  id: string; email: string; display_name: string | null; username: string | null; bio: string | null; avatar_object_key: string | null;
  username_changed_at: Date | null; updated_at: Date;
}

export class IdentitySettingsStore {
  constructor(private readonly pool: pg.Pool) {}

  async close(): Promise<void> { await this.pool.end(); }

  async getProfile(userId: string, createUrl: (key: string) => Promise<string>): Promise<UserProfileSettings | null> {
    const result = await this.pool.query<ProfileRow>('select id, email, display_name, username, bio, avatar_object_key, username_changed_at, updated_at from users where id = $1 and deleted_at is null', [userId]);
    const row = result.rows[0];
    if (!row?.display_name) return null;
    return { id: row.id, email: row.email, displayName: row.display_name, username: row.username, bio: row.bio, avatarUrl: row.avatar_object_key ? await createUrl(row.avatar_object_key) : null, usernameChangedAt: row.username_changed_at?.toISOString() ?? null, updatedAt: row.updated_at.toISOString() };
  }

  async updateProfile(userId: string, input: { displayName: string; username: string | null; bio: string | null }, now: Date): Promise<{ updated: boolean }> {
    const result = await this.pool.query(`
      update users set display_name = $2, bio = $3, username = $4,
        username_changed_at = case when username is distinct from $4 then $5 else username_changed_at end, updated_at = $5
      where id = $1 and deleted_at is null and (
        username is not distinct from $4 or username_changed_at is null or username_changed_at <= $5::timestamptz - interval '7 days'
      )
    `, [userId, input.displayName, input.bio, input.username, now]);
    return { updated: result.rowCount === 1 };
  }

  async updateAvatar(userId: string, objectKey: string | null, now: Date): Promise<boolean> {
    const result = await this.pool.query('update users set avatar_object_key = $2, updated_at = $3 where id = $1 and deleted_at is null', [userId, objectKey, now]);
    return result.rowCount === 1;
  }

  async createPendingEmailChange(input: { id: string; userId: string; newEmail: string; codeHash: string; expiresAt: Date; now: Date }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from pending_email_changes where user_id = $1 and consumed_at is null', [input.userId]);
      await client.query(`insert into pending_email_changes (id, user_id, new_email, code_hash, expires_at, consumed_at, created_at)
        values ($1, $2, $3, $4, $5, null, $6)`, [input.id, input.userId, input.newEmail, input.codeHash, input.expiresAt, input.now]);
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async discardPendingEmailChange(userId: string, newEmail: string): Promise<void> {
    await this.pool.query('delete from pending_email_changes where user_id = $1 and new_email = $2 and consumed_at is null', [userId, newEmail]);
  }

  async confirmEmailChange(userId: string, codeHash: string, now: Date): Promise<string | null> {
    const result = await this.pool.query<{ email: string }>(`
      with pending as (
        update pending_email_changes set consumed_at = $3 where user_id = $1 and code_hash = $2 and consumed_at is null and expires_at > $3
        returning new_email
      )
      update users set email = pending.new_email, email_verified_at = $3, updated_at = $3 from pending
      where users.id = $1 returning users.email
    `, [userId, codeHash, now]);
    return result.rows[0]?.email ?? null;
  }

  async listBlockedUsers(userId: string): Promise<BlockedUserSettings[]> {
    const result = await this.pool.query<{ user_id: string; display_name: string | null; username: string | null; created_at: Date }>(`
      select blocked.id as user_id, blocked.display_name, blocked.username, relation.created_at
      from blocked_users relation join users blocked on blocked.id = relation.blocked_user_id
      where relation.blocker_user_id = $1 order by relation.created_at desc
    `, [userId]);
    return result.rows.map((row) => ({ userId: row.user_id, displayName: row.display_name ?? row.username ?? 'Удалённый пользователь', username: row.username, blockedAt: row.created_at.toISOString() }));
  }

  async blockUser(userId: string, blockedUserId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(`insert into blocked_users (blocker_user_id, blocked_user_id, created_at)
      select $1, $2, $3 where $1 <> $2 and exists (select 1 from users where id = $2 and deleted_at is null)
      on conflict (blocker_user_id, blocked_user_id) do nothing`, [userId, blockedUserId, now]);
    return result.rowCount === 1;
  }

  async unblockUser(userId: string, blockedUserId: string): Promise<boolean> {
    const result = await this.pool.query('delete from blocked_users where blocker_user_id = $1 and blocked_user_id = $2', [userId, blockedUserId]);
    return result.rowCount === 1;
  }

  async areUsersBlocked(firstUserId: string, secondUserId: string): Promise<boolean> {
    const result = await this.pool.query<{ blocked: boolean }>(`select exists(select 1 from blocked_users where
      (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1)) as blocked`, [firstUserId, secondUserId]);
    return result.rows[0]?.blocked ?? false;
  }

  async getAccount(userId: string): Promise<UserAccountSettings | null> {
    const result = await this.pool.query<{ email: string; email_verified_at: Date | null; pending_email: string | null; deactivation_scheduled_at: Date | null; owns_servers: boolean }>(`
      select user_record.email, user_record.email_verified_at, pending.new_email as pending_email, user_record.deactivation_scheduled_at,
        exists(select 1 from servers where owner_user_id = user_record.id) as owns_servers
      from users user_record left join lateral (
        select new_email from pending_email_changes where user_id = user_record.id and consumed_at is null and expires_at > now() order by created_at desc limit 1
      ) pending on true where user_record.id = $1 and user_record.deleted_at is null
    `, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    const deletionAt = row.deactivation_scheduled_at ? new Date(row.deactivation_scheduled_at.getTime() + 14 * 86_400_000).toISOString() : null;
    return { email: row.email, emailVerified: row.email_verified_at !== null, pendingEmail: row.pending_email, deactivationScheduledAt: row.deactivation_scheduled_at?.toISOString() ?? null, deletionAt, ownsServers: row.owns_servers };
  }

  async scheduleDeactivation(userId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(`update users set deactivation_scheduled_at = $2, updated_at = $2
      where id = $1 and deleted_at is null and not exists (select 1 from servers where owner_user_id = $1)`, [userId, now]);
    return result.rowCount === 1;
  }

  async cancelDeactivation(userId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query('update users set deactivation_scheduled_at = null, updated_at = $2 where id = $1 and deleted_at is null and deactivation_scheduled_at is not null', [userId, now]);
    return result.rowCount === 1;
  }

  async exportPersonalData(userId: string): Promise<Record<string, unknown> | null> {
    const [user, servers, messages, directMessages, securityEvents] = await Promise.all([
      this.pool.query('select id, email, username, display_name, bio, platform_role, created_at, updated_at from users where id = $1 and deleted_at is null', [userId]),
      this.pool.query('select server.id, server.name, member.joined_at, member.nickname from server_members member join servers server on server.id = member.server_id where member.user_id = $1', [userId]),
      this.pool.query('select id, channel_id, content, created_at, edited_at from text_messages where author_user_id = $1 order by created_at', [userId]),
      this.pool.query('select id, conversation_id, content, created_at, edited_at from direct_messages where author_user_id = $1 order by created_at', [userId]),
      this.pool.query('select type, device_name, created_at from security_events where user_id = $1 order by created_at', [userId]),
    ]);
    if (!user.rows[0]) return null;
    return { exportedAt: new Date().toISOString(), profile: user.rows[0], servers: servers.rows, channelMessages: messages.rows, directMessages: directMessages.rows, securityEvents: securityEvents.rows };
  }

  async anonymizeDueAccounts(now: Date): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const due = await client.query<{ id: string; avatar_object_key: string | null }>(`
        select id, avatar_object_key from users where deleted_at is null and deactivation_scheduled_at <= $1 - interval '14 days'
          and not exists (select 1 from servers where owner_user_id = users.id) for update skip locked
      `, [now]);
      for (const account of due.rows) {
        await client.query(`update users set email = 'deleted+' || id || '@deleted.vatrushka.local', username = null, display_name = 'Удалённый пользователь',
          bio = null, avatar_object_key = null, password_hash = null, totp_secret_encrypted = null, two_factor_enabled = false,
          deactivation_scheduled_at = null, deleted_at = $2, updated_at = $2 where id = $1`, [account.id, now]);
        await client.query('update sessions set revoked_at = coalesce(revoked_at, $2) where user_id = $1', [account.id, now]);
        await client.query('delete from user_recovery_codes where user_id = $1', [account.id]);
        await client.query('delete from pending_email_changes where user_id = $1', [account.id]);
        await client.query('delete from blocked_users where blocker_user_id = $1 or blocked_user_id = $1', [account.id]);
        await client.query('delete from server_members where user_id = $1', [account.id]);
      }
      await client.query('commit');
      return due.rowCount ?? 0;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }
}

export class AccountLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly store: IdentitySettingsStore, private readonly onError: (error: unknown) => void = () => undefined) {}
  start(): void {
    if (this.timer) return;
    const run = (): void => { void this.store.anonymizeDueAccounts(new Date()).catch(this.onError); };
    run();
    this.timer = setInterval(run, 60 * 60 * 1000);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export function createIdentitySettingsStore(databaseUrl: string): IdentitySettingsStore {
  return new IdentitySettingsStore(new pg.Pool({ connectionString: databaseUrl }));
}
