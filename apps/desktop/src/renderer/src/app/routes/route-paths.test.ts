import { describe, expect, it } from 'vitest';

import { parseSettingsRoute, serverSettingsPath, userSettingsPath } from './route-paths';

describe('settings route paths', () => {
  it('builds and parses canonical user settings paths', () => {
    expect(userSettingsPath()).toBe('/settings/profile');
    expect(parseSettingsRoute('/settings/notifications')).toEqual({ kind: 'user', section: 'notifications', canonicalPath: '/settings/notifications' });
  });

  it('builds and parses canonical server settings paths', () => {
    expect(serverSettingsPath('server id', 'roles')).toBe('/servers/server%20id/settings/roles');
    expect(parseSettingsRoute('/servers/server%20id/settings/roles')).toEqual({ kind: 'server', serverId: 'server id', section: 'roles', canonicalPath: '/servers/server%20id/settings/roles' });
  });

  it('redirects missing and unknown sections to their safe defaults', () => {
    expect(parseSettingsRoute('/settings')).toEqual({ kind: 'invalid', canonicalPath: '/settings/profile' });
    expect(parseSettingsRoute('/settings/unknown')).toEqual({ kind: 'invalid', canonicalPath: '/settings/profile' });
    expect(parseSettingsRoute('/servers/server-1/settings')).toEqual({ kind: 'invalid', canonicalPath: '/servers/server-1/settings/overview' });
    expect(parseSettingsRoute('/servers/server-1/settings/unknown')).toEqual({ kind: 'invalid', canonicalPath: '/servers/server-1/settings/overview' });
  });

  it('does not claim unrelated application paths', () => {
    expect(parseSettingsRoute('/')).toBeNull();
    expect(parseSettingsRoute('/servers/server-1/channels/general')).toBeNull();
  });

  it('recovers from malformed encoded server identifiers', () => {
    expect(parseSettingsRoute('/servers/%E0%A4%A/settings/roles')).toEqual({ kind: 'invalid', canonicalPath: '/' });
  });
});
