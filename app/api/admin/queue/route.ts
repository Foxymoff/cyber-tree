/**
 * Очередь модератора. Раздел 5 ТЗ.
 *
 * То же, что публичный GET /api/wishes, но отдаёт запись целиком: со статусом
 * pending и с auto_flag, по которому админка поднимает флагнутое наверх.
 *
 * Доступ закрыт общей httpOnly-сессией панели модератора.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError, parseSince } from '@/lib/http';
import type { AdminQueueResponse } from '@/lib/types';

// Опрос очереди раз в 2 секунды, кеш здесь недопустим.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const since = parseSince(request.nextUrl.searchParams.get('since'));
  if (!since.ok) return jsonError(400, since.error);

  try {
    // Курсор берём до SQL-запроса: так конкурентное изменение максимум
    // придёт повторно, но не провалится в окно между SELECT и временем ответа.
    const now = new Date().toISOString();
    const wishes = await getStore().listAll(since.since);
    const body: AdminQueueResponse = { wishes, now };
    return NextResponse.json(body);
  } catch (error) {
    console.error('[GET /api/admin/queue]', error);
    return jsonError(503, DB_UNAVAILABLE);
  }
}
