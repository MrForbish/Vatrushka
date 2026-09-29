# Текущий аудит доставки

Дата: 2026-07-24. Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** canonical remote — GitLab; `develop` default branch; `main`, `develop`, `release/*` и `v*` protected.
- **fact:** `v0.8.21` и pipeline `2701829000` успешны; Release содержит installer, blockmap, `latest.yml`, checksums и metadata.
- **fact:** production tag flow: archive → product runtime → Observer → Windows package → updater publish; `latest.yml` заменяется последним.
- **факт:** текущий GitLab pipeline не имеет среды/работы staging, бета-ленты/работы, канала RC или работы `rollback_production`.
- **вывод:** стабильные клиенты не подвергаются воздействию до текущих контрольных точек API и проверки работоспособности наблюдаемости, но поток всё равно пересоздаёт клиент Windows после развертывания production.
- **Предположение:** бывший хост production может стать изолированной целью staging только после успешной миграции production и переустановки ОС, без повторного использования учетных данных production.
- **неизвестно:** емкость живого хоста, сети, политики корзин, доказательства резервного копирования/восстановления и инвентарь пользователей SSH.
- **предложение:** ввести staging и неизменяемое продвижение в отдельных MR после предварительного инвентаря/доказательств доступа.
