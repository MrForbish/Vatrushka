import { roomCodeSchema } from '@vatrushka/shared';

export function parseDeepLink(value: string, protocol: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${protocol}:` || url.hostname !== 'join') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    const parsed = roomCodeSchema.safeParse(segments[0]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function findDeepLink(argv: readonly string[], protocol: string): string | null {
  for (const argument of argv) {
    const code = parseDeepLink(argument, protocol);
    if (code) return code;
  }
  return null;
}
