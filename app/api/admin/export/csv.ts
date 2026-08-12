import { getSpecialty } from '@/config/specialties';
import type { Wish } from '@/lib/types';

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

/** BOM сообщает Excel, что файл закодирован в UTF-8. */
export const CSV_BOM = '\uFEFF';

/** Ячейка, которую Excel может выполнить как формулу. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function wishesToCsv(wishes: readonly Wish[]): string {
  const rows = [
    COLUMNS.join(';'),
    ...wishes.map((wish) =>
      [
        wish.id,
        wish.name,
        getSpecialty(wish.specialty)?.label ?? wish.specialty,
        wish.specialty,
        wish.wish,
        wish.status,
        wish.autoFlag,
        wish.createdAt,
        wish.updatedAt,
      ]
        .map(csvCell)
        .join(';'),
    ),
  ];
  return rows.join('\r\n');
}
