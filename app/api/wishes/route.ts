/**
 * Публичный эндпоинт пожеланий. Раздел 5 ТЗ.
 *
 * GET  — опрос для /display: что изменилось после метки since.
 * POST — отправка пожелания с формы.
 *
 * Формы ответов зафиксированы в lib/types.ts: против них пишется визуализация.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isSpecialtyId } from '@/config/specialties';
import { automoderateWish } from '@/lib/automod';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError, parseSince } from '@/lib/http';
import type { SubmitWishRequest, SubmitWishResponse, WishesResponse } from '@/lib/types';
import { isDeviceHash } from './device-hash';

// Опрос раз в 2 секунды: закешированный ответ сломал бы курсор updated_at.
export const dynamic = 'force-dynamic';

/** 23505 — код нарушения уникальности в Postgres. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function submitError(status: number, error: string): NextResponse {
  const answer: SubmitWishResponse = { ok: false, error };
  return NextResponse.json(answer, { status });
}

function mergeFlags(...flags: Array<string | null>): string | null {
  const reasons = new Set(flags.flatMap((flag) => flag?.split(', ') ?? []));
  return reasons.size > 0 ? Array.from(reasons).join(', ') : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const since = parseSince(request.nextUrl.searchParams.get('since'));
  if (!since.ok) return jsonError(400, since.error);

  try {
    const wishes = await getStore().listPublic(since.since);
    const body: WishesResponse = { wishes, now: new Date().toISOString() };
    return NextResponse.json(body);
  } catch (error) {
    console.error('[GET /api/wishes]', error);
    return jsonError(503, DB_UNAVAILABLE);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return submitError(400, 'Не удалось разобрать запрос');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return submitError(400, 'Заполни форму и отправь её ещё раз');
  }

  const body = parsed as Partial<SubmitWishRequest>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const specialty = typeof body.specialty === 'string' ? body.specialty.trim() : '';
  const wish = typeof body.wish === 'string' ? body.wish.trim() : '';
  const deviceHash =
    typeof body.deviceHash === 'string' ? body.deviceHash.trim().toLowerCase() : '';

  if (name === '') return submitError(400, 'Напиши имя');
  if (characterCount(name) < 2) return submitError(400, 'Имя должно быть не короче 2 символов');
  if (characterCount(name) > 30)
    return submitError(400, 'Имя слишком длинное, максимум 30 символов');
  if (!isSpecialtyId(specialty)) return submitError(400, 'Выбери специальность из списка');
  if (wish === '') return submitError(400, 'Напиши пожелание');
  if (characterCount(wish) < 3)
    return submitError(400, 'Пожелание должно быть не короче 3 символов');
  if (characterCount(wish) > 120) {
    return submitError(400, 'Пожелание слишком длинное, уложись в 120 символов');
  }
  if (!isDeviceHash(deviceHash)) {
    return submitError(400, 'Не удалось определить устройство, обнови страницу и попробуй ещё раз');
  }

  try {
    const store = getStore();

    // Одно пожелание на устройство. Ограничение по IP не ставим сознательно:
    // у мобильных операторов сотни абонентов сидят за одним адресом.
    const existing = await store.findByDeviceHash(deviceHash);
    if (existing !== null) {
      return submitError(409, 'С этого устройства пожелание уже отправлено, оно одно на человека');
    }

    const existingWishes = (await store.listAll()).map((item) => item.wish);
    const moderatedName = automoderateWish(name);
    const moderatedWish = automoderateWish(wish, { existingWishes });

    await store.create({
      name: moderatedName.wish,
      specialty,
      wish: moderatedWish.wish,
      deviceHash,
      // Автомод только объясняет, что проверить. Статус всё равно pending,
      // окончательное решение всегда принимает модератор.
      autoFlag: mergeFlags(moderatedName.autoFlag, moderatedWish.autoFlag),
    });

    const answer: SubmitWishResponse = { ok: true };
    return NextResponse.json(answer, { status: 201 });
  } catch (error) {
    // Проверка выше и вставка — два разных запроса, между ними есть щель.
    // При двойном нажатии «Отправить» обе проверки успевают пройти, и вторую
    // вставку отбивает уникальный индекс по device_hash. Показать в этом случае
    // «сервис недоступен» — соврать: пожелание на самом деле записано.
    if (isUniqueViolation(error)) {
      return submitError(409, 'С этого устройства пожелание уже отправлено, оно одно на человека');
    }
    console.error('[POST /api/wishes]', error);
    const answer: SubmitWishResponse = { ok: false, error: DB_UNAVAILABLE };
    return NextResponse.json(answer, { status: 503 });
  }
}
