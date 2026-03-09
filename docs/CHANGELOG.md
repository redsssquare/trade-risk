# Changelog

Все значимые изменения в проекте. Формат основан на [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added

- **Russian pluralization helper (pluralRu)** (2026-03-09)
  - `utils/pluralRu.js` — общий хелпер склонения числительных: `pluralRu(n, one, few, many)` возвращает форму по правилам русского языка (1→one, 2–4→few, 5+→many, с учётом 11–14).
  - Применён во всех render-модулях: weekly-end-format, weekly-ahead-format, phrases, templates (high, anchor_high), digest-format, digest-image, telegram-render.

- **Scenario Testing Suite** (2026-03-08)
  - `scripts/run-all-scenario-tests.js` — мастер-скрипт последовательного запуска 4 сценариев тестирования с паузой 2.5 сек между ними.
  - `docs/scenario-testing-guide.md` — руководство по сценарному тестированию с таблицами кейсов и чеклистом ручной проверки.
  - Метки `_caseType` в `send-weekly-ahead-test-cases.js` и `send-weekly-digest-test.js` для маппинга типов кейсов.
  - Сценарии S5–S10 в `send-volatility-test-events.js` (full coverage: high, anchor, stack, anchorStack × pre_event/during_event).
  - `SCENARIO_MODE=1` в `send-daily-digest-test-cases.js` — режим быстрого запуска (5 кейсов из 16).

- **LLM Text Finalizer** (2026-03-08)
  - LLM-полиш текста перед отправкой в Telegram для трёх digest-эндпоинтов: `/daily-digest`, `/weekly-digest`, `/weekly-ahead`.
  - Форматированный текст опционально полируется LLM (грамматика, стиль). При любой ошибке — fallback на оригинал.
  - Константа `LLM_POLISH_SYSTEM_PROMPT`, функция `polishTextWithLlm(rawText, contextPayload)`.
  - В meta ответа добавлено поле `llm_polish: true/false` для всех трёх эндпоинтов.
  - При `AI_ENABLED=false` или отсутствии API-ключа LLM не вызывается, `llm_polish: false`.

- **Workflow Test Cases** (2026-03-08)
  - Расширены `tests/anchor-classification.test.js`: кейсы country constraints (CPI EUR, Retail Sales GBP).
  - Расширены `tests/cluster-classification.test.js`: mixed cluster (Unemployment + CPI), кластер из 3 событий, `getClusterAnchorNames`.
  - Новый `tests/volatility-window.test.js`: unit-тесты для `computeFromRawEvents` (фазы pre/during/post/none, границы окна).
  - Расширены `docs/volatility_test_cases.md`: Сценарий 7 — границы окна и mixed cluster (edge cases).
  - Расширены `tests/message-render.test.js`: mixed cluster (contextual_anchor=true) → ⚡.
  - Новый `docs/daily-workflow-test-checklist.md`: чеклист ручной проверки Daily Digest (подмена calendar-feed, фильтр 9–21 МСК, проверка digest).

- **TEST_CHANNEL env toggle** (2026-03-08)
  - Переменная `TEST_CHANNEL` (`true` / `false`) для выбора канала отправки: `true` → TELEGRAM_TEST_CHANNEL_ID, `false` → TELEGRAM_CHAT_ID.
  - При отсутствии `TEST_CHANNEL` используется fallback на `TELEGRAM_MODE` (обратная совместимость).
  - Применяется к daily-digest, weekly-digest, weekly-ahead и `/hooks/event`.

- **Macro Notification Test Stabilization** (2026-03-08)
  - **TELEGRAM_MODE** env var: `test` → отправка в TELEGRAM_TEST_CHANNEL_ID; `production` (по умолчанию) → в TELEGRAM_CHAT_ID. Применяется к daily-digest, weekly-digest, weekly-ahead и `/hooks/event`.
  - Новые тест-сьюты: `tests/anchor-classification.test.js` (6 кейсов), `tests/cluster-classification.test.js` (3 кейса), `tests/message-render.test.js` (3 кейса).
  - `npm test` — запуск всех тестов через `node --test`.

- **Верификация тестового прогона** (2026-02-22) — полный цикл успешно завершён: все фазы (pre_event, during_event, post_event) корректно отображены в Telegram, без дубликатов. Ручной smoke по [docs/stage1-test-run.md](stage1-test-run.md) пройден.

- **Этап 6: Минимальные тест-кейсы перед merge** (2026-02-22) — завершён.
  - JSON-фактуры в `docs/fixtures/stage6/`: single_event, batch_cluster, anchor_primary, overlapping_anchor_in_cluster.
  - Runner `scripts/run-stage6-min-regression.js`: проверка expected vs actual (state, phase, event_name, send/no-send), отчёт по расхождениям.
  - npm script `test:stage6`. Чеклист перед merge: [docs/stage6-pre-merge-checklist.md](stage6-pre-merge-checklist.md).
  - Цель: быстрый регрессионный контроль между чатами агентов.

- **Этап 5: Render-шаблоны отдельно от вычислений** (2026-02-22) — завершён.
  - Добавлен отдельный слой шаблонного рендера: `services/bridge/render/telegram-render.js` + шаблоны `high` и `anchor_high`.
  - В шаблонах для `pre_event` добавлена поддержка серии публикаций: при `cluster_size > 1` текст формируется как серия, а не одиночное событие.
  - Добавлено явное упоминание anchor внутри серии: при `cluster_has_anchor=true` используется `cluster_anchor_names` (например, «включая Non-Farm Payrolls»).
  - Добавлен тест `npm run test:render` — детерминизм текста + 2 эталонных cluster-кейса.

- **Этап 4: Модуль классификации high vs anchor_high** (2026-02-22)
  - Конфиг алиасов в `data/anchor_events.json` (NFP, FOMC Rate Decision, US CPI, ECB/BOE/BOJ Rate Decision, Powell Speech) как единый источник истины.
  - Классификатор `lib/anchor-event-classifier.js`: `impact_type` (`anchor_high`/`high`), `anchor_label`.
  - В LLM-контекст добавлены `cluster_has_anchor`, `cluster_anchor_names` — при primary=high и anchor в кластере LLM может написать «включая …».
  - Тесты: `npm run test:anchor-classifier` (anchor match, high non-anchor, ambiguous title, серия+anchor в кластере).

- **NFP Classification Fix** (2026-03-06)
  - NFP package detection: Unemployment Rate + Average Hourly Earnings в одном временном слоте (country=USD/US) → все события слота помечаются как NFP anchor.
  - Специальная строка дайджеста для NFP-кластера: «Рынок труда США (Non-Farm Payrolls)» вместо общей «Серия из N публикаций».
  - First Friday месяца как дополнительный сигнал: Employment Change/Nonfarm (без ADP) + USD в первый пятницу → NFP anchor.

- **Этап 3: Модуль «пачка новостей» (cluster)** (2026-02-22)
  - Кластеризация близких High-событий (в пределах `CLUSTER_WINDOW_MIN=5` мин) — одно уведомление на серию вместо спама по каждому событию.
  - В `context` добавлены опциональные поля: `cluster_size`, `cluster_events`, `cluster_window_min`.
  - Изменения только в Compute: `lib/volatility-compute.js`, нода `Compute Volatility State` в n8n workflow. Bridge и LLM слой не менялись.
  - Скрипты smoke: `scripts/stage3-cluster-smoke.sh` (подготовка теста с 3 близкими событиями, rebuild bridge, push workflow, активация), `scripts/stage3-cluster-smoke-restore.sh` (откат).
  - Smoke тест использует `BRIDGE_CRON_INTERVAL_MS=0`, чтобы избежать дубликатов с n8n.

- **Compute декомпозиция на подмодули** (2026-02-22)
  - Логика внутри ноды `Compute Volatility State` разделена на явные блоки: NormalizeInput, BuildActiveCandidates, ResolvePhaseAndState, DiffWithPreviousState, BuildOutputPayload.
  - При сбое в логах execution пишется `failed_block` — видно, на каком шаге произошла ошибка.
  - Контракт payload и окна фаз сохранены без изменений.

- **Bridge internal cron** (2026-02-22)
  - Bridge сам запускает проверку volatility каждые `BRIDGE_CRON_INTERVAL_MS` (по умолчанию 30 с).
  - Работает независимо от n8n — решает проблему пропуска `post_event`, когда n8n cron срабатывает раз в минуту и «промахивается» по коротким окнам.
  - ** production:** Для боевого сценария с полными окнами (pre 30 мин, during 5 мин, post 15 мин) достаточно `BRIDGE_CRON_INTERVAL_MS=60000` — раз в минуту. 30 с нужны только для быстрых тестов (короткие окна 7/4/5 мин).
  - env: `BRIDGE_CRON_INTERVAL_MS=0` — отключить (только n8n).

- **MVP Module Contract** (2026-02-22)
  - Документ [docs/MVP-CONTRACT.md](MVP-CONTRACT.md): вход Feed, выход Compute, вход Bridge, замороженные поля.
  - Цель: агенты в разных чатах не расходятся по форматам данных.

### Changed

- **Numeric phrases use pluralRu** (2026-03-09)
  - Все числовые фразы (события, публикации, минуты, интервалы) в render-шаблонах переведены на использование `pluralRu` вместо хардкода форм.

- **Digest response meta: llm_polish** (2026-03-08)
  - Ответы `/daily-digest`, `/weekly-digest`, `/weekly-ahead` теперь включают в meta поле `llm_polish: true/false`, указывающее, был ли применён LLM-полиш к тексту перед отправкой.

- **During Event Publication Name** (2026-03-08)
  - during_event messages now include publication name and currency in the first line.
  - Fixed 🔴 emoji at the start of the first line for during_event.
  - Templates: single event → "🔴 {event} 🇺🇸 USD"; series → "🔴 Идёт серия публикаций (N)"; anchor series → "🔴 Идёт серия публикаций (N), включая {anchor}".
  - Template mode only (AI_ENABLED=false by default).

- **post_event удалён из volatility window** (2026-03-08)
  - Убрана публикация фазы post_event. Оставшиеся публикации: pre_event, during_event, green.

- **NFP Classification Fix — уточнённая логика** (2026-03-06)
  - NFP anchor применяется только к событиям с `country=USD` или `country=US`; события других стран не классифицируются как NFP.
  - ADP-события (ADP Employment Change, Private Nonfarm, Private Payrolls) исключены из NFP через `exclude` в `data/anchor_events.json`.

- **Тестовые окна укорочены в ~3×** (2026-02-22)
  - pre: 20–30 мин → 7 мин, during: 5 мин → 4 мин, post: 15 мин → 5 мин (event+4..event+9).
  - Чтобы живой тест проходил за ~16 мин вместо ~40 мин.
  - Обновлены: n8n workflow, bridge, lib/volatility-compute, volatility_test_cases.md.

### Removed

- **OpenClaw** (2026-03-08)
  - Bridge теперь отправляет сообщения напрямую в Telegram через Bot API. Удалён сервис openclaw из docker-compose, директория `services/openclaw` удалена.
  - Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (вместо `OPENCLAW_*`).

### Fixed

- **Russian plural forms in Telegram messages** (2026-03-09)
  - Исправлены грамматические ошибки: «2 ключевых событий» → «2 ключевых события», «Через 1 минут» → «Через 1 минуту», «3 плотных интервала» (вместо «2 плотных интервала» для clusters=3), «Запланировано N событий» с корректными формами.

- **Weekly-End Bug Fixes** (2026-03-08)
  - `digest-format.js`: события с невалидными датами (`??:??`) пропускаются.
  - `weekly-end-phrases.js`: DISTRIBUTION_ONE_PHRASES в винительном падеже; заменены запрещённые фразы (режим, контроль); «режим» добавлен в WEEKLY_FORBIDDEN_WORDS.
  - `weekly-end-format.js`: `formatWeeklyEnd` возвращает `{ text, levelKey }`; `validateWeeklyEnd` использует `levelKey`; фразы распределения всегда в винительном падеже; экспорт `getWeeklyEndLevel`.
  - `weekly-ahead-phrases.js`: «режим» добавлен в WEEKLY_AHEAD_FORBIDDEN_WORDS.
  - `server.js`: деструктуризация `formatWeeklyEnd`, передача `levelKey` в `validateWeeklyEnd`.
  - `test-text-templates.js`: исправлены fixtures, валидация через `levelKey`.

- **NFP false positives для не-US событий и ADP** (2026-03-06)
  - События с названиями, похожими на NFP, но с `country` отличным от USD/US, больше не помечаются как anchor.
  - ADP Employment Change и аналогичные события больше не ошибочно классифицируются как NFP anchor.

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
