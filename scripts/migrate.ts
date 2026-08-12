/**
 * Применение миграций из db/migrations к базе Neon.
 *
 * Запуск: npm run db:migrate
 *
 * Учёта применённых миграций нет намеренно: файлы написаны идемпотентно
 * (create table if not exists, drop trigger if exists), повторный прогон
 * безопасен. Для разового мероприятия на одну таблицу отдельная таблица
 * версий — лишняя механика.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

/**
 * Разбить файл на отдельные операторы.
 *
 * Наивный split(';') здесь не работает: тело plpgsql-функции само содержит
 * точки с запятой внутри $$ ... $$. Поэтому идём по символам и отслеживаем,
 * находимся ли мы внутри строки, комментария или долларовых кавычек.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let i = 0;

  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);

    if (inLineComment) {
      buffer += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (rest.startsWith('*/')) {
        buffer += '*/';
        i += 2;
        inBlockComment = false;
        continue;
      }
      buffer += ch;
      i += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (rest.startsWith(dollarTag)) {
        buffer += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buffer += ch;
      i += 1;
      continue;
    }

    if (inString) {
      buffer += ch;
      if (ch === "'") {
        // Удвоенная кавычка внутри строки — это экранированная кавычка, не конец.
        if (sql[i + 1] === "'") {
          buffer += "'";
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }

    if (rest.startsWith('--')) {
      inLineComment = true;
      buffer += '--';
      i += 2;
      continue;
    }

    if (rest.startsWith('/*')) {
      inBlockComment = true;
      buffer += '/*';
      i += 2;
      continue;
    }

    if (ch === "'") {
      inString = true;
      buffer += ch;
      i += 1;
      continue;
    }

    const dollarOpen = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(rest);
    if (dollarOpen) {
      dollarTag = dollarOpen[0];
      buffer += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (ch === ';') {
      statements.push(buffer.trim());
      buffer = '';
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  if (buffer.trim().length > 0) statements.push(buffer.trim());

  // Выкидываем куски, в которых кроме комментариев ничего нет.
  return statements.filter((s) => {
    const withoutComments = s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .trim();
    return withoutComments.length > 0;
  });
}

/** Первая строка оператора — чтобы было понятно, что именно выполняется. */
function describe(statement: string): string {
  const meaningful = statement
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
  const head = meaningful[0] ?? statement;
  return head.length > 70 ? `${head.slice(0, 70)}…` : head;
}

async function main(): Promise<void> {
  // В отличие от Next.js, обычный `node scripts/migrate.ts` сам не читает
  // .env.local. Загружаем его здесь, чтобы команда из package.json работала
  // ровно так, как обещают .env.example и сообщение об ошибке ниже. Переменная,
  // переданная окружением (например, в CI), остаётся приоритетной.
  if (!process.env.DATABASE_URL?.trim()) {
    try {
      loadEnvFile(path.join(process.cwd(), '.env.local'));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    console.error('DATABASE_URL не задан — применять миграции некуда.');
    console.error('Строка подключения к Neon кладётся в .env.local, шаблон — в .env.example.');
    console.error('Каркас работает и без базы, на моках, но db:migrate без неё бессмысленна.');
    process.exit(1);
  }

  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.error(`Папка с миграциями не найдена: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('Миграций нет.');
    return;
  }

  const sql = neon(url);

  for (const file of files) {
    const content = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitStatements(content);
    console.log(`\n${file} — операторов: ${statements.length}`);

    for (const statement of statements) {
      try {
        await sql.query(statement);
        console.log(`  ok   ${describe(statement)}`);
      } catch (error) {
        console.error(`  сбой ${describe(statement)}`);
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  }

  console.log('\nМиграции применены.');
}

// Запускаем main только при прямом вызове, чтобы splitStatements можно было
// импортировать в тестах, не применяя при этом миграции.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error('Миграция не удалась:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
