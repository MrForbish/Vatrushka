# ADR 0001: Settings routing, shell и feature flags

- Статус: `accepted`
- Дата: `2026-07-17`
- Область применения: пакет функций настроек, Фаза 1

## Контекст

Renderer сейчас не использует router: `App.tsx` переключает `boot/auth/profile/home/server/direct` через локальный `Screen` state. Настройки сервера открываются внутри `ServerSettings`, а безопасность и пользовательские настройки — через модальный `SecurityCenter`. Из-за этого нет deep links, общей локальной навигации, route-level guards и единообразной защиты dirty forms.

Рабочие модалки нельзя удалять до функционального parity и E2E. Backend остаётся единственным источником effective permissions; route guard и скрытие кнопки не являются авторизацией.

## Решение

1. В Phase 2 добавить declarative hash routing для Electron `file://` renderer. Использовать поддерживаемый React-router с `HashRouter`; не писать собственный URL parser. Точную версию зафиксировать вместе с Phase 2 после проверки совместимости с React 19.
2. Ввести типизированные route builders вместо строк, разбросанных по компонентам:

   ```text
   /home
   /servers/:serverId/channels/:channelId?
   /direct/:conversationId?
   /settings/user/:section
   /settings/servers/:serverId/:section
   ```

3. Старый `Screen` flow оставить адаптером до переноса каждого экрана. Старые settings-модалки остаются fallback за выключенным флагом.
4. Создать общий renderer-only `SettingsShell`: глобальная навигация AppShell, локальная section navigation, page header, content outlet и sticky save bar. Shell не выполняет API-запросы и не вычисляет permissions.
5. Dirty-state хранится на уровне конкретной формы. Переход route/window close проходит через единый navigation blocker и `ConfirmDialog`; сохранение и отмена остаются ответственностью feature-модуля.
6. Добавить общий контракт rollout-флагов в `@vatrushka/shared`:

   ```ts
   interface ProductFeatureFlags {
     silentWindowsUpdates: boolean;
     serverSettingsPage: boolean;
     userSettingsPage: boolean;
     memberMentions: boolean;
     presenceStatuses: boolean;
   }
   ```

7. Production flags отдаются авторизованным API runtime-config endpoint и по умолчанию выключены при ошибке загрузки. Dev override разрешён только в локальном renderer env. Ни один flag не обходит backend authorization или schema validation.
8. Runtime config содержит стабильную rollout revision. Renderer регистрирует типизированный exposure только при фактическом показе feature; до появления privacy-reviewed telemetry exposure остаётся локальным диагностическим событием, а не скрытой аналитикой.
9. Разрешения для server routes берутся из уже вычисленного backend `ServerDetail.permissions`. Любая мутация повторно проверяется текущим общим resolver на API.

## Границы Phase 2

- layout, routes, route builders, feature flags, Storybook и navigation tests;
- без новых settings API и миграций БД;
- без удаления `ServerSettings` и `SecurityCenter`;
- первые routes могут показывать read-only placeholder/content adapter, но все интерактивные элементы должны быть реальными или отсутствовать.

## Последствия

- URL становится восстанавливаемым после reload и пригодным для deep links;
- migration может выполняться маленькими PR без одновременной замены `App.tsx`;
- временно существуют route и modal реализации, поэтому обязательны flags и parity tests;
- добавляется одна routing dependency, но уменьшается собственная навигационная логика и риск некорректного back/forward поведения.

## Проверки следующего этапа

- unit: route builders/parser и safe fallback;
- компонент: desktop/компактная оболочка, навигация с помощью клавиатуры, отказ в доступе, блокировщик грязного состояния;
- Storybook: оболочка пользователя/сервера, состояния загрузки/ошибки/только для чтения;
- E2E: открытие settings из существующей шестерёнки, deep link и возврат без потери server/voice context.
