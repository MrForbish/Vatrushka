# Hawk error monitoring

Hawk complements Loki, Prometheus, and Grafana: it groups exceptions and shows stacks/releases; Loki remains the source for structured logs and correlation by `requestId`; Prometheus/Grafana remain the source for metrics and alerts.

## Safety model

The API integration is disabled by default. Enable it only after the Hawk API project is created and its Integration Token is stored in production secrets:

```text
HAWK_ENABLED=true
HAWK_API_TOKEN=<protected value>
HAWK_ENVIRONMENT=production
HAWK_RELEASE=<immutable application version>
HAWK_USER_HASH_SECRET=<separate 32+ character secret>
```

Never commit these values or put them in build arguments. The reporter removes sensitive fields and URL/query secrets, disables breadcrumbs, hashes the affected-user identifier with HMAC, and treats Hawk transport failures as no-ops. Expected 4xx responses are not reported; unexpected 5xx responses include only `requestId`, route template, status, and error code.

## Rollout

1. Create three projects in Hawk Garage: API, Desktop Main, Desktop Renderer.
2. Add separate protected tokens. Do not reuse a token between projects.
3. Enable API first, perform a synthetic staging event, and inspect it for sensitive data.
4. Enable Desktop Main in RC, then Renderer only after confirming browser-token exposure is acceptable to Hawk support.
5. Configure notifications for new critical events only.

## Incident response

On suspected disclosure, set the relevant `*_ENABLED=false`, revoke the Integration Token, remove the event through Hawk support, and inspect Loki using the safe correlation field. Hawk unavailability must not affect API readiness or desktop operation.

## Licensing

The Hawk Node.js and Browser catchers are AGPL-3.0-only. Their use in Vatrushka was explicitly accepted by the project owner on 2026-07-20. Reassess this decision before any redistribution or licensing change.
