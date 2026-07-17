import { serverPermissions, type ChannelPermissionOverwrite, type ServerPermission } from './contracts.js';

export interface PermissionRole {
  id: string;
  isDefault: boolean;
  position: number;
  permissions: readonly ServerPermission[];
}

export interface ResolvePermissionsInput {
  isOwner: boolean;
  userId: string;
  roles: readonly PermissionRole[];
  assignedRoleIds: Iterable<string>;
  overwrites?: readonly ChannelPermissionOverwrite[];
}

function applyOverwrite(current: Set<ServerPermission>, overwrite: Pick<ChannelPermissionOverwrite, 'allow' | 'deny'>): void {
  for (const permission of overwrite.deny) current.delete(permission);
  for (const permission of overwrite.allow) current.add(permission);
}

export function resolveServerPermissions(input: Omit<ResolvePermissionsInput, 'overwrites'>): Set<ServerPermission> {
  if (input.isOwner) return new Set(serverPermissions);
  const assigned = new Set(input.assignedRoleIds);
  const permissions = new Set(input.roles.filter((role) => role.isDefault || assigned.has(role.id)).flatMap((role) => role.permissions));
  return permissions.has('ADMINISTRATOR') ? new Set(serverPermissions) : permissions;
}

export function resolveChannelPermissions(input: ResolvePermissionsInput): Set<ServerPermission> {
  const permissions = resolveServerPermissions(input);
  if (input.isOwner || permissions.has('ADMINISTRATOR')) return permissions;

  const assigned = new Set(input.assignedRoleIds);
  const everyoneRole = input.roles.find((role) => role.isDefault);
  const overwrites = input.overwrites ?? [];
  if (everyoneRole !== undefined) {
    const everyoneOverwrite = overwrites.find((overwrite) => overwrite.targetType === 'ROLE' && overwrite.targetId === everyoneRole.id);
    if (everyoneOverwrite !== undefined) applyOverwrite(permissions, everyoneOverwrite);
  }

  const roleOverwrites = overwrites.filter((overwrite) => overwrite.targetType === 'ROLE' && assigned.has(overwrite.targetId));
  for (const overwrite of roleOverwrites) for (const permission of overwrite.deny) permissions.delete(permission);
  for (const overwrite of roleOverwrites) for (const permission of overwrite.allow) permissions.add(permission);

  const memberOverwrite = overwrites.find((overwrite) => overwrite.targetType === 'MEMBER' && overwrite.targetId === input.userId);
  if (memberOverwrite !== undefined) applyOverwrite(permissions, memberOverwrite);
  return permissions;
}

export function highestRolePosition(isOwner: boolean, roles: readonly PermissionRole[], assignedRoleIds: Iterable<string>): number {
  if (isOwner) return Number.POSITIVE_INFINITY;
  const assigned = new Set(assignedRoleIds);
  return Math.max(0, ...roles.filter((role) => role.isDefault || assigned.has(role.id)).map((role) => role.position));
}
