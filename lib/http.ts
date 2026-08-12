/**
 * Мелкая обвязка для роутов: разбор курсора и единый вид ошибок.
 * Держать тонкой — бизнес-логика живёт в роутах и в lib/db.
 */
import { NextResponse } from 'next/server';

/** Результат разбора параметра since. */
export type SinceResult = { ok: true; since: string | null } | { ok: false; error: string };

/**
 * Разбор курсора опроса.
 *
 * Метку обязательно приводим к каноничному ISO: моковое хранилище сравнивает
 * строки лексикографически, и метка вида '2026-09-01T12:00:00+03:00' сломала бы
 * сравнение. После нормализации все метки в одном часовом поясе и одном формате.
 *
 * Отсутствие since — не ошибка, это первая загрузка.
 */
export function parseSince(raw: string | null): SinceResult {
  if (raw === null || raw === '') return { ok: true, since: null };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: `Параметр since не разбирается как дата: ${raw}` };
  }

  return { ok: true, since: parsed.toISOString() };
}

/**
 * Ответ об ошибке. Формат намеренно простой и одинаковый для всех роутов:
 * в lib/types.ts ошибки описаны только для POST /api/wishes, остальным
 * достаточно кода статуса и текста для лога.
 */
export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Текст, который не стыдно показать человеку, когда база недоступна.
 * Студент не должен видеть белый экран или стек вызовов.
 */
export const DB_UNAVAILABLE = 'Сервис временно недоступен, попробуйте ещё раз через минуту';
