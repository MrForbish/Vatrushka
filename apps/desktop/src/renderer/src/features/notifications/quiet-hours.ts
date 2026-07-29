import type { UserNotificationPreferences } from "@vatrushka/shared";

function minutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

/**
 * Quiet hours intentionally follow the local clock of the current device.
 * A shared account schedule must not force a separate timezone onto a device.
 */
export function quietHoursActive(
  preferences: UserNotificationPreferences | null,
  now = new Date(),
): boolean {
  if (!preferences?.quietHoursStart || !preferences.quietHoursEnd) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(preferences.quietHoursStart);
  const end = minutes(preferences.quietHoursEnd);

  return start <= end
    ? current >= start && current < end
    : current >= start || current < end;
}
