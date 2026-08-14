/**
 * Stateless-авторизация панели модератора.
 *
 * В cookie лежит не ADMIN_PASSWORD, а производный HMAC-токен. Состояние сессии
 * на сервере не хранится: при каждом запросе ожидаемое значение вычисляется
 * заново из переменной окружения. Смена ADMIN_PASSWORD мгновенно завершает все
 * старые сессии.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'cyber_tree_admin';
export const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

export type AdminAuthResult = { ok: true } | { ok: false; error: string; status: 401 | 503 };

/** Сравнение секретов без раннего выхода по первому отличающемуся символу. */
export function secretsEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

/** Значение сессионной cookie. Сам пароль в браузер не отправляется. */
export function createAdminSessionToken(password: string): string {
  return createHmac('sha256', password).update('cyber-tree-admin-session-v1').digest('base64url');
}

export function isAdminSession(cookieValue: string | undefined): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !cookieValue) return false;
  return secretsEqual(cookieValue, createAdminSessionToken(password));
}

export function requireAdmin(request: NextRequest): AdminAuthResult {
  if (!process.env.ADMIN_PASSWORD) {
    return { ok: false, error: 'Панель модератора не настроена', status: 503 };
  }

  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isAdminSession(cookieValue)) {
    return { ok: false, error: 'Нужен вход в панель модератора', status: 401 };
  }

  return { ok: true };
}
