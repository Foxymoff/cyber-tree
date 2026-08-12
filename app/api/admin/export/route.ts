/**
 * Выгрузка всех пожеланий для отчёта после мероприятия. Раздел 5 ТЗ.
 *
 * CSV делается под Excel и делается сразу правильно, потому что переделывать
 * его будут в день, когда отчёт нужен «через полчаса»:
 *   - UTF-8 с BOM, иначе Excel покажет кракозябры вместо кириллицы;
 *   - разделитель «точка с запятой», потому что в русской локали Excel
 *     запятая — это десятичный разделитель, и файл разъедется по одной колонке.
 *
 * Доступ закрыт общей httpOnly-сессией панели модератора.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError } from '@/lib/http';
import type { Wish } from '@/lib/types';
import { CSV_BOM, wishesToCsv } from './csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const format = request.nextUrl.searchParams.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'json') {
    return jsonError(400, `Неизвестный формат: ${format}. Доступны csv и json.`);
  }

  let wishes: Wish[];
  try {
    wishes = await getStore().listAll();
  } catch (error) {
    console.error('[GET /api/admin/export]', error);
    return jsonError(503, DB_UNAVAILABLE);
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    return NextResponse.json(wishes, {
      headers: {
        'Content-Disposition': `attachment; filename="wishes-${stamp}.json"`,
      },
    });
  }

  return new NextResponse(`${CSV_BOM}${wishesToCsv(wishes)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wishes-${stamp}.csv"`,
    },
  });
}
