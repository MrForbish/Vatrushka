export const userSettingsSections = [
  'profile',
  'status',
  'notifications',
  'audio',
  'security',
  'sessions',
  'activity',
  'privacy',
  'account',
] as const;

export const serverSettingsSections = [
  'overview',
  'appearance',
  'members',
  'roles',
  'channels',
  'invites',
  'moderation',
  'audit-log',
  'danger',
] as const;

export type UserSettingsSection = (typeof userSettingsSections)[number];
export type ServerSettingsSection = (typeof serverSettingsSections)[number];

export type SettingsRoute =
  | { kind: 'user'; section: UserSettingsSection; canonicalPath: string }
  | { kind: 'server'; serverId: string; section: ServerSettingsSection; canonicalPath: string };

export interface InvalidSettingsRoute {
  kind: 'invalid';
  canonicalPath: string;
}

export function userSettingsPath(section: UserSettingsSection = 'profile'): string {
  return `/settings/${section}`;
}

export function serverSettingsPath(serverId: string, section: ServerSettingsSection = 'overview'): string {
  return `/servers/${encodeURIComponent(serverId)}/settings/${section}`;
}

function isUserSection(value: string): value is UserSettingsSection {
  return (userSettingsSections as readonly string[]).includes(value);
}

function isServerSection(value: string): value is ServerSettingsSection {
  return (serverSettingsSections as readonly string[]).includes(value);
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseSettingsRoute(pathname: string): SettingsRoute | InvalidSettingsRoute | null {
  if (pathname === '/settings' || pathname === '/settings/') {
    return { kind: 'invalid', canonicalPath: userSettingsPath() };
  }
  const userMatch = /^\/settings\/([^/]+)\/?$/u.exec(pathname);
  if (userMatch !== null) {
    const section = userMatch[1]!;
    return isUserSection(section)
      ? { kind: 'user', section, canonicalPath: userSettingsPath(section) }
      : { kind: 'invalid', canonicalPath: userSettingsPath() };
  }

  const serverRootMatch = /^\/servers\/([^/]+)\/settings\/?$/u.exec(pathname);
  if (serverRootMatch !== null) {
    const serverId = decodePathSegment(serverRootMatch[1]!);
    if (serverId === null) return { kind: 'invalid', canonicalPath: '/' };
    return { kind: 'invalid', canonicalPath: serverSettingsPath(serverId) };
  }
  const serverMatch = /^\/servers\/([^/]+)\/settings\/([^/]+)\/?$/u.exec(pathname);
  if (serverMatch === null) return null;
  const serverId = decodePathSegment(serverMatch[1]!);
  if (serverId === null) return { kind: 'invalid', canonicalPath: '/' };
  const section = serverMatch[2]!;
  return isServerSection(section)
    ? { kind: 'server', serverId, section, canonicalPath: serverSettingsPath(serverId, section) }
    : { kind: 'invalid', canonicalPath: serverSettingsPath(serverId) };
}
