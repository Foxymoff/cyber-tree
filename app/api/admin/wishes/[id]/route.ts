/**
 * Правка пожелания модератором. Раздел 5 ТЗ.
 *
 * Один эндпоинт на всё: одобрение, отклонение, снятие с экрана
 * (approved → rejected) и правка текста перед публикацией.
 *
 * updated_at при этом обязан меняться — по нему /display узнаёт, что лист
 * надо снять. В боевом режиме это делает триггер wishes_set_updated_at,
 * в моковом — lib/db/client.ts руками.
 *
 * ЗАГЛУШКА: авторизации пока нет, см. lib/admin-auth.ts.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError } from '@/lib/http';
import type { UpdateWishRequest, WishStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES: readonly WishStatus[] = ['pending', 'approved', 'rejected'];

function isWishStatus(value: unknown): value is WishStatus {
  return typeof value === 'string' && STATUSES.includes(value as WishStatus);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (!auth.ok) return jsonError(401, auth.error);

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, `Некорректный id: ${rawId}`);
  }

  let body: Partial<UpdateWishRequest>;
  try {
    body = (await request.json()) as Partial<UpdateWishRequest>;
  } catch {
    return jsonError(400, 'Не удалось разобрать запрос');
  }

  const patch: UpdateWishRequest = {};
  if (body.status !== undefined) {
    if (!isWishStatus(body.status)) {
      return jsonError(400, `Недопустимый статус: ${String(body.status)}`);
    }
    patch.status = body.status;
  }
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.specialty === 'string') patch.specialty = body.specialty;
  if (typeof body.wish === 'string') patch.wish = body.wish.trim();

  if (Object.keys(patch).length === 0) {
    return jsonError(400, 'Нечего менять: в запросе нет ни одного поля');
  }

  try {
    const updated = await getStore().update(id, patch);
    if (updated === null) return jsonError(404, `Пожелание ${id} не найдено`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/admin/wishes/:id]', error);
    return jsonError(503, DB_UNAVAILABLE);
  }
}
