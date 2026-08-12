import assert from 'node:assert/strict';
import test from 'node:test';
import { CSV_BOM, csvCell, wishesToCsv } from './csv.ts';

const WISH = {
  id: 1,
  name: 'Мария',
  specialty: 'isip',
  wish: 'Пусть всё получится',
  status: 'approved',
  autoFlag: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:01:00.000Z',
};

test('добавляет Excel-совместимый UTF-8 BOM', () => {
  assert.equal(Buffer.from(CSV_BOM).toString('hex'), 'efbbbf');
});

test('использует точку с запятой и CRLF, сохраняя кириллицу', () => {
  const csv = wishesToCsv([WISH]);
  assert.match(csv, /^id;имя;специальность;/);
  assert.match(csv, /\r\n1;Мария;Информационные системы и программирование;isip;/);
  assert.equal(csv.includes('\n') && !csv.includes('\r\n'), false);
});

test('экранирует кавычки, разделитель и переносы', () => {
  assert.equal(csvCell('текст; "цитата"\nстрока'), '"текст; ""цитата""\nстрока"');
});

test('не даёт Excel выполнить пользовательский текст как формулу', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-2+3', '@mention']) {
    assert.equal(csvCell(value).startsWith("'"), true, value);
  }
});
