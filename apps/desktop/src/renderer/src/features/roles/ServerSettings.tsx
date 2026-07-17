import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type {
  PermissionOverwriteTargetType,
  ServerAuditLogEntry,
  ServerDetail,
  ServerPermission,
  ServerRole,
} from '@vatrushka/shared';

import { Badge, Button, Checkbox, ConfirmDialog, Icon, Input, Modal, Select } from '../../ui';
import { channelPermissionGroups, permissionGroups, rolePresets } from './permission-catalog';
import './server-settings.css';

type SettingsSection = 'roles' | 'channels' | 'audit';
type OverwriteState = 'inherit' | 'allow' | 'deny';

interface RoleUpdate {
  name?: string;
  color?: string;
  permissions?: ServerPermission[];
}

export interface ServerSettingsProps {
  open: boolean;
  server: ServerDetail;
  currentUserId: string;
  auditLog: ServerAuditLogEntry[];
  busy: boolean;
  error: string | null;
  onClose(): void;
  onCreateRole(name: string, color: string, permissions: ServerPermission[]): void;
  onUpdateRole(roleId: string, values: RoleUpdate): void;
  onDeleteRole(roleId: string): void;
  onReorderRole(roleId: string, position: number): void;
  onAssignRoles(userId: string, roleIds: string[]): void;
  onSetChannelOverwrite(channelId: string, targetType: PermissionOverwriteTargetType, targetId: string, allow: ServerPermission[], deny: ServerPermission[]): void;
  onLoadAudit(): void;
}

const auditLabels: Record<string, string> = {
  CHANNEL_CREATED: 'Создан канал',
  CHANNEL_DELETED: 'Удалён канал',
  ROLE_CREATED: 'Создана роль',
  ROLE_UPDATED: 'Изменена роль',
  ROLE_REORDERED: 'Изменён приоритет роли',
  ROLE_DELETED: 'Удалена роль',
  MEMBER_ROLES_UPDATED: 'Изменены роли участника',
  MEMBER_KICKED: 'Участник исключён',
  CHANNEL_OVERWRITE_UPDATED: 'Изменены права канала',
};
const dangerousPermissions = new Set<ServerPermission>(['ADMINISTRATOR', 'MANAGE_ROLES', 'MANAGE_SERVER', 'BAN_MEMBERS', 'MANAGE_2FA_POLICY', 'EXPORT_SERVER_DATA']);

function roleKind(role: ServerRole): 'EVERYONE' | 'OWNER' | 'CUSTOM' {
  if (role.kind !== undefined) return role.kind;
  if (role.isDefault && role.position === 0) return 'EVERYONE';
  if (role.isDefault) return 'OWNER';
  return 'CUSTOM';
}

function summarizeAudit(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') return record.name;
  if (Array.isArray(record.roleIds)) return `${record.roleIds.length} ролей`;
  if (typeof record.position === 'number') return `позиция ${record.position}`;
  if (Array.isArray(record.allow) || Array.isArray(record.deny)) return `разрешено: ${Array.isArray(record.allow) ? record.allow.length : 0}, запрещено: ${Array.isArray(record.deny) ? record.deny.length : 0}`;
  return null;
}

export function ServerSettings(props: ServerSettingsProps): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('roles');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#a86b4b');
  const [rolePermissions, setRolePermissions] = useState<ServerPermission[]>([]);
  const [memberId, setMemberId] = useState('');
  const [memberRoles, setMemberRoles] = useState<string[]>([]);
  const [channelId, setChannelId] = useState('');
  const [targetType, setTargetType] = useState<PermissionOverwriteTargetType>('ROLE');
  const [targetId, setTargetId] = useState('');
  const [overwriteStates, setOverwriteStates] = useState<Partial<Record<ServerPermission, OverwriteState>>>({});
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);

  const roles = useMemo(() => [...props.server.roles].sort((left, right) => right.position - left.position), [props.server.roles]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const currentMember = props.server.members.find((member) => member.userId === props.currentUserId);
  const actorPosition = props.server.ownerUserId === props.currentUserId ? Number.POSITIVE_INFINITY : Math.max(0, ...(currentMember?.roles.map((role) => role.position) ?? []));
  const assignableRoles = roles.filter((role) => roleKind(role) === 'CUSTOM' && role.position < actorPosition);
  const manageableMembers = props.server.members.filter((member) => member.userId !== props.server.ownerUserId && Math.max(0, ...member.roles.map((role) => role.position)) < actorPosition);
  const selectedKind = selectedRole === null ? 'CUSTOM' : roleKind(selectedRole);
  const canEditRole = selectedRole === null || (selectedKind !== 'OWNER' && selectedRole.position < actorPosition);
  const roleDirty = selectedRole === null
    ? roleName.trim().length > 0
    : roleName !== selectedRole.name || roleColor !== selectedRole.color || [...rolePermissions].sort().join('|') !== [...selectedRole.permissions].sort().join('|');
  const channel = props.server.channels.find((candidate) => candidate.id === channelId) ?? null;
  const overwriteTargets = targetType === 'ROLE'
    ? roles.filter((role) => roleKind(role) !== 'OWNER' && (roleKind(role) === 'EVERYONE' || role.position < actorPosition)).map((role) => ({ value: role.id, label: role.name }))
    : manageableMembers.map((member) => ({ value: member.userId, label: member.displayName }));

  useEffect(() => {
    if (!props.open) return;
    setSelectedRoleId((current) => current !== null && props.server.roles.some((role) => role.id === current) ? current : roles.find((role) => roleKind(role) === 'CUSTOM')?.id ?? roles.find((role) => roleKind(role) === 'EVERYONE')?.id ?? null);
    setChannelId((current) => props.server.channels.some((item) => item.id === current) ? current : props.server.channels[0]?.id ?? '');
  }, [props.open, props.server.id, props.server.roles, props.server.channels, roles]);

  useEffect(() => {
    if (selectedRole === null) return;
    setRoleName(selectedRole.name);
    setRoleColor(selectedRole.color);
    setRolePermissions(selectedRole.permissions);
  }, [selectedRole]);

  useEffect(() => {
    if (memberId === '') return;
    const member = props.server.members.find((candidate) => candidate.userId === memberId);
    if (member === undefined) return;
    setMemberRoles(member.roles.filter((role) => roleKind(role) === 'CUSTOM').map((role) => role.id));
  }, [memberId, props.server.members]);

  useEffect(() => {
    const firstTarget = overwriteTargets[0]?.value ?? '';
    setTargetId((current) => overwriteTargets.some((target) => target.value === current) ? current : firstTarget);
  }, [targetType, props.server.id, roles, props.server.members]);

  useEffect(() => {
    const overwrite = channel?.permissionOverwrites?.find((candidate) => candidate.targetType === targetType && candidate.targetId === targetId);
    const next: Partial<Record<ServerPermission, OverwriteState>> = {};
    for (const group of channelPermissionGroups) for (const definition of group.permissions) {
      next[definition.permission] = overwrite?.allow.includes(definition.permission) === true ? 'allow' : overwrite?.deny.includes(definition.permission) === true ? 'deny' : 'inherit';
    }
    setOverwriteStates(next);
  }, [channel, targetId, targetType]);

  useEffect(() => {
    if (props.open && section === 'audit') props.onLoadAudit();
  }, [props.open, section]);

  const selectNewRole = (): void => {
    setSelectedRoleId(null);
    setRoleName('');
    setRoleColor('#a86b4b');
    setRolePermissions(['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'SPEAK']);
  };

  const applyPreset = (preset: (typeof rolePresets)[number]): void => {
    setSelectedRoleId(null);
    setRoleName(preset.label);
    setRoleColor(preset.color);
    setRolePermissions(preset.permissions.filter((permission) => props.server.permissions.includes(permission)));
  };

  const togglePermission = (permission: ServerPermission, checked: boolean): void => {
    if (permission === 'ADMINISTRATOR' && checked) {
      setConfirmAdmin(true);
      return;
    }
    setRolePermissions((current) => checked ? [...new Set([...current, permission])] : current.filter((candidate) => candidate !== permission));
  };

  const saveRole = (): void => {
    if (selectedRole === null) props.onCreateRole(roleName.trim(), roleColor, rolePermissions);
    else props.onUpdateRole(selectedRole.id, { ...(selectedKind === 'EVERYONE' ? {} : { name: roleName.trim(), color: roleColor }), permissions: rolePermissions });
  };

  const saveOverwrite = (): void => {
    if (channel === null || targetId === '') return;
    const entries = Object.entries(overwriteStates) as Array<[ServerPermission, OverwriteState]>;
    props.onSetChannelOverwrite(channel.id, targetType, targetId, entries.filter(([, state]) => state === 'allow').map(([permission]) => permission), entries.filter(([, state]) => state === 'deny').map(([permission]) => permission));
  };

  return (
    <>
      <Modal closeOnBackdrop={false} description={`Роли, доступ к каналам и история изменений · ${props.server.name}`} onClose={props.onClose} open={props.open} size="xl" title="Настройки сервера">
        <div className="vui-settings-layout">
          <nav aria-label="Разделы настроек" className="vui-settings-nav">
            <button aria-current={section === 'roles' ? 'page' : undefined} onClick={() => setSection('roles')} type="button"><Icon name="users" size={18} /><span>Роли</span></button>
            <button aria-current={section === 'channels' ? 'page' : undefined} onClick={() => setSection('channels')} type="button"><Icon name="hash" size={18} /><span>Права каналов</span></button>
            <button aria-current={section === 'audit' ? 'page' : undefined} onClick={() => setSection('audit')} type="button"><Icon name="info" size={18} /><span>Журнал аудита</span></button>
          </nav>

          {section === 'roles' ? (
            <div className="vui-role-settings">
              <aside aria-label="Иерархия ролей" className="vui-role-hierarchy">
                <div className="vui-settings-heading"><div><span className="vui-eyebrow">Иерархия</span><h3>Роли сервера</h3></div><Button icon="plus" onClick={selectNewRole} size="sm" variant="secondary">Новая</Button></div>
                <div className="vui-role-presets" aria-label="Шаблоны ролей">{rolePresets.map((preset) => <button key={preset.id} onClick={() => applyPreset(preset)} type="button">{preset.label}</button>)}</div>
                <div className="vui-settings-role-list">
                  {roles.map((role, index) => {
                    const kind = roleKind(role);
                    const movable = kind === 'CUSTOM' && role.position < actorPosition;
                    return <div className="vui-settings-role-row" data-active={selectedRoleId === role.id || undefined} data-dragging={draggedRoleId === role.id || undefined} draggable={movable} key={role.id} onDragEnd={() => setDraggedRoleId(null)} onDragOver={(event) => { if (movable && draggedRoleId !== null && draggedRoleId !== role.id) event.preventDefault(); }} onDragStart={() => setDraggedRoleId(role.id)} onDrop={() => { if (draggedRoleId !== null && draggedRoleId !== role.id && movable) props.onReorderRole(draggedRoleId, role.position); setDraggedRoleId(null); }}>
                      <button className="vui-settings-role-select" onClick={() => setSelectedRoleId(role.id)} type="button"><i style={{ '--role-color': role.color } as CSSProperties} /><span><strong>{role.name}</strong><small>{role.permissions.length} прав</small></span>{kind === 'OWNER' ? <Badge tone="founder">Владелец</Badge> : kind === 'EVERYONE' ? <Badge>Все</Badge> : null}</button>
                      {movable ? <span className="vui-role-order"><button aria-label={`Поднять роль ${role.name}`} disabled={index === 0 || roleKind(roles[index - 1]!) !== 'CUSTOM' || (roles[index - 1]?.position ?? Number.POSITIVE_INFINITY) >= actorPosition} onClick={() => props.onReorderRole(role.id, roles[index - 1]?.position ?? role.position)} type="button">↑</button><button aria-label={`Опустить роль ${role.name}`} disabled={index === roles.length - 1 || roleKind(roles[index + 1]!) !== 'CUSTOM' || role.position <= 1} onClick={() => props.onReorderRole(role.id, roles[index + 1]?.position ?? role.position)} type="button">↓</button></span> : null}
                    </div>;
                  })}
                </div>
              </aside>

              <main className="vui-role-permissions">
                <div className="vui-settings-heading"><div><span className="vui-eyebrow">{selectedRole === null ? 'Новая роль' : 'Разрешения'}</span><h3>{selectedRole === null ? 'Создание роли' : selectedRole.name}</h3></div>{rolePermissions.includes('ADMINISTRATOR') ? <Badge tone="danger">Полный доступ</Badge> : null}</div>
                <div className="vui-role-identity">
                  <Input disabled={!canEditRole || selectedKind === 'EVERYONE'} label="Название" maxLength={40} minLength={1} onChange={(event) => setRoleName(event.target.value)} value={roleName} />
                  <label><span>Цвет</span><input aria-label="Цвет роли" disabled={!canEditRole || selectedKind === 'EVERYONE'} onChange={(event) => setRoleColor(event.target.value)} type="color" value={roleColor} /></label>
                </div>
                {selectedKind === 'OWNER' ? <div className="vui-settings-notice"><Icon name="lock" /><span><strong>Системная роль владельца</strong><small>Она всегда имеет полный доступ и не редактируется.</small></span></div> : null}
                {permissionGroups.map((group) => <section className="vui-permission-section" key={group.id}><h4>{group.label}</h4><div>{group.permissions.map((definition) => <Checkbox checked={rolePermissions.includes(definition.permission)} className={dangerousPermissions.has(definition.permission) ? 'vui-permission-dangerous' : undefined} description={definition.description} disabled={!canEditRole || (!props.server.permissions.includes(definition.permission) && !rolePermissions.includes(definition.permission))} key={definition.permission} label={definition.label} onChange={(event) => togglePermission(definition.permission, event.target.checked)} />)}</div></section>)}
                <div className="vui-settings-savebar"><span>{roleDirty ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.'}</span>{selectedRole !== null && selectedKind === 'CUSTOM' && canEditRole ? <Button onClick={() => setConfirmDelete(true)} variant="danger">Удалить</Button> : null}<Button disabled={!canEditRole || !roleDirty || roleName.trim().length === 0} loading={props.busy} onClick={saveRole}>{selectedRole === null ? 'Создать роль' : 'Сохранить'}</Button></div>
              </main>

              <aside aria-label="Назначение ролей" className="vui-role-inspector">
                <span className="vui-eyebrow">Участники</span><h3>Назначение ролей</h3>
                <Select label="Участник" onChange={(event) => setMemberId(event.target.value)} options={[{ value: '', label: 'Выберите участника' }, ...manageableMembers.map((member) => ({ value: member.userId, label: member.displayName }))]} value={memberId} />
                {memberId === '' ? <p className="vui-settings-empty">Выберите участника, чтобы изменить его роли.</p> : <div className="vui-member-role-list">{assignableRoles.map((role) => <Checkbox checked={memberRoles.includes(role.id)} key={role.id} label={role.name} onChange={(event) => setMemberRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} />)}<Button loading={props.busy} onClick={() => props.onAssignRoles(memberId, memberRoles)}>Сохранить роли</Button></div>}
                <div className="vui-settings-notice vui-settings-notice--warning"><Icon name="warning" /><span><strong>Порядок имеет значение</strong><small>Участник может управлять только ролями, расположенными ниже его самой высокой роли.</small></span></div>
              </aside>
            </div>
          ) : section === 'channels' ? (
            <div className="vui-channel-settings">
              <div className="vui-settings-page-title"><span className="vui-eyebrow">Перезаписи</span><h3>Права конкретного канала</h3><p>«Наследовать» использует роль сервера. Запрет имеет приоритет над разрешениями ролей, а персональное разрешение — над запретом роли.</p></div>
              <div className="vui-overwrite-toolbar">
                <Select label="Канал" onChange={(event) => setChannelId(event.target.value)} options={props.server.channels.map((item) => ({ value: item.id, label: `${item.type === 'text' ? '#' : '◉'} ${item.name}` }))} value={channelId} />
                <Select label="Тип назначения" onChange={(event) => setTargetType(event.target.value as PermissionOverwriteTargetType)} options={[{ value: 'ROLE', label: 'Роль' }, { value: 'MEMBER', label: 'Участник' }]} value={targetType} />
                <Select label={targetType === 'ROLE' ? 'Роль' : 'Участник'} onChange={(event) => setTargetId(event.target.value)} options={overwriteTargets.length === 0 ? [{ value: '', label: 'Нет доступных назначений' }] : overwriteTargets} value={targetId} />
              </div>
              <div className="vui-overwrite-groups">{channelPermissionGroups.map((group) => <section key={group.id}><h4>{group.label}</h4>{group.permissions.map((definition) => <div className="vui-overwrite-row" key={definition.permission}><span><strong>{definition.label}</strong><small>{definition.description}</small></span><div aria-label={`Право ${definition.label}`} role="group">{(['inherit', 'allow', 'deny'] as const).map((state) => <button aria-pressed={overwriteStates[definition.permission] === state} className={`vui-overwrite-state vui-overwrite-state--${state}`} key={state} onClick={() => setOverwriteStates((current) => ({ ...current, [definition.permission]: state }))} type="button">{state === 'inherit' ? 'Наследовать' : state === 'allow' ? 'Разрешить' : 'Запретить'}</button>)}</div></div>)}</section>)}</div>
              <div className="vui-settings-savebar"><span>Чтобы удалить перезапись, оставьте все права в состоянии «Наследовать».</span><Button disabled={channel === null || targetId === ''} loading={props.busy} onClick={saveOverwrite}>Сохранить права канала</Button></div>
            </div>
          ) : (
            <div className="vui-audit-settings">
              <div className="vui-settings-page-title"><span className="vui-eyebrow">Безопасность</span><h3>Журнал аудита</h3><p>Административные изменения ролей, каналов и участников. Записи нельзя отредактировать из клиента.</p></div>
              <div className="vui-audit-list">{props.auditLog.length === 0 ? <div className="vui-settings-empty-state"><Icon name="info" size={32} /><strong>Изменений пока нет</strong><span>Новые административные действия появятся здесь.</span></div> : props.auditLog.map((entry) => { const before = summarizeAudit(entry.before); const after = summarizeAudit(entry.after); return <article key={entry.id}><span className="vui-audit-icon"><Icon name="settings" size={18} /></span><div><strong>{auditLabels[entry.action] ?? entry.action}</strong><p>{entry.actorDisplayName} · {entry.targetType.toLowerCase()}</p>{before === null && after === null ? null : <small>{before === null ? 'Создано' : before}{after === null ? ' → удалено' : ` → ${after}`}</small>}</div><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time></article>; })}</div>
            </div>
          )}
          {props.error === null ? null : <div className="vui-settings-error" role="alert">{props.error}</div>}
        </div>
      </Modal>

      <ConfirmDialog confirmLabel="Дать полный доступ" danger description="Администратор обходит все ограничения сервера и каналов. Назначайте это право только тем, кому полностью доверяете." onClose={() => setConfirmAdmin(false)} onConfirm={() => { setRolePermissions((current) => [...new Set<ServerPermission>([...current, 'ADMINISTRATOR'])]); setConfirmAdmin(false); }} open={confirmAdmin} title="Включить право администратора?" />
      <ConfirmDialog confirmLabel="Удалить роль" danger description={`Роль «${selectedRole?.name ?? ''}» будет снята со всех участников. Это действие попадёт в журнал аудита.`} loading={props.busy} onClose={() => setConfirmDelete(false)} onConfirm={() => { if (selectedRole !== null) props.onDeleteRole(selectedRole.id); setConfirmDelete(false); }} open={confirmDelete} title="Удалить роль?" />
    </>
  );
}
