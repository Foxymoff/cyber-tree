import {
  normalizeAllCaps,
  normalizeCharacters,
  normalizeForDuplicate,
  normalizeForModeration,
} from './normalize';

export interface AutomodOptions {
  existingWishes?: readonly string[];
}

export interface AutomodResult {
  /** Текст после безопасного исправления сплошного капса. */
  wish: string;
  /** Причины через запятую или null, если ничего подозрительного нет. */
  autoFlag: string | null;
}

const LINK = /(?:https?:\/\/|www\.|(?:[a-zа-яё0-9-]+\.)+(?:ru|рф|com|net|org|io|me)\b)/iu;
const MENTION = /@[a-zа-яё0-9_]{2,}/iu;
const PHONE = /(?<!\d)(?:\+?7|8)(?:[\s()-]*\d){10}(?!\d)/u;
const SEPARATOR = '[\\s.\\-_*·•/\\\\|\\u200b-\\u200d\\u2060\\ufeff]*';
const SUKA = new RegExp(
  `(?:^|[^\\p{L}])с${SEPARATOR}у${SEPARATOR}к${SEPARATOR}(?:а|и|у|ой|е)(?:$|[^\\p{L}])`,
  'u',
);

/**
 * Корни подбираются так, чтобы ловить распространённые формы, но не считать
 * матом «учёбу», «требуется» и просьбу «подстрахуйте». Разделители уже удалены
 * normalizeForModeration, поэтому те же шаблоны ловят х.у.й и п_и*з-д.
 */
const PROFANITY = [
  /пизд/u,
  /бля(?:д|т)/u,
  /долбо[её]б/u,
  /мудак/u,
  /гандон/u,
  /залуп/u,
  /(?<!стра)ху(?:й|я|е|ё|и|ю|йн)/u,
  /(?<!уч)(?:за|на|по|про|от|до|в|вы|пере|раз|с|у)?[ъь]?[её]б(?:ат|ан|уч|лив|ло|ла|ли|ут|ет|ёт|ис|нул|нут)/u,
] as const;

export function containsProfanity(input: string): boolean {
  const normalized = normalizeForModeration(input);
  return (
    PROFANITY.some((pattern) => pattern.test(normalized)) || SUKA.test(normalizeCharacters(input))
  );
}

export function containsLink(input: string): boolean {
  return LINK.test(input);
}

export function containsMention(input: string): boolean {
  return MENTION.test(input);
}

export function containsPhone(input: string): boolean {
  return PHONE.test(input);
}

export function isDuplicateWish(input: string, existingWishes: readonly string[]): boolean {
  const normalized = normalizeForDuplicate(input);
  return (
    normalized.length > 0 &&
    existingWishes.some((existing) => normalizeForDuplicate(existing) === normalized)
  );
}

/** Автомод только помечает причины; решение о публикации остаётся за человеком. */
export function automoderateWish(input: string, options: AutomodOptions = {}): AutomodResult {
  const wish = normalizeAllCaps(input);
  const reasons: string[] = [];

  if (containsProfanity(wish)) reasons.push('ненормативная лексика');
  if (containsLink(wish)) reasons.push('ссылка');
  if (containsMention(wish)) reasons.push('упоминание');
  if (containsPhone(wish)) reasons.push('номер телефона');
  if (isDuplicateWish(wish, options.existingWishes ?? [])) reasons.push('дубликат');

  return { wish, autoFlag: reasons.length > 0 ? reasons.join(', ') : null };
}

export { normalizeAllCaps, normalizeCharacters, normalizeForDuplicate, normalizeForModeration };
