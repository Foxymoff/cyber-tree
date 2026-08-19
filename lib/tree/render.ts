/**
 * Отрисовка дерева средствами Pixi.
 *
 * Модуль знает про Pixi, но не про React и не про опрос API: на вход —
 * структура из generate.ts, на выход — заполненные контейнеры.
 */
import { Container, Graphics } from 'pixi.js';
import { getSpecialty } from '@/config/specialties';
import type { Tree, Trace, Via } from './generate';
import { PALETTE, dim, hexToNumber } from './palette';

/**
 * Цвет дорожки. Магистрали больше не соответствуют специальностям, поэтому
 * все дорожки — медь без подкраски. Цвет несут листья, а не разводка: так это
 * и выглядит на настоящей плате.
 */
export function branchColor(_branchIndex: number): number {
  return PALETTE.copperDim;
}

/** Чистый акцент специальности по её id — им светится лист. */
export function specialtyColor(specialtyId: string): number {
  const specialty = getSpecialty(specialtyId);
  // Пожелание с неизвестной специальностью не теряем: светим медью под током.
  return specialty ? hexToNumber(specialty.color) : PALETTE.copperHot;
}

/**
 * Насколько дорожка утоплена в тень. Глубокие ветви тише магистральных,
 * иначе крона превращается в равномерную кашу.
 */
function depthDimming(depth: number): number {
  // Дорожки — это «медь в тени», раздел 8. Даже магистраль приглушена:
  // боевую яркость экран тратит на прилёт листа, а не на фон.
  return Math.min(0.78, 0.34 + depth * 0.075);
}

/** Дорожки. Стыки намеренно оставлены встык — их закрывают пятачки. */
export function drawTraces(target: Graphics, traces: readonly Trace[]): void {
  for (const trace of traces) {
    const [first, ...rest] = trace.points;
    target.moveTo(first.x, first.y);
    for (const point of rest) target.lineTo(point.x, point.y);

    target.stroke({
      width: trace.width,
      color: dim(branchColor(trace.branchIndex), depthDimming(trace.depth)),
      alpha: 1,
      cap: 'butt',
      // Митра, а не скругление: у дорожек на плате повороты срезаны фаской.
      join: 'miter',
    });
  }
}

/**
 * Переходные отверстия. Настоящее via — это кольцо: медное окружение и
 * отверстие посередине, поэтому рисуем заливку и вырез цветом маски.
 */
export function drawVias(target: Graphics, vias: readonly Via[]): void {
  for (const via of vias) {
    const color = dim(branchColor(via.branchIndex), 0.1);
    target.circle(via.point.x, via.point.y, via.radius).fill({ color });
    target.circle(via.point.x, via.point.y, via.radius * 0.42).fill({ color: PALETTE.bg });
  }
}

/** Статичный слой дерева: дорожки и пятачки. Перерисовывается редко. */
export function buildTreeGraphics(tree: Tree): Graphics {
  const graphics = new Graphics();
  drawTraces(graphics, tree.traces);
  drawVias(graphics, tree.vias);
  return graphics;
}

/**
 * Заглушки логотипов у основания ствола.
 *
 * Настоящих SVG пока нет. Шелкография на плате — плоский цвет без свечения
 * и без градиентов, поэтому и заглушки такие же: тонкая рамка цветом --silk.
 * Когда файлы появятся в /public/logos/, эта функция заменяется на загрузку
 * спрайтов в тот же контейнер и с той же геометрией.
 */
export function buildSilkPlaceholders(tree: Tree): Container {
  const container = new Container();
  const { x, y, width, height } = tree.silkArea;
  const slots = 2;
  const gap = 24;
  const slotWidth = (width - gap * (slots - 1)) / slots;

  for (let i = 0; i < slots; i += 1) {
    const slot = new Graphics();
    const left = x + i * (slotWidth + gap);
    slot.rect(left, y, slotWidth, height).stroke({ width: 1.5, color: PALETTE.silk, alpha: 0.28 });
    container.addChild(slot);
  }

  return container;
}
