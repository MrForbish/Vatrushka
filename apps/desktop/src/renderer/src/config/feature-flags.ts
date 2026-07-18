function booleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

const completedFeatureDefault = true;

export const featureFlags = Object.freeze({
  serverSettingsPage: booleanFlag(import.meta.env.VITE_FEATURE_SERVER_SETTINGS_PAGE, completedFeatureDefault),
  userSettingsPage: booleanFlag(import.meta.env.VITE_FEATURE_USER_SETTINGS_PAGE, completedFeatureDefault),
  presenceStatuses: booleanFlag(import.meta.env.VITE_FEATURE_PRESENCE_STATUSES, completedFeatureDefault),
});

export type FeatureFlags = typeof featureFlags;
