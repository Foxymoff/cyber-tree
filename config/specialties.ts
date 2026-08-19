/**
 * Единственное место, где заданы специальности.
 *
 * Нигде больше их не хардкодить: от длины этого списка зависит число
 * магистральных веток дерева на /display и набор вариантов в форме.
 *
 * Разумный предел — 6 веток. Больше — дерево станет кашей, надо будет группировать.
 *
 * Цвета берутся из палитры акцентов, раздел 8 ТЗ. Свободные, ещё не занятые:
 * #FFD166  #B98CFF  #5FE07A
 */
export const SPECIALTIES = [
  { id: 'isip', label: 'Разработка и управление программным обеспечением', short: 'РУПО', color: '#4DE1C1' },
  { id: 'mr',   label: 'Мехатроника и робототехника',                      short: 'МР',   color: '#FF6B9D' },
] as const;

/** Идентификатор специальности, например 'isip'. */
export type SpecialtyId = (typeof SPECIALTIES)[number]['id'];

/** Специальность целиком. */
export type Specialty = (typeof SPECIALTIES)[number];

/** Проверка, что строка — существующий id специальности. Нужна при валидации формы и API. */
export function isSpecialtyId(value: string): value is SpecialtyId {
  return SPECIALTIES.some((s) => s.id === value);
}

/** Специальность по id, либо undefined. */
export function getSpecialty(id: string): Specialty | undefined {
  return SPECIALTIES.find((s) => s.id === id);
}
