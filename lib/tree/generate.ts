/**
 * Генерация дерева. Чистая функция: seed на входе, структура на выходе.
 *
 * Здесь нет ни Pixi, ни DOM, ни единого рисующего вызова — только геометрия.
 * Благодаря этому дерево можно проверить в тестах и сравнить два прогона.
 *
 * Дерево строится как разводка печатной платы, раздел 8 ТЗ:
 * направления дорожек только кратны 45°, повороты срезаны фаской (она
 * получается сама собой, потому что поворот идёт через диагональный пробег,
 * а не через дугу), на стыках стоят круглые пятачки переходных отверстий,
 * толщина убывает с глубиной ветвления.
 */
import { SPECIALTIES } from '@/config/specialties';
import { between, intBetween, randomFromSeed, type Random } from './random';

export interface Point {
  x: number;
  y: number;
}

/** Дорожка: ломаная с постоянной толщиной. */
export interface Trace {
  points: Point[];
  width: number;
  /** Глубина ветвления: 0 — ствол. От неё зависит толщина и яркость. */
  depth: number;
  /** Индекс магистрали в SPECIALTIES, либо -1 для ствола. */
  branchIndex: number;
}

/** Переходное отверстие на стыке дорожек. */
export interface Via {
  point: Point;
  radius: number;
  branchIndex: number;
}

/** Точка крепления листа. */
export interface Anchor {
  id: number;
  point: Point;
  /** Индекс магистрали в SPECIALTIES. */
  branchIndex: number;
  /**
   * Полная ломаная от основания ствола до точки крепления.
   *
   * Хранится именно весь путь, а не только конечная точка: по нему при
   * прилёте пожелания бежит импульс света. Восстановить его задним числом
   * из плоского списка дорожек нельзя.
   */
  path: Point[];
  /** Длина пути, чтобы импульс шёл с одинаковой скоростью на любой ветви. */
  pathLength: number;
  /** Два размера листа чередуются — раздел 8 ТЗ. */
  size: 'small' | 'large';
  /** В какую сторону от дорожки смещён корпус листа. */
  side: -1 | 1;
}

export interface Tree {
  seed: string;
  width: number;
  height: number;
  traces: Trace[];
  vias: Via[];
  /**
   * Точки крепления, сгруппированные по магистрали и упорядоченные снизу
   * вверх. Пожелание получает точку своей специальности по порядку, поэтому
   * дерево заполняется естественно, а не пятнами.
   */
  anchorsByBranch: Anchor[][];
  /** Основание ствола: от него бежит импульс, рядом с ним шелкография. */
  base: Point;
  /** Место под логотипы у основания. Пока пустое, SVG подставят позже. */
  silkArea: { x: number; y: number; width: number; height: number };
}

/**
 * Параметры генерации. Вынесены в одно место, потому что доводка визуала —
 * это перебор именно этих чисел с просмотром скриншота после каждого шага.
 */
export interface TreeParams {
  /**
   * Число магистралей. По умолчанию берётся из config/specialties.ts и
   * задавать его вручную в приложении нельзя — иначе дерево разъедется
   * с формой и админкой. Переопределение существует только для тестов и
   * предпросмотра: надо уметь посмотреть, как выглядит крона на 3 и на 6
   * ветвях, не подменяя общий конфиг.
   */
  branchCount: number;
  width: number;
  height: number;
  /** Отступ основания ствола от нижнего края. */
  baseMargin: number;
  /** Длина ствола до места, где расходятся магистрали. */
  trunkLength: number;
  trunkWidth: number;
  /** Во сколько раз тоньше дорожка на каждом уровне ветвления. */
  widthDecay: number;
  minWidth: number;
  /** Длина пробега на первом уровне и её убывание с глубиной. */
  runLength: number;
  runDecay: number;
  runJitter: number;
  /** Насколько широко расходится веер магистралей. */
  fanSpread: number;
  maxDepth: number;
  /**
   * Насколько короче растут крайние магистрали по сравнению с центральной.
   *
   * Без этого крона получается вогнутой: подводка веера идёт под 45°, поэтому
   * чем дальше магистраль от центра, тем выше она стартует, и внешние ветви
   * перерастают центральную. Спад к краям возвращает силуэт к куполу.
   */
  crownFalloff: number;
  /** С какой глубины дорожка начинает нести листья. */
  anchorMinDepth: number;
  /** Шаг между точками крепления вдоль дорожки. */
  anchorSpacing: number;
  viaRadius: number;
}

export const DEFAULT_PARAMS: TreeParams = {
  branchCount: SPECIALTIES.length,
  width: 1920,
  height: 1080,
  baseMargin: 96,
  trunkLength: 170,
  trunkWidth: 16,
  widthDecay: 0.74,
  minWidth: 2,
  runLength: 128,
  runDecay: 0.86,
  runJitter: 0.22,
  fanSpread: 260,
  maxDepth: 7,
  crownFalloff: 0.3,
  anchorMinDepth: 2,
  anchorSpacing: 32,
  viaRadius: 7,
};

/**
 * Восемь направлений, кратных 45°, по часовой стрелке от «вверх».
 * Индексы соседей отличаются ровно на 45°, поэтому поворот — это ±1.
 */
const D = Math.SQRT1_2;
const DIRECTIONS: readonly Point[] = [
  { x: 0, y: -1 }, // 0  вверх
  { x: D, y: -D }, // 1  вверх-вправо
  { x: 1, y: 0 }, // 2  вправо
  { x: D, y: D }, // 3  вниз-вправо
  { x: 0, y: 1 }, // 4  вниз
  { x: -D, y: D }, // 5  вниз-влево
  { x: -1, y: 0 }, // 6  влево
  { x: -D, y: -D }, // 7  вверх-влево
];

/**
 * Направления, которыми дерево растёт вверх: от «влево» через «вверх»
 * до «вправо». Вниз дорожки не уходят — дерево должно расти, а не свисать.
 */
const UPWARD = [6, 7, 0, 1, 2] as const;

function isUpward(direction: number): boolean {
  return (UPWARD as readonly number[]).includes(direction);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** Толщина дорожки на заданной глубине. */
function widthAt(params: TreeParams, depth: number): number {
  return Math.max(params.minWidth, params.trunkWidth * params.widthDecay ** depth);
}

interface GrowContext {
  params: TreeParams;
  /** Множитель длины пробегов для этой магистрали. См. crownFalloff. */
  lengthScale: number;
  random: Random;
  traces: Trace[];
  vias: Via[];
  anchors: Anchor[];
  branchIndex: number;
  nextAnchorId: () => number;
}

/**
 * Расставить точки крепления вдоль дорожки.
 *
 * Листья висят по обе стороны поочерёдно, чтобы ветвь не выглядела
 * причёсанной в одну сторону.
 */
function placeAnchors(context: GrowContext, from: Point, to: Point, pathToStart: Point[]): void {
  const { params } = context;
  const length = distance(from, to);
  const count = Math.floor(length / params.anchorSpacing);
  if (count < 1) return;

  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const path = [...pathToStart, point];

    context.anchors.push({
      id: context.nextAnchorId(),
      point,
      branchIndex: context.branchIndex,
      path,
      pathLength: polylineLength(path),
      // Размер проставляется позже, когда точки отсортированы снизу вверх:
      // чередоваться должен порядок раздачи, а не порядок обхода дерева.
      size: 'large',
      side: i % 2 === 0 ? 1 : -1,
    });
  }
}

/**
 * Отрастить один пробег и рекурсивно продолжить ветвление.
 *
 * path — ломаная от основания ствола до текущей точки. Она передаётся вниз
 * по рекурсии и в конце оседает в точках крепления.
 */
function grow(
  context: GrowContext,
  start: Point,
  direction: number,
  depth: number,
  path: Point[],
): void {
  const { params, random } = context;
  if (depth > params.maxDepth) return;

  const base = params.runLength * context.lengthScale * params.runDecay ** (depth - 1);
  const length = base * between(random, 1 - params.runJitter, 1 + params.runJitter);
  const vector = DIRECTIONS[direction];
  const end = { x: start.x + vector.x * length, y: start.y + vector.y * length };

  const width = widthAt(params, depth);
  context.traces.push({
    points: [start, end],
    width,
    depth,
    branchIndex: context.branchIndex,
  });

  const pathToEnd = [...path, end];

  if (depth >= params.anchorMinDepth) {
    placeAnchors(context, start, end, path);
  }

  if (depth === params.maxDepth) {
    // Кончик ветви тоже несёт лист.
    context.anchors.push({
      id: context.nextAnchorId(),
      point: end,
      branchIndex: context.branchIndex,
      path: pathToEnd,
      pathLength: polylineLength(pathToEnd),
      size: 'large',
      side: 1,
    });
    return;
  }

  // Развилка: пятачок переходного отверстия и одна-две дочерние дорожки.
  context.vias.push({
    point: end,
    radius: Math.max(params.viaRadius * params.widthDecay ** depth, width * 0.8),
    branchIndex: context.branchIndex,
  });

  // До предпоследних уровней делимся всегда: одиночное ветвление наверху
  // вырождает магистраль, и на ней не остаётся мест под листья.
  const alwaysSplit = depth < params.maxDepth - 2;
  const children = alwaysSplit ? 2 : intBetween(random, 1, 2);
  const turns = children === 1 ? [random() < 0.5 ? -1 : 1] : [-1, 1];

  for (const turn of turns) {
    let next = (direction + turn + DIRECTIONS.length) % DIRECTIONS.length;
    // Наружу за пределы «вверх» не уходим: иначе ветви заваливаются вбок.
    if (!isUpward(next)) next = direction;
    grow(context, end, next, depth + 1, pathToEnd);
  }
}

/**
 * Веер магистралей от вершины ствола.
 *
 * Раскладка сделана как разводка шины на плате: каждая магистраль отходит
 * диагональю до своего горизонтального смещения, а дальше идёт вверх.
 * Поэтому веер одинаково осмысленно выглядит и на трёх ветвях, и на шести —
 * захардкоженных чисел здесь нет, всё считается от длины SPECIALTIES.
 */
function fanOut(trunkTop: Point, index: number, count: number, spread: number): Point[] {
  if (count === 1) return [trunkTop];

  // Смещения симметричны относительно центра: -1 .. +1.
  const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
  const offset = t * spread;
  if (Math.abs(offset) < 1) return [trunkTop];

  // Диагональ на 45°, значит по вертикали проходим столько же, сколько по
  // горизонтали. Затем поворот вверх.
  const corner = { x: trunkTop.x + offset, y: trunkTop.y - Math.abs(offset) };
  return [trunkTop, corner];
}

export function generateTree(seed: string, overrides: Partial<TreeParams> = {}): Tree {
  const params = { ...DEFAULT_PARAMS, ...overrides };
  const random = randomFromSeed(seed);

  const branchCount = Math.max(1, params.branchCount);
  const base: Point = { x: params.width / 2, y: params.height - params.baseMargin };
  const trunkTop: Point = { x: base.x, y: base.y - params.trunkLength };

  const traces: Trace[] = [
    { points: [base, trunkTop], width: params.trunkWidth, depth: 0, branchIndex: -1 },
  ];
  const vias: Via[] = [{ point: trunkTop, radius: params.viaRadius * 1.6, branchIndex: -1 }];

  let anchorId = 0;
  const nextAnchorId = () => {
    anchorId += 1;
    return anchorId;
  };

  const anchorsByBranch: Anchor[][] = [];

  for (let index = 0; index < branchCount; index += 1) {
    const lead = fanOut(trunkTop, index, branchCount, params.fanSpread);
    // Положение магистрали в веере: 0 — центр, 1 — самый край.
    const offCenter = branchCount === 1 ? 0 : Math.abs((index / (branchCount - 1)) * 2 - 1);
    const lengthScale = 1 - params.crownFalloff * offCenter;
    const startPoint = lead[lead.length - 1];

    if (lead.length > 1) {
      traces.push({
        points: lead,
        width: widthAt(params, 1),
        depth: 1,
        branchIndex: index,
      });
      vias.push({
        point: startPoint,
        radius: params.viaRadius,
        branchIndex: index,
      });
    }

    const context: GrowContext = {
      params,
      lengthScale,
      random,
      traces,
      vias,
      anchors: [],
      branchIndex: index,
      nextAnchorId,
    };

    // Путь от основания: ствол, затем подводка магистрали.
    const pathToStart = [base, ...lead.slice(1)];
    grow(context, startPoint, 0, 1, pathToStart);

    // Снизу вверх: на экране ось y растёт вниз, поэтому больший y — ниже.
    const ordered = context.anchors.sort((a, b) => b.point.y - a.point.y || a.point.x - b.point.x);
    // Размер чередуется по порядку раздачи, а не по порядку обхода.
    ordered.forEach((anchor, order) => {
      anchor.size = order % 2 === 0 ? 'large' : 'small';
    });

    anchorsByBranch.push(ordered);
  }

  return {
    seed,
    width: params.width,
    height: params.height,
    traces,
    vias,
    anchorsByBranch,
    base,
    silkArea: {
      x: base.x - 240,
      y: base.y + 14,
      width: 480,
      height: 64,
    },
  };
}

/** Сколько всего листьев дерево способно принять. */
export function anchorCapacity(tree: Tree): number {
  return tree.anchorsByBranch.reduce((sum, branch) => sum + branch.length, 0);
}
