/**
 * Детерминированный генератор псевдослучайных чисел.
 *
 * Math.random здесь использовать нельзя ни в каком виде: весь цикл доводки
 * визуала построен на сравнении скриншотов, а он работает только если один
 * seed даёт одно и то же дерево байт в байт.
 */

/**
 * Хеш строки в 32-битное целое. Нужен, чтобы seed можно было писать словом
 * («demo»), а не числом.
 *
 * Это xmur3: четыре раунда перемешивания, для наших целей более чем достаточно.
 */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;

  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);

  return (h ^= h >>> 16) >>> 0;
}

/** Функция, выдающая следующее число в [0, 1). */
export type Random = () => number;

/**
 * mulberry32: короткий, быстрый, с достаточным для картинки качеством.
 * Состояние — одно 32-битное число, поэтому поток полностью воспроизводим.
 */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Генератор по строковому seed. */
export function randomFromSeed(seed: string): Random {
  return mulberry32(hashSeed(seed));
}

/** Число в [min, max). */
export function between(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Целое в [min, max] включительно. */
export function intBetween(random: Random, min: number, max: number): number {
  return Math.floor(between(random, min, max + 1));
}

/** Случайный элемент непустого массива. */
export function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
