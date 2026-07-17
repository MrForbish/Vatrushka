function booleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

const e2ePreview = import.meta.env.MODE === 'e2e' && typeof window !== 'undefined' && window.location.hash.includes('settingsPreview=1');
const developmentDefault = import.meta.env.DEV || e2ePreview;

export const featureFlags = Object.freeze({
  serverSettingsPage: booleanFlag(import.meta.env.VITE_FEATURE_SERVER_SETTINGS_PAGE, developmentDefault),
  userSettingsPage: booleanFlag(import.meta.env.VITE_FEATURE_USER_SETTINGS_PAGE, developmentDefault),
  presenceStatuses: booleanFlag(import.meta.env.VITE_FEATURE_PRESENCE_STATUSES, developmentDefault),
});

export type FeatureFlags = typeof featureFlags;
