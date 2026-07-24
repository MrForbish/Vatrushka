# UI Kit migration plan

Status: in progress. The executable visual reference is
`C:\Users\Admin\Desktop\Vatrushka_Home_V2\Vatrushka_React_UI_Kit`.

## Evidence and boundaries

| Classification | Item |
| --- | --- |
| Fact | The renderer already has reusable foundations, primitives, `AppShell`, portal-backed modal/drawer/select, and real feature callbacks in `App.tsx`. |
| Fact | `HomePage`, `ServerView`, and `DirectMessagesView` currently each compose their own navigation/profile placement. This does not match the UI Kit global navigation hierarchy. |
| Fact | `MediaSession`, LiveKit connection lifecycle, realtime client, API client, shared contracts, and Electron preload are owned outside the layout components. |
| Assumption | Existing profile-cover API data can be read with the current `GET /users/me/profile` request without adding a contract. |
| Unknown | System DPI 100/125/150% must still be verified on a Windows installed client; browser viewport tests cannot prove native-DPI behaviour. |
| Proposal | Migrate presentation in bounded slices and delete superseded layout branches only after all consumers/tests/stories move. |

## Scenario mapping

| Current scenario | UI Kit block / screen | Existing hook, API, or action | Legacy layout being replaced |
| --- | --- | --- | --- |
| Auth password, registration, OTP, reset | `AuthScreen`: centred auth card | `AuthPanel` and auth lifecycle in `App.tsx` | Current auth panel composition; slice 2 |
| Home dashboard and server library | `HomeScreen`: global sidebar + content workspace | `useHomeDashboard`, `HomePage` callbacks | `HomeNavigation` standalone left panel; slice 2 |
| Server text channel | `ServerScreen`: global sidebar, community context, conversation and member rail | `ServerView`, message/realtime actions in `App.tsx` | Current grid ancestry in `AppShell`; content reconstruction slice 3 |
| Direct message | `DMScreen`: global sidebar, DM list, conversation, inspector | `DirectMessagesView`, conversation mutations | Current profile inside DM list; slice 3 |
| Notification centre | `AppShell` notification overlay | `NotificationCenter`, updater IPC state | Existing top-level placement is retained but attached to the rebuilt toolbar; slice 3 |
| Voice | `VoiceScreen`: participant canvas and compact dock | `RoomView`, `MediaSession` | Deferred: high-risk media presentation slice |
| Source picker | `ScreenShareScreen`: portal modal grid | `SourcePicker`, desktop IPC | Deferred: high-risk media presentation slice |
| User settings | `UserSettingsScreen`: internal nav plus expanded cards | hash routes and `SettingsRoutePage` | Slice 5 |
| Server settings | `ServerSettingsScreen`: internal nav, central cards, right rail | optimistic settings mutations | Slice 5 |
| Auxiliary/loading/error/denied states | nearest UI Kit workspace/card/overlay pattern | Existing feature state and error callbacks | No legacy fallback layout; each is addressed with its owning slice |

## Slice 1 — foundations and common shell

1. Rebuild `AppShell` DOM as global navigation + optional context + workspace column + optional inspector, preserving its public rendering slots.
2. Rework `WorkspaceLibrary` and `UserProfileDock` into the UI Kit global sidebar and bottom profile card. The profile card receives its existing avatar/status/logout/settings callbacks and existing device callbacks; it does not create media state.
3. Add a portalled, keyboard-operable device menu and make the generic primitive popover portal-safe.
4. Read existing profile cover through the already available profile endpoint; no schema or API change.
5. Update stories, interaction coverage, visual baselines, and produce same-viewport reference/product screenshots.

Removal criterion: `ServerContext` and DM conversation list must no longer render their own `UserProfileDock`; search must show no remaining `profile=` prop on `ServerContext` after consumers and stories move.

## Slice 1 screenshot evidence

Reference review used the executable UI Kit shell at
`C:\Users\Admin\Desktop\Vatrushka_Home_V2\Vatrushka_React_UI_Kit`, specifically
`src/components/AppShell.tsx` and its global-sidebar rules in `src/styles.css`.
The product review used the same 1440 x 900 viewport and the Storybook visual
baselines below:

| Product scenario | Baseline | Review result |
| --- | --- | --- |
| Home workspace | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/home-dashboard-win32.png` | Wide global navigation, workspace hierarchy, toolbar and bottom profile card match the UI Kit composition. |
| Direct message | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/direct-messages-active-win32.png` | The profile dock is global, not embedded in the DM list; conversation and participant rails remain separate. |
| User settings | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/settings-shell-user-profile-win32.png` | Existing settings navigation remains visible while the central area uses the rebuilt shell columns. |

The reference and product intentionally contain different real data. This review
therefore compares column hierarchy, spacing, action placement and overlay
behaviour rather than text or fixture content.

## Follow-up slices

1. Auth + Home — rebuild page composition around the common shell and `AuthScreen` / `HomeScreen` references.
2. Server + DM + Notifications — reconstruct the three-column conversation flows and notification centre placement.
3. Voice + screen share — bounded high-risk presentation-only plan with a two-Windows verification matrix before release.
4. User + server settings — preserve internal route navigation and mutations while replacing central layout and rails.
## Slice 2 — Auth + Home

Status: completed locally in this change set. The old split auth hero was removed in favour of the UI Kit's centred card. Home now has a main feed and its own friends rail; the existing version and support actions moved into that rail, so the legacy AppShell inspector is not rendered on Home.

| Current scenario | UI Kit composition | Preserved source/action | Removed legacy layout |
| --- | --- | --- | --- |
| Password login, registration, OTP, recovery and password reset | `AuthScreen` centred card, branded header and segmented auth mode | Existing `AuthPanel` state and callbacks from `App.tsx` | Split hero/art panel and its CSS branch |
| Personal Home with quick return, active spaces, audio readiness and friends | `HomeScreen` main feed plus friends rail | Existing `useHomeDashboard` data and `HomePage` join/message/open callbacks | AppShell Home inspector support column; support/version now live in the Home rail |
| Loading, error and empty Home states | UI Kit card/feed hierarchy | Existing skeleton/error components and retry action | No old fallback screen retained |

### Slice 2 screenshot evidence

The reference review used `src/screens/AuthScreen.tsx`, `src/screens/HomeScreen.tsx` and `src/styles.css` from the executable UI Kit at `C:\Users\Admin\Desktop\Vatrushka_Home_V2\Vatrushka_React_UI_Kit`.

| Viewport / scenario | Product baseline | Review result |
| --- | --- | --- |
| Auth, 1440 × 900 | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/password-login-win32.png` | One centred card, brand/header hierarchy, segmented entry mode and primary action match the UI Kit composition. |
| Auth minimum | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/password-login-minimum-win32.png` | Card remains fully actionable at the documented minimum viewport. |
| Home, 1440 × 900 | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/home-dashboard-win32.png` | Global sidebar, main feed, featured return card and friends rail match the UI Kit column hierarchy; real dashboard data replaces kit fixtures. |
| Home compact | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/home-dashboard-compact-win32.png` | The rail folds with the AppShell responsive behaviour without clipping actions. |

Automated browser checks cover layout viewports, keyboard/aria behaviour and portal interactions. Native Windows scaling at 100/125/150% remains a manual release gate because browser viewport emulation cannot validate Electron DPI.

## Slice 3 — Server, direct messages and notifications

Status: completed locally in this change set. `ServerView` and
`DirectMessagesView` now follow the UI Kit's distinct context, conversation and
inspector columns. The notification centre remains a portalled toolbar overlay;
all message, notification, reconnect and updater callbacks remain the existing
ones.

| Current scenario | UI Kit analogue | Existing renderer source and preserved action |
| --- | --- | --- |
| Server text channel and member list | `ServerScreen`: community context, channel tree, conversation stage and member rail | `ServerView`, `ServerStage`, `MessageList`, existing channel/message/realtime callbacks |
| Direct messages | `DMScreen`: conversation list, active thread and participant inspector | `DirectMessagesView`, existing message mutations, typing and block state |
| Notification centre | UI Kit top-toolbar overlay pattern | `NotificationCenter`, existing updater and notification actions |

Legacy replacement target: the slice will replace the current feature-local column compositions rather than re-skinning them. It will not modify messaging contracts, permission checks, reconnect/reconciliation, updater IPC, or notification payload handling.

## Slice 4 — Voice + screen share presentation

Status: presentation implementation completed locally in this change set. This is a presentation-only slice governed by
`docs/media.md`, `docs/adr/0004-redis-presence-store.md` and
`docs/adr/0006-livekit-confirmed-voice-presence.md`.

| Classification | Finding / decision |
| --- | --- |
| Fact | `RoomView` receives a `MediaSnapshot` from the existing `MediaSession`; it does not own LiveKit connection, capture, token, device, reconnect or screen-audio logic. |
| Fact | `SourcePicker` receives an already serialised `DesktopSourceInfo[]` and calls existing `onSelect` / `onCancel` callbacks. Electron main remains the authority for source availability. |
| Fact | The accepted media model keeps LiveKit authoritative for media presence and Redis additive for voice projection. |
| Proposal | Replace only `RoomView` / `SourcePicker` DOM hierarchy and CSS with the `VoiceScreen` / `ScreenShareScreen` composition: channel heading, connection-quality block, participant canvas and compact dock. |
| Explicitly excluded | `MediaSession`, `getDisplayMedia`, desktop IPC, LiveKit grants, quality/profile selection, system-audio policy, reconnect, voice presence, WebSocket and permissions. |
| Required release evidence | Two Windows clients: join/leave, mute/deafen, device switch, share start/stop/repeat, screen audio, reconnect and source disappearance. Browser/Storybook checks do not replace this manual matrix. |

### Current Voice / screen-share evidence

The reference review used the executable UI Kit's `VoiceScreen.tsx`,
`ScreenShareScreen.tsx`, and their `voice-grid` / `source-grid` rules in
`src/styles.css` at the same 1440 x 900 viewport.

| Product scenario | Product baseline | Result |
| --- | --- | --- |
| Voice room | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/voice-room-devices-win32.png` | The room uses the reference's channel header, compact in-header connection indicator, responsive participant canvas, centred avatar/name/state hierarchy, speaking outline, and compact dock: split microphone/output-device controls plus screen-share and leave actions. Existing `MediaSnapshot` and media actions are unchanged. |
| One participant in voice | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/voice-room-single-participant-win32.png` | The sole participant spans the responsive grid and is centred; no left-aligned incomplete row remains. |
| Server text channel | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-text-channel-win32.png` | The central server workspace now has the reference's community hero, compact server metrics, channel context and conversation stage; the global sidebar is unchanged. |
| Screen-share source picker | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/screen-share-picker-win32.png` | The portalled picker follows the reference's modal hierarchy: source type tabs, visual source cards, quality/system-audio controls, and explicit primary/secondary actions. Existing source-selection and safety callbacks are unchanged. |

Remaining acceptance work for this slice is the installed-Windows two-client
matrix from `docs/testing.md`; it is deliberately not claimed by browser or
Storybook evidence.

## Slice 5 — User + Server Settings

Status: completed locally in this change set. The closest UI Kit analogue is `UserSettingsScreen` for
personal pages and `ServerSettingsScreen` for administration. Existing
`SettingsShell` already owns the required three-zone composition: global
sidebar, internal settings navigation, and a scrollable central workspace.

| Current scenario | UI Kit analogue | Preserved implementation | Legacy replacement |
| --- | --- | --- | --- |
| User profile, presence, notification, audio, privacy, account and security | `UserSettingsScreen` cards within its settings workspace | Existing hash routes, profile/security callbacks and local device preferences | Obsolete onboarding footer in settings navigation; no fallback page layout remains |
| Server overview, appearance, members, roles, channels, invites, moderation, audit and danger area | `ServerSettingsScreen` administration workspace | Existing optimistic settings requests, permission-gated navigation and reauthentication | Feature-local page spacing and card compositions, incrementally within each section |

Constraint: settings remain internal route navigation. The migration must not
collapse, hide or replace sections with UI Kit mock actions, and must not alter
security reauthentication or server permission checks.

### Completed settings workspace composition

`Overview` now has the UI Kit server identity card before the live settings
form. It renders the existing `ServerDetail`/overview data only: cover, icon,
name, description, member count, owner and visibility. `Appearance` uses the
same `CommunityLogo` primitive in its live preview. Upload, reset and save
continue to use their existing API actions and optimistic version.

| Product scenario | Screenshot evidence | Result |
| --- | --- | --- |
| Server overview | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-overview-win32.png` | UI Kit identity hierarchy precedes the existing editable controls. |
| Server appearance | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-appearance-win32.png` | Unified logo/cover preview and real file-picker controls remain keyboard reachable. |
| Server members | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-members-win32.png` | Member identity, own/server alias, role assignment and moderation actions use a responsive four-zone card without changing permission checks. |
| Server channels | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-channels-win32.png` | Text and voice channel controls have distinct responsive grids; the voice limits and archive action no longer compete for one row. |
| Server invites | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-invites-win32.png` | Existing short-link creation and revocation are arranged as distinct creation and active-link cards. |
| Server moderation | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-moderation-win32.png` | Existing member-entry limits and ban management are separated into readable administration cards. |
| Server audit log | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-audit-log-win32.png` | The existing filter and immutable event list now use a distinct filter card and activity rows. |
| Server danger zone | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/server-settings-danger-zone-win32.png` | Existing reauthentication and destructive-action gates remain unchanged inside a clearer confirmation card. |
| User account | `apps/desktop/storybook-e2e/visual.spec.ts-snapshots/user-settings-account-win32.png` | Email, export and deactivation actions retain their current lifecycle while following the common settings workspace. |

## Final verification and removal audit

The complete renderer/UI migration has no permanent `Old`, `Legacy` or `V2`
component branches. The old settings-navigation footer was removed after its
consumers moved. The remaining `legacy` identifiers in `App.tsx` are direct
message compatibility reads required by `docs/technical-specification.md` until
the separately approved canonical-messaging contract phase; they are not UI
layouts and must not be deleted as part of this migration.

Automated evidence for this change set:

| Check | Result |
| --- | --- |
| Desktop typecheck | passed |
| Renderer unit tests | 99 passed |
| Storybook interaction and a11y tests | 87 passed |
| Storybook visual baselines | 46 passed |
| Electron Playwright | 8 passed |

Manual release evidence remains required on a Windows installed client at
100%, 125% and 150% scaling, plus the two-client voice/screen-share matrix
defined in `docs/testing.md`. These native checks cannot be substituted by
browser screenshots.
