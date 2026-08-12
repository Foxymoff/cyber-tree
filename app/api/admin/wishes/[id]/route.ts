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
 * Доступ закрыт общей httpOnly-сессией панели модератора.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isSpecialtyId } from '@/config/specialties';
import { requireAdmin } from '@/lib/admin-auth';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError } from '@/lib/http';
import type { UpdateWishRequest, WishStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES: readonly WishStatus[] = ['pending', 'approved', 'rejected'];

function isWishStatus(value: unknown): value is WishStatus {
  return typeof value === 'string' && STATUSES.includes(value as WishStatus);
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(400, `Некорректный id: ${rawId}`);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return jsonError(400, 'Не удалось разобрать запрос');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return jsonError(400, 'Ожидался объект с изменениями пожелания');
  }

  const body = parsed as Partial<UpdateWishRequest>;

  const patch: UpdateWishRequest = {};
  if (body.status !== undefined) {
    if (!isWishStatus(body.status)) {
      return jsonError(400, `Недопустимый статус: ${String(body.status)}`);
    }
    patch.status = body.status;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return jsonError(400, 'Имя должно быть строкой');
    const name = body.name.trim();
    if (characterCount(name) < 2 || characterCount(name) > 30) {
      return jsonError(400, 'Имя должно быть длиной от 2 до 30 символов');
    }
    patch.name = name;
  }
  if (body.specialty !== undefined) {
    if (typeof body.specialty !== 'string' || !isSpecialtyId(body.specialty)) {
      return jsonError(400, 'Выбери специальность из списка');
    }
    patch.specialty = body.specialty;
  }
  if (body.wish !== undefined) {
    if (typeof body.wish !== 'string') return jsonError(400, 'Пожелание должно быть строкой');
    const wish = body.wish.trim();
    if (characterCount(wish) < 3 || characterCount(wish) > 120) {
      return jsonError(400, 'Пожелание должно быть длиной от 3 до 120 символов');
    }
    patch.wish = wish;
  }

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
