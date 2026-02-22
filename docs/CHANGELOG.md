# Changelog

Все значимые изменения в проекте. Формат основан на [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added

- **Bridge internal cron** (2026-02-22)
  - Bridge сам запускает проверку volatility каждые `BRIDGE_CRON_INTERVAL_MS` (по умолчанию 30 с).
  - Работает независимо от n8n — решает проблему пропуска `post_event`, когда n8n cron срабатывает раз в минуту и «промахивается» по коротким окнам.
  - ** production:** Для боевого сценария с полными окнами (pre 30 мин, during 5 мин, post 15 мин) достаточно `BRIDGE_CRON_INTERVAL_MS=60000` — раз в минуту. 30 с нужны только для быстрых тестов (короткие окна 7/4/5 мин).
  - env: `BRIDGE_CRON_INTERVAL_MS=0` — отключить (только n8n).

- **MVP Module Contract** (2026-02-22)
  - Документ [docs/MVP-CONTRACT.md](MVP-CONTRACT.md): вход Feed, выход Compute, вход Bridge, замороженные поля.
  - Цель: агенты в разных чатах не расходятся по форматам данных.

### Changed

- **Тестовые окна укорочены в ~3×** (2026-02-22)
  - pre: 20–30 мин → 7 мин, during: 5 мин → 4 мин, post: 15 мин → 5 мин (event+4..event+9).
  - Чтобы живой тест проходил за ~16 мин вместо ~40 мин.
  - Обновлены: n8n workflow, bridge, lib/volatility-compute, volatility_test_cases.md.

### Fixed

- **post_event не публиковался по расписанию**
  - Причина: n8n cron раз в минуту + короткие окна → переход during→post «промахивался».
  - Решение 1: расширены окна during (2→4 мин) и post.
  - Решение 2: Bridge internal cron каждые 30 с — надёжный fallback.

---

## Как добавлять записи

1. В секции `[Unreleased]` добавлять новые пункты.
2. Группировать по типам: `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`.
3. Для каждого пункта кратко: **что** изменено и **зачем**.
4. При релизе: переименовать `[Unreleased]` в `[X.Y.Z]` и дату.
