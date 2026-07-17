# Vatrushka UI foundations

This directory is the shared production design system for Vatrushka. The routed settings migration extends the existing `AppShell` and lazy-loads its `SettingsShell`; auth, voice, screen sharing and LiveKit remain owned by the mounted top-level application controller.

## Commands

- `npm run storybook` — local component catalog on port 6006;
- `npm run test:storybook` — interaction and accessibility tests in Chromium;
- `npm run build:storybook` — static catalog build;
- `npm run test:visual` — compare the local Playwright screenshot baselines.

Colors, typography, spacing, radius, elevation and motion values must come from `foundations/tokens.css`. Components receive Electron, API and LiveKit integrations through props or adapters; Storybook uses the mocks in `testing/`.
