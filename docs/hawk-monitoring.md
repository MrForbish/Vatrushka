# Hawk error monitoring

Hawk complements Loki, Prometheus, and Grafana: it groups exceptions and shows stacks/releases; Loki remains the source for structured logs and correlation by `requestId`; Prometheus/Grafana remain the source for metrics and alerts.

## Safety model

The API integration is disabled by default. Enable it only after the Hawk API project is created and its Integration Token is stored in production secrets:

```text
HAWK_ENABLED=true
HAWK_INTEGRATION_TOKEN=<protected value>
HAWK_ENVIRONMENT=production
HAWK_RELEASE=<immutable application version>
HAWK_USER_HASH_SECRET=<separate 32+ character secret>
```

Never commit these values or put them in build arguments. The reporter removes sensitive fields and URL/query secrets, disables breadcrumbs, hashes the affected-user identifier with HMAC, and treats Hawk transport failures as no-ops. Expected 4xx responses are not reported; unexpected 5xx responses include only `requestId`, route template, status, and error code.

## Rollout

1. Create three projects in Hawk Garage: API, Desktop Main, Desktop Renderer.
2. Add separate protected tokens. Do not reuse a token between projects.
3. Store `HAWK_INTEGRATION_TOKEN` as a protected GitLab CI/CD variable. The Windows release build embeds it only into the main/renderer catchers; it is never read by the API container.
4. In the production API `.env`, set `HAWK_ENABLED=true`, `HAWK_INTEGRATION_TOKEN`, `HAWK_RELEASE` and `HAWK_USER_HASH_SECRET`.
5. To prove delivery once, set `HAWK_STARTUP_SMOKE_TEST=true`, restart the API, find the single `Hawk startup smoke test` event, then immediately set it back to `false` and restart the API again. The API metric `hawk_reporter_enabled{runtime="api"}` must be `1`; `hawk_events_submit_attempts_total{result="submitted"}` confirms that the catcher accepted the smoke event for delivery. These metrics do not claim that Hawk has received it: confirm the event in Hawk before disabling the smoke test.
6. Enable Desktop Main in RC, then Renderer only after confirming browser-token exposure is acceptable to Hawk support.
7. Configure notifications for new critical events only.

## What “No one catcher connected” means

Hawk catchers do not keep a permanent socket connection. They submit HTTPS only
when an exception is caught. Consequently an empty event list and that status
can simply mean no event has been delivered yet. The smoke test above is the
safe way to distinguish that healthy idle state from a missing token or blocked
outbound HTTPS connection. A production Windows package fails its release
preflight when the required CI variable is absent, rather than silently
shipping a disabled catcher.

## Incident response

On suspected disclosure, set the relevant `*_ENABLED=false`, revoke the Integration Token, remove the event through Hawk support, and inspect Loki using the safe correlation field. Hawk unavailability must not affect API readiness or desktop operation.

## Licensing

The Hawk Node.js and Browser catchers are AGPL-3.0-only. Their use in Vatrushka was explicitly accepted by the project owner on 2026-07-20. Reassess this decision before any redistribution or licensing change.
