export const UPDATE_START_DELAY_MS = 0;
export const UPDATE_INTERVAL_MS = 15 * 60 * 1_000;
export const UPDATE_ACTIVITY_COOLDOWN_MS = 5 * 60 * 1_000;
export const UPDATE_CHECK_TIMEOUT_MS = 30_000;
export const UPDATE_RETRY_DELAY_MS = 60_000;

export function isUpdateCheckDue(
  lastCheckStartedAt: number | null,
  now = Date.now(),
  cooldownMs = UPDATE_ACTIVITY_COOLDOWN_MS,
): boolean {
  if (lastCheckStartedAt === null) return true;
  const elapsed = now - lastCheckStartedAt;
  return elapsed < 0 || elapsed >= cooldownMs;
}
