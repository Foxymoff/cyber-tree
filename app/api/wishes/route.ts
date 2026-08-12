/**
 * Публичный эндпоинт пожеланий. Раздел 5 ТЗ.
 *
 * GET  — опрос для /display: что изменилось после метки since.
 * POST — отправка пожелания с формы.
 *
 * ЗАГЛУШКА. Формы ответов финальные, против них уже пишется визуализация.
 * Валидация по разделу 6 и автомодерация — задачи 2 и 3 в docs/task-backend.md.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError, parseSince } from '@/lib/http';
import type { SubmitWishRequest, SubmitWishResponse, WishesResponse } from '@/lib/types';

// Опрос раз в 2 секунды: закешированный ответ сломал бы курсор updated_at.
export const dynamic = 'force-dynamic';

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
  let body: Partial<SubmitWishRequest>;
  try {
    body = (await request.json()) as Partial<SubmitWishRequest>;
  } catch {
    const answer: SubmitWishResponse = { ok: false, error: 'Не удалось разобрать запрос' };
    return NextResponse.json(answer, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const specialty = typeof body.specialty === 'string' ? body.specialty : '';
  const wish = typeof body.wish === 'string' ? body.wish.trim() : '';
  const deviceHash = typeof body.deviceHash === 'string' ? body.deviceHash : '';

  // Проверка только на заполненность полей. Настоящая валидация по разделу 6
  // (длины, мат с нормализацией, ссылки, упоминания, телефоны, дубликаты)
  // и заполнение auto_flag — задача 2 в docs/task-backend.md.
  if (name === '' || specialty === '' || wish === '') {
    const answer: SubmitWishResponse = { ok: false, error: 'Заполни все поля' };
    return NextResponse.json(answer, { status: 400 });
  }

  try {
    const store = getStore();

    // Одно пожелание на устройство. Ограничение по IP не ставим сознательно:
    // у мобильных операторов сотни абонентов сидят за одним адресом.
    if (deviceHash !== '') {
      const existing = await store.findByDeviceHash(deviceHash);
      if (existing !== null) {
        const answer: SubmitWishResponse = {
          ok: false,
          error: 'С этого устройства пожелание уже отправлено, оно одно на человека',
        };
        return NextResponse.json(answer, { status: 409 });
      }
    }

    await store.create({
      name,
      specialty,
      wish,
      deviceHash: deviceHash === '' ? null : deviceHash,
      // Автомод ничего не публикует и ничего не удаляет — он только проставляет
      // причину в auto_flag. Пока его нет, флага нет.
      autoFlag: null,
    });

    const answer: SubmitWishResponse = { ok: true };
    return NextResponse.json(answer, { status: 201 });
  } catch (error) {
    console.error('[POST /api/wishes]', error);
    const answer: SubmitWishResponse = { ok: false, error: DB_UNAVAILABLE };
    return NextResponse.json(answer, { status: 503 });
  }
}
