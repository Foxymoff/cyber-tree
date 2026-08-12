# Кибер-дерево знаний

Арт-объект для дня первокурсника. Студенты по QR отправляют пожелания, те после модерации прилетают светящимися листьями на дерево, выведенное на плазменную панель.

Полное ТЗ: `docs/spec.md`. Твоя задача: `docs/task-backend.md`. Прочитай оба перед началом.

## Стек

Next.js (App Router) + TypeScript, Neon (Postgres) через `@neondatabase/serverless`, деплой на Vercel. PixiJS используется на `/display` — это не твоя зона.

## Команды

```bash
npm run dev
npm run build      # прогонять перед каждым коммитом
npm run lint
npm run format
npm run db:migrate
```

## Зоны ответственности

Репозиторий делят два агента. В чужую зону не писать — это ломает работу параллельно.

**Твоя зона:**
```
app/form/**
app/admin/**
app/api/**
lib/db/**
lib/automod/**
db/migrations/**
```

**Чужая зона, не трогать:**
```
app/display/**
lib/tree/**
scripts/shot.ts
```

**Общее, менять только по согласованию:**
```
lib/types.ts
config/specialties.ts
package.json
```

`lib/types.ts` — замороженный контракт. Против него пишется визуализация дерева, которую делают параллельно с тобой. Если формат ответа API действительно надо изменить — сначала напиши об этом, не меняй молча.

## Чего не делать

- **Вебсокетов нет.** Среда serverless, постоянные соединения не живут. Обновление данных — только опросом раз в 2 секунды по курсору `updated_at`. Не предлагать Socket.IO, SSE, Pusher.
- **Состояния на сервере нет.** Между запросами в памяти ничего не сохраняется. Никаких синглтонов с кэшем, никаких очередей в памяти.
- **Файловой записи нет.** Только Neon. Ни SQLite, ни JSON на диске.
- **Ничего не публиковать автоматически.** Автомод только выставляет `auto_flag`. Решение всегда принимает человек.
- **Не ставить ограничений по IP.** У мобильных операторов сотни абонентов сидят за одним адресом — срежешь половину зала.
- Не импортировать `pixi.js`. Не твоя зона, и на сервере он падает.

## Работа без базы

`DATABASE_URL` может быть пуст — тогда `lib/db/client.ts` отдаёт данные из `lib/db/mock.ts`. Это рабочий режим, он должен продолжать работать после твоих правок: по нему параллельно отлаживают визуализацию.

## Конвенции

- Специальности — только из `config/specialties.ts`. Нигде не хардкодить.
- Цвета — только токены из раздела 8 ТЗ.
- Интерфейс на русском, комментарии в коде на русском.
- Формулы простым текстом, без LaTeX.
- Ветка `feat/backend`, влитие в `main` через PR. В `main` напрямую не коммитить.

## Порядок

Задачи в `docs/task-backend.md` идут по возрастанию зависимости. Брать по порядку, по коммиту на задачу, не начинать следующую, пока предыдущая не работает. Перед кодом — план. Перед коммитом — `npm run build`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
