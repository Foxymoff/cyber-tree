/**
 * Отрисовка дерева средствами Pixi.
 *
 * Модуль знает про Pixi, но не про React и не про опрос API: на вход —
 * структура из generate.ts, на выход — заполненные контейнеры.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
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
 * Косметика незажжённых веток. Меняется ТОЛЬКО отрисовка базового слоя —
 * геометрию, пути и anchor'ы не трогаем. Убранные сегменты по-прежнему
 * существуют в данных: когда на них садится лист, их рисует слой lit (см.
 * сцену), поэтому ёмкость точек крепления не страдает.
 *
 * Глубже этого уровня незажжённые сегменты не рисуем: тончайшие концевые
 * прутики только рябят и не собираются в силуэт. Заполнение идёт снизу вверх,
 * так что при ожидаемых числах листьев эти концы пустые.
 */
const UNLIT_MAX_DEPTH = 5;

/**
 * Пятачки мельче этого радиуса не рисуем: это дробные точки на голых концах
 * кроны, они рябят и не читаются как деталь. Крупные пятачки магистральных
 * стыков (радиус больше порога) остаются — они держат «плату».
 */
const VIA_MIN_RADIUS = 4.5;

/**
 * Насколько дорожка утоплена в тень. Ветвь без тока — тёмная медь; ток по ней
 * пускает прилёт листа (см. слой lit в сцене). Кривая крутая: глубокие ветви
 * почти сливаются с фоном и читаются силуэтом, а не деталью переднего плана.
 */
function depthDimming(depth: number): number {
  return Math.min(0.9, 0.5 + depth * 0.08);
}

/** Дорожки. Стыки намеренно оставлены встык — их закрывают пятачки. */
export function drawTraces(target: Graphics, traces: readonly Trace[]): void {
  for (const trace of traces) {
    // Тончайшие концевые сегменты не рисуем — см. UNLIT_MAX_DEPTH.
    if (trace.depth > UNLIT_MAX_DEPTH) continue;

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
    // Мелкие пятачки на голых концах кроны не рисуем — они рябят.
    if (via.radius < VIA_MIN_RADIUS) continue;

    // Оставшиеся тоже притоплены: пятачок — служебная деталь фона, а не акцент.
    const color = dim(branchColor(via.branchIndex), 0.45);
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

/** Ширина зазора под ствол между двумя логотипами у основания. */
const SILK_TRUNK_GAP = 84;

/**
 * Логотипы у основания дерева: college слева, ui справа, ствол между ними.
 * Порядок соответствует раскладке слотов в mountSilkLogos.
 */
const SILK_LOGOS = ['/logos/college.svg', '/logos/ui.svg'] as const;

/** Токен --silk в виде строки для SVG. */
function silkHex(): string {
  return `#${PALETTE.silk.toString(16).padStart(6, '0')}`;
}

/**
 * Загрузить SVG как одноцветную шелкографию.
 *
 * Все непустые заливки перекрашиваются в --silk: на плате шелкография
 * одноцветная, а исходники разноцветные (college зелёно-чёрный) или чёрные
 * (ui). fill="none" не трогаем — это невидимые служебные фигуры и корневой
 * атрибут, заливать их нечем и незачем; видимые фигуры ui заданы fill="black"
 * и потому окрашиваются, а не пропадают. Пропорции берутся из самого SVG.
 */
async function loadSilkTexture(url: string, silk: string): Promise<Texture> {
  const response = await fetch(url);
  const source = await response.text();
  const recolored = source.replace(/fill="(?!none")[^"]*"/g, `fill="${silk}"`);

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolored)}`;
  await image.decode();

  return Texture.from(image);
}

/**
 * Разместить логотипы у основания ствола. Асинхронно: спрайты появляются в
 * переданном слое, когда SVG загрузились и перекрасились.
 *
 * Слой — шелкография вне bloom, поэтому логотипы не светятся, как и положено
 * шелкографии на плате. Каждый вписан в свой слот с сохранением пропорций и
 * не залезает на ствол: по центру области оставлен зазор SILK_TRUNK_GAP.
 */
export async function mountSilkLogos(layer: Container, tree: Tree): Promise<void> {
  const silk = silkHex();
  const { x, y, width, height } = tree.silkArea;
  const slotWidth = (width - SILK_TRUNK_GAP) / 2;
  const slots = [x, x + slotWidth + SILK_TRUNK_GAP];

  await Promise.all(
    SILK_LOGOS.map(async (url, index) => {
      const texture = await loadSilkTexture(url, silk);
      const sprite = new Sprite(texture);
      // Вписать в слот, сохранив пропорции исходника.
      const scale = Math.min(slotWidth / texture.width, height / texture.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5);
      sprite.position.set(slots[index] + slotWidth / 2, y + height / 2);
      // Шелкография не в полную силу: служебная подпись, а не акцент.
      sprite.alpha = 0.82;
      layer.addChild(sprite);
    }),
  );
}
