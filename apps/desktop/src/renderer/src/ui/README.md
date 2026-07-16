# Vatrushka UI foundations

This directory is the isolated migration target for the Vatrushka design system. Stage 1 does not import it from the current production `App.tsx`, so existing auth, voice, screen sharing and LiveKit flows remain unchanged.

## Commands

- `npm run storybook` — local component catalog on port 6006;
- `npm run test:storybook` — interaction and accessibility tests in Chromium;
- `npm run build:storybook` — static catalog build;
- `npm run test:visual` — compare the local Playwright screenshot baselines.

Colors, typography, spacing, radius, elevation and motion values must come from `foundations/tokens.css`. Components receive Electron, API and LiveKit integrations through props or adapters; Storybook uses the mocks in `testing/`.
