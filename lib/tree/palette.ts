/**
 * Цвета сцены. Только токены раздела 8 ТЗ, новых не изобретаем.
 *
 * Здесь они продублированы числами, потому что Pixi принимает 0xRRGGBB, а не
 * строки CSS. Значения обязаны совпадать с app/globals.css — это один и тот же
 * набор токенов, записанный дважды из-за разницы форматов, а не второй источник
 * правды. Акценты специальностей сюда не переносятся: они живут в
 * config/specialties.ts рядом со своими специальностями.
 */
export const PALETTE = {
  /** Глубокий сине-чёрный, паяльная маска. */
  bg: 0x060a14,
  /** Медь дорожек в тени. */
  copperDim: 0xc88b3a,
  /** Медь под током. */
  copperHot: 0xf0c070,
  /** Шелкография: подписи и логотипы, без свечения. */
  silk: 0xe8e4d9,
} as const;

/** Цвет из строки вида «#4DE1C1» в число для Pixi. */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** Линейная смесь двух цветов, t = 0 отдаёт первый, t = 1 второй. */
export function mixColors(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;

  const r = Math.round(fr + (tr - fr) * clamped);
  const g = Math.round(fg + (tg - fg) * clamped);
  const b = Math.round(fb + (tb - fb) * clamped);

  return (r << 16) | (g << 8) | b;
}

/** Затемнение к фону: чем глубже дорожка, тем она тише. */
export function dim(color: number, amount: number): number {
  return mixColors(color, PALETTE.bg, amount);
}
