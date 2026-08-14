/** Латинские омоглифы, которыми обычно подменяют кириллицу. */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  a: 'а',
  o: 'о',
  e: 'е',
  p: 'р',
  c: 'с',
  x: 'х',
  y: 'у',
  k: 'к',
  m: 'м',
  h: 'н',
  b: 'в',
  t: 'т',
};

const DIGITS: Readonly<Record<string, string>> = {
  '0': 'о',
  '1': 'и',
  '3': 'з',
  '4': 'ч',
  '6': 'б',
};

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/gu;
const REPEATED_LETTER = /(\p{L})\1+/gu;

/**
 * Базовая подготовка: регистр, Unicode, омоглифы, цифры и повторы.
 * Разделители пока сохраняются — это полезно для границ обычных слов.
 */
export function normalizeCharacters(input: string): string {
  const mapped = Array.from(
    input.normalize('NFKC').toLocaleLowerCase('ru-RU'),
    (character) => HOMOGLYPHS[character] ?? DIGITS[character] ?? character,
  ).join('');

  return mapped.replace(INVISIBLE, '').replace(REPEATED_LETTER, '$1');
}

/**
 * Строка для поиска обходов фильтра. Помимо обязательных пробела, точки и
 * дефиса убираем подчёркивания, звёздочки, слеши и похожие разделители — это
 * дешёвые варианты обхода, которыми фильтр иначе проверят в первые минуты.
 */
export function normalizeForModeration(input: string): string {
  return normalizeCharacters(input)
    .replace(/(?<=\p{L})[\s.\-_*·•/\\|]+(?=\p{L})/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Сравнение дублей не зависит от регистра, пунктуации и е/ё. */
export function normalizeForDuplicate(input: string): string {
  // Цифры здесь сохраняем: «номер 1» и «номер 11» — разные пожелания.
  // Подмена цифр буквами нужна для поиска мата, но создаёт ложные дубли.
  return input
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(INVISIBLE, '')
    .replace(REPEATED_LETTER, '$1')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Капс не является нарушением: аккуратно приводим его к обычному регистру.
 * Смешанный регистр не трогаем, чтобы не портить аббревиатуры вроде CTF.
 */
export function normalizeAllCaps(input: string): string {
  const trimmed = input.trim();
  const letters = trimmed.match(/\p{L}/gu) ?? [];
  const casedLetters = letters.filter(
    (letter) => letter.toLocaleLowerCase() !== letter.toLocaleUpperCase(),
  );
  const isAllCaps =
    casedLetters.length >= 2 &&
    casedLetters.every((letter) => letter === letter.toLocaleUpperCase());

  if (!isAllCaps) return trimmed;

  const lower = trimmed.toLocaleLowerCase('ru-RU');
  return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('ru-RU'));
}
