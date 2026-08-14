/**
 * Лист — силуэт микросхемы в корпусе. Раздел 8 ТЗ.
 *
 * Скруглённый корпус, ножки по бокам, точка первого вывода в углу, свечение
 * по контуру в цвете специальности. Внутри только имя, моноширинным шрифтом.
 * Два размера чередуются.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { PALETTE, dim, mixColors } from './palette';

export type LeafSize = 'small' | 'large';

export interface LeafOptions {
  name: string;
  /** Чистый акцент специальности. */
  color: number;
  size: LeafSize;
  /** Имя шрифта для подписи. */
  fontFamily: string;
}

interface SizeSpec {
  fontSize: number;
  paddingX: number;
  height: number;
  radius: number;
  legCount: number;
  legLength: number;
  legWidth: number;
  maxChars: number;
}

const SIZES: Record<LeafSize, SizeSpec> = {
  large: {
    fontSize: 15,
    paddingX: 13,
    height: 30,
    radius: 5,
    legCount: 4,
    legLength: 5,
    legWidth: 3,
    maxChars: 14,
  },
  small: {
    fontSize: 12,
    paddingX: 10,
    height: 24,
    radius: 4,
    legCount: 3,
    legLength: 4,
    legWidth: 2.5,
    maxChars: 11,
  },
};

/**
 * Имя может быть длиной до 30 символов, а корпус микросхемы такой ширины
 * перестанет быть похож на корпус. Поэтому режем по многоточию.
 */
function fitName(name: string, maxChars: number): string {
  const trimmed = name.trim();
  const characters = Array.from(trimmed);
  if (characters.length <= maxChars) return trimmed;
  return `${characters.slice(0, maxChars - 1).join('')}…`;
}

/** Контейнер листа с началом координат в точке крепления. */
export function createLeaf(options: LeafOptions): Container {
  const spec = SIZES[options.size];
  const container = new Container();

  const label = new Text({
    text: fitName(options.name, spec.maxChars),
    style: new TextStyle({
      fontFamily: options.fontFamily,
      fontSize: spec.fontSize,
      fill: mixColors(options.color, 0xffffff, 0.55),
      letterSpacing: 0.6,
    }),
  });

  const bodyWidth = Math.round(label.width + spec.paddingX * 2);
  const bodyHeight = spec.height;
  const left = -bodyWidth / 2;
  const top = -bodyHeight / 2;

  // Ножки по бокам. Рисуются под корпусом, чтобы он их подрезал.
  const legs = new Graphics();
  const legColor = dim(options.color, 0.35);
  for (let i = 0; i < spec.legCount; i += 1) {
    const t = (i + 1) / (spec.legCount + 1);
    const y = top + bodyHeight * t - spec.legWidth / 2;
    legs.rect(left - spec.legLength, y, spec.legLength, spec.legWidth).fill({ color: legColor });
    legs.rect(left + bodyWidth, y, spec.legLength, spec.legWidth).fill({ color: legColor });
  }
  container.addChild(legs);

  // Корпус: тёмная заливка и светящийся контур цветом специальности.
  const body = new Graphics();
  body
    .roundRect(left, top, bodyWidth, bodyHeight, spec.radius)
    .fill({ color: mixColors(PALETTE.bg, options.color, 0.12) })
    .stroke({ width: 1.6, color: options.color, alpha: 0.95 });
  container.addChild(body);

  // Точка первого вывода — как на настоящем корпусе, в углу.
  const pinOne = new Graphics();
  pinOne
    .circle(left + spec.paddingX * 0.5, top + bodyHeight * 0.28, 2)
    .fill({ color: options.color, alpha: 0.9 });
  container.addChild(pinOne);

  label.anchor.set(0.5);
  label.position.set(0, 0);
  container.addChild(label);

  return container;
}
