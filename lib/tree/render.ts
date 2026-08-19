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
 * Насколько дорожка утоплена в тень. Ветвь без тока — тёмная медь; ток по ней
 * пускает прилёт листа (см. слой lit в сцене). Базовый уровень тёмный
 * специально: дерево зажигается по мере наполнения, а не светит всё сразу.
 */
function depthDimming(depth: number): number {
  return Math.min(0.86, 0.52 + depth * 0.06);
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

  // По центру области оставлен зазор под ствол: две рамки стоят слева и справа
  // от корня, а не отдельной строкой под деревом. Ширина зазора — с запасом от
  // толщины ствола, чтобы дорожка проходила между ними, не задевая рамки.
  const trunkGap = 84;
  const slotWidth = (width - trunkGap) / 2;

  for (const left of [x, x + slotWidth + trunkGap]) {
    const slot = new Graphics();
    slot.roundRect(left, y, slotWidth, height, 4).stroke({
      width: 1.5,
      color: PALETTE.silk,
      alpha: 0.3,
    });
    container.addChild(slot);
  }

  return container;
}
