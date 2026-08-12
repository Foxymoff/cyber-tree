/**
 * Шов под авторизацию админки.
 *
 * ВНИМАНИЕ: СЕЙЧАС НИЧЕГО НЕ ЗАКРЫВАЕТ. Функция всегда пропускает запрос.
 * Это осознанное состояние каркаса, а не забытый код: авторизация — задача 5
 * в docs/task-backend.md, её делает напарник.
 *
 * Сделано отдельной функцией специально: когда задача 5 будет выполнена,
 * закрыть все /api/admin/* можно правкой одного места, и требование
 * «проверь, что закрыты именно все, включая экспорт» проверяется на глаз.
 *
 * Что должно здесь появиться, по разделу 5 ТЗ:
 * один общий пароль из ADMIN_PASSWORD, после ввода на /admin кладётся
 * в httpOnly-cookie. Полноценная авторизация не нужна и только съест время.
 */
import type { NextRequest } from 'next/server';

export interface AdminAuthResult {
  ok: boolean;
  /** Текст для ответа 401, когда ok === false. */
  error: string;
}

export function requireAdmin(_request: NextRequest): AdminAuthResult {
  // TODO(задача 5 в docs/task-backend.md): проверить httpOnly-cookie против
  // ADMIN_PASSWORD и возвращать { ok: false } для неавторизованных.
  return { ok: true, error: 'Нужен вход в панель модератора' };
}
