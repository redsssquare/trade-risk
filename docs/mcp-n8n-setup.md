# Настройка MCP для n8n

Чтобы агенты в Cursor могли управлять и читать сценарии (workflows) в n8n через MCP, нужно включить встроенный MCP-сервер n8n и подключить его в Cursor.

## Требования

- n8n запущен (например, `docker compose up -d n8n`) и доступен по адресу `http://localhost:5678`.
- n8n версии с поддержкой MCP (например 2.2+). Образ `n8nio/n8n:latest` подходит.

## Шаг 1. Включить MCP в n8n

1. Откройте n8n: **http://localhost:5678**
2. Войдите под пользователем с правами **owner** или **admin**.
3. Откройте **Settings** (иконка шестерёнки) → **Instance-level MCP**.
4. Включите переключатель **Enable MCP access**.
5. Нажмите **Connection details** и перейдите на вкладку **Access Token**.
6. Скопируйте **MCP Access Token** (при первом заходе он показывается целиком; позже — только замаскирован, тогда создайте новый токен кнопкой **Generate new token**).

## Шаг 2. Настроить Cursor

### Вариант A: через файл конфигурации (рекомендуется для проекта)

1. В корне проекта создайте файл конфигурации MCP из примера:
   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```
2. Откройте `.cursor/mcp.json` и замените `YOUR_N8N_MCP_TOKEN` на ваш MCP Access Token из шага 1.
3. Полностью перезапустите Cursor (закройте и откройте заново).

Файл `.cursor/mcp.json` добавлен в `.gitignore`, чтобы токен не попадал в репозиторий.

### Вариант B: через настройки Cursor (UI)

1. Откройте **Cursor Settings** → **Tools & MCP**.
2. Нажмите **Add new MCP server**.
3. Укажите:
   - **Name:** `n8n`
   - **Type:** `streamableHttp`
   - **URL:** `http://localhost:5678/mcp-server/http`
   - **Headers:** `Authorization: Bearer YOUR_N8N_MCP_TOKEN` (подставьте свой токен).
4. Сохраните и полностью перезапустите Cursor.

## Шаг 3. Открыть workflow для MCP

По умолчанию ни один workflow не виден MCP-клиентам. Нужно явно разрешить доступ:

1. В n8n откройте нужный workflow (например, **Volatility Window**).
2. В правом верхнем углу откройте меню (`...`) → **Settings**.
3. Включите опцию **Available in MCP** (или **Enable MCP access** в списке workflow).
4. При необходимости опубликуйте workflow (MCP видит только опубликованные версии).

У workflow должен быть один из триггеров: **Form**, **Chat**, **Schedule** или **Webhook**. У «Volatility Window» триггер **Cron** (Schedule) — подходит.

## Что смогут агенты

После настройки агенты в Cursor смогут через MCP:

- Искать и просматривать workflow, доступные для MCP.
- Запускать (триггерить) такие workflow.
- Получать метаданные и информацию о триггерах.

Редактирование и создание workflow по-прежнему выполняется в n8n; MCP даёт доступ к запуску и чтению.

## Проверка

1. После перезапуска Cursor откройте **Settings** → **Tools & MCP** и убедитесь, что сервер **n8n** в списке и без ошибок.
2. В чате можно спросить: «Какие MCP-инструменты доступны?» — среди них должны быть инструменты n8n.

## Устранение неполадок

- **«Server not yet created» / «No server info found» в логах MCP:**  
  Cursor не смог инициализировать сервер. Сделайте по порядку:
  1. Убедитесь, что **n8n запущен** (`docker compose ps`) и в браузере открывается http://localhost:5678.
  2. В n8n: **Settings → Instance-level MCP** — MCP включён, токен скопирован (без пробелов в начале/конце).
  3. Подключайте n8n **прямым streamable HTTP** (без command): в Cursor **Settings → Tools & MCP** добавьте сервер с **Type:** `streamableHttp`, **URL:** `http://localhost:5678/mcp-server/http`, **Headers:** `Authorization: Bearer <ваш_токен>`.
  4. Либо скопируйте `.cursor/mcp.json.example` в `.cursor/mcp.json`, подставьте токен в `headers.Authorization` (формат в примере — прямой `url` + `headers`).
  5. Полностью перезапустите Cursor. Если статус «Error» — выключите и снова включите этот MCP-сервер в настройках (toggle off/on).

- **MCP не подключается:** убедитесь, что n8n запущен (`docker compose ps`) и доступен по `http://localhost:5678`, токен скопирован без пробелов.
- **Workflow не виден:** проверьте, что у workflow включён доступ в MCP и что версия workflow опубликована.
- **Ошибка таймаута:** выполнение workflow по MCP ограничено 5 минутами (настройки n8n).

## Ссылки

- [Accessing n8n MCP server (официальная документация n8n)](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server)
