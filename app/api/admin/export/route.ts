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
import { getSpecialty } from '@/config/specialties';
import { requireAdmin } from '@/lib/admin-auth';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError } from '@/lib/http';
import type { Wish } from '@/lib/types';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'id',
  'имя',
  'специальность',
  'специальность (id)',
  'пожелание',
  'статус',
  'флаг автомода',
  'отправлено',
  'изменено',
] as const;

/**
 * BOM. Без неё Excel не поймёт, что файл в UTF-8, и покажет кракозябры.
 * Записана escape-последовательностью намеренно: невидимый символ в исходнике
 * рано или поздно потеряется при копировании, и поломка будет необъяснимой.
 */
const BOM = '\uFEFF';

/**
 * Ячейка, которую Excel выполнит как формулу, а не покажет текстом.
 * Кавычки от этого не спасают: значение в кавычках вычисляется точно так же.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Экранирование поля CSV.
 *
 * Кроме обычного удвоения кавычек здесь обезвреживается подстановка формул.
 * Текст пожелания пишет студент, а CSV открывает модератор у себя в Excel.
 * Пожелание вида =1+1 в ячейке вычислится, а =HYPERLINK("...") превратится
 * в кликабельную ссылку, которую модератор примет за часть отчёта.
 * Апостроф в начале Excel понимает как «дальше текст» и сам его не показывает.
 */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  // Числа безопасны, к ним относится только колонка id.
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(wishes: Wish[]): string {
  const rows = [
    COLUMNS.join(';'),
    ...wishes.map((w) =>
      [
        w.id,
        w.name,
        getSpecialty(w.specialty)?.label ?? w.specialty,
        w.specialty,
        w.wish,
        w.status,
        w.autoFlag,
        w.createdAt,
        w.updatedAt,
      ]
        .map(csvCell)
        .join(';'),
    ),
  ];
  // \r\n — Excel относится к этому спокойнее, чем к голому \n.
  return rows.join('\r\n');
}

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

  return new NextResponse(`${BOM}${toCsv(wishes)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wishes-${stamp}.csv"`,
    },
  });
}
