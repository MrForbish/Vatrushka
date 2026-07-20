## Release

- version: vX.Y.Z
- source: `develop`
- target: `main`
- commit SHA: `<sha>`

## Release evidence

- [ ] full release MR CI passed
- [ ] database upgrade and rollback reviewed
- [ ] release notes and changelog updated
- [ ] production publication is disabled in this MR
- [ ] tag pipeline will deploy API, monitoring and then publish updater

## Migrations and compatibility

- PostgreSQL: none
- Redis keys: none
- S3 lifecycle: none
- env/config: none
- breaking changes: none

## Rollback

<!-- Exact rollback plan for the preceding production version. -->
