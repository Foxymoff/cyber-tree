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
  /** Поля кадра при подгонке готового дерева. */
  sideMargin: number;
  topMargin: number;
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
  /**
   * На сколько ниже крепится к стволу самая крайняя магистраль.
   *
   * Все ветви из одной точки дают силуэт буквы V. Когда внешние отходят
   * ниже центральных, крона становится куполом, а низ кадра перестаёт
   * пустовать.
   */
  trunkSpread: number;
  /** Насколько короче ведомая ветвь по сравнению с ведущей на той же развилке. */
  minorScale: number;
  /** До какой глубины ведущая ветвь принудительно уходит наружу. */
  outwardDepth: number;
  maxDepth: number;
  /**
   * Поправка длины крайних магистралей относительно центральной.
   *
   * Отрицательное значение делает крайние длиннее. Так и надо: они крепятся
   * ниже по стволу, и без запаса длины крона получается вогнутой — центральная
   * ветвь торчит вверх, а крайние не дотягиваются.
   */
  crownFalloff: number;
  /** С какой глубины дорожка начинает нести листья. */
  anchorMinDepth: number;
  /** Шаг между точками крепления вдоль дорожки. */
  anchorSpacing: number;
  /**
   * Минимальный зазор между соседними листьями при раздаче.
   *
   * Точек крепления намеренно больше, чем нужно, и подряд идущие лежат в
   * 19 пикселях друг от друга — это втрое меньше корпуса листа. Если раздавать
   * их подряд, первые же десять пожеланий слипнутся в кучу у основания ветви.
   * Поэтому раздача идёт в два яруса: сначала разнесённые не ближе этого
   * зазора, и лишь когда они кончились — промежуточные.
   *
   * Зазор задан габаритом корпуса, а не радиусом: лист вытянут по горизонтали,
   * и круговая проверка отсекала бы вполне пригодные точки этажом выше.
   */
  leafGapX: number;
  leafGapY: number;
  viaRadius: number;
}

export const DEFAULT_PARAMS: TreeParams = {
  branchCount: SPECIALTIES.length,
  width: 1920,
  height: 1080,
  baseMargin: 96,
  sideMargin: 96,
  topMargin: 72,
  trunkLength: 300,
  trunkWidth: 16,
  widthDecay: 0.74,
  minWidth: 2,
  runLength: 178,
  runDecay: 0.83,
  runJitter: 0.22,
  trunkSpread: 150,
  minorScale: 0.66,
  outwardDepth: 3,
  maxDepth: 6,
  crownFalloff: -0.12,
  anchorMinDepth: 1,
  anchorSpacing: 19,
  leafGapX: 104,
  leafGapY: 30,
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

/** Вниз дорожки не уходят: дерево растёт, а не свисает. */
const UPWARD = [6, 7, 0, 1, 2] as const;
/** Чистые горизонтали. */
const HORIZONTAL = [2, 6] as const;

/**
 * Можно ли расти в этом направлении на этой глубине.
 *
 * Горизонтали разрешены только магистралям у основания кроны: ими ветвь
 * уходит вширь и заполняет кадр 16:9. Выше они запрещены — иначе крона
 * расплывается плоской полосой и силуэт читается как буква V, а не дерево.
 */
function isAllowed(direction: number, depth: number, params: TreeParams): boolean {
  if (!(UPWARD as readonly number[]).includes(direction)) return false;
  if ((HORIZONTAL as readonly number[]).includes(direction)) return depth <= params.outwardDepth;
  return true;
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
  /**
   * Куда для этой магистрали «наружу»: -1 влево, +1 вправо.
   *
   * На малых глубинах ведущая ветвь поворачивает именно туда. Без этого
   * каждая магистраль расходится симметрично, дерево растёт вверх столбом
   * и не заполняет кадр 16:9 по ширине.
   */
  outward: -1 | 1;
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

  // На развилке одна ветвь ведущая, вторая заметно короче. Без этого обе
  // дочерние растут одинаково, и крона превращается в правильную решётку,
  // которая читается как узор, а не как дерево.
  // На первых уровнях ведущая ветвь идёт наружу — это задаёт разлёт кроны.
  // Глубже направление выбирается свободно, иначе крона станет причёсанной.
  const leadOutward = depth <= params.outwardDepth;
  const leaderFirst = leadOutward ? turns[0] === context.outward : random() < 0.5;

  turns.forEach((turn, order) => {
    let next = (direction + turn + DIRECTIONS.length) % DIRECTIONS.length;
    if (!isAllowed(next, depth + 1, params)) next = direction;
    // Если и текущее направление уже нельзя (горизонталь выше нужной глубины),
    // сворачиваем на ближайшую диагональ вверх.
    if (!isAllowed(next, depth + 1, params)) next = context.outward > 0 ? 1 : 7;

    const isLeader = turns.length === 1 || (order === 0) === leaderFirst;
    const scale = isLeader ? 1 : params.minorScale;
    grow({ ...context, lengthScale: context.lengthScale * scale }, end, next, depth + 1, pathToEnd);
  });
}

interface Attachment {
  /** Точка на стволе, где отходит магистраль. */
  point: Point;
  /** Начальное направление роста: индекс в DIRECTIONS. */
  direction: number;
  /** Удалённость от центра кроны: 0 — центральная ветвь, 1 — крайняя. */
  away: number;
  /** В какую сторону этой магистрали расти наружу. */
  outward: -1 | 1;
}

/**
 * Куда и под каким углом крепится магистраль.
 *
 * Раскладка целиком считается от количества специальностей, поэтому одинаково
 * работает и на трёх ветвях, и на шести. Захардкоженных чисел веток нет.
 *
 * Крайние магистрали отходят ниже по стволу и сразу забирают диагональю в
 * сторону, центральные — выше и вертикально. Так получается купол.
 */
function attachmentFor(
  base: Point,
  trunkTop: Point,
  index: number,
  count: number,
  params: TreeParams,
): Attachment {
  if (count === 1) return { point: trunkTop, direction: 0, away: 0, outward: 1 };

  const t = (index / (count - 1)) * 2 - 1; // -1 слева .. +1 справа
  const away = Math.abs(t);
  const point = { x: base.x, y: trunkTop.y + away * params.trunkSpread };
  // Чем дальше магистраль от центра, тем положе она стартует: крайние уходят
  // горизонтально и растаскивают крону по ширине, центральная идёт вверх.
  // 6 — влево, 7 — вверх-влево, 0 — вверх, 1 — вверх-вправо, 2 — вправо.
  // Стартуют все диагональю, а не горизонталью: горизонтальный первый пробег
  // выкладывает под кроной плоский рельс, и дерево распадается на отдельные
  // кусты, стоящие на перекладине.
  const direction = away > 0.15 ? (t < 0 ? 7 : 1) : 0;

  return { point, direction, away, outward: t < 0 ? -1 : 1 };
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
    const attachment = attachmentFor(base, trunkTop, index, branchCount, params);
    const lengthScale = 1 - params.crownFalloff * attachment.away;
    const startPoint = attachment.point;

    vias.push({ point: startPoint, radius: params.viaRadius * 1.2, branchIndex: index });

    const context: GrowContext = {
      params,
      lengthScale,
      outward: attachment.outward,
      random,
      traces,
      vias,
      anchors: [],
      branchIndex: index,
      nextAnchorId,
    };

    // Путь от основания: подъём по стволу до места крепления.
    const pathToStart = [base, startPoint];
    grow(context, startPoint, attachment.direction, 1, pathToStart);

    // Снизу вверх: на экране ось y растёт вниз, поэтому больший y — ниже.
    const ordered = context.anchors.sort((a, b) => b.point.y - a.point.y || a.point.x - b.point.x);

    // Первый ярус: точки, разнесённые не ближе leafGap. Жадный проход снизу
    // вверх, поэтому дерево заполняется от основания и без наложений.
    const spread: Anchor[] = [];
    const reserve: Anchor[] = [];
    for (const anchor of ordered) {
      const farEnough = spread.every(
        (taken) =>
          Math.abs(taken.point.x - anchor.point.x) >= params.leafGapX ||
          Math.abs(taken.point.y - anchor.point.y) >= params.leafGapY,
      );
      if (farEnough) spread.push(anchor);
      else reserve.push(anchor);
    }

    const finalOrder = [...spread, ...reserve];
    // Размер чередуется по порядку раздачи, а не по порядку обхода.
    finalOrder.forEach((anchor, order) => {
      anchor.size = order % 2 === 0 ? 'large' : 'small';
    });

    anchorsByBranch.push(finalOrder);
  }

  const raw: Tree = {
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

  return fitToFrame(raw, params);
}

/**
 * Вписать готовое дерево в кадр.
 *
 * Масштабирование строго равномерное: при нём углы сохраняются, а значит
 * кратность 45° никуда не девается. Неравномерное растяжение испортило бы
 * всю разводку, поэтому его здесь нет.
 *
 * Зачем это нужно: разброс между seed'ами и между длинами списка
 * специальностей велик, и без подгонки дерево то не дотягивается до краёв,
 * то вылезает за них. После подгонки композиция предсказуема при любом seed.
 * Детерминизм не страдает — преобразование считается от самого дерева.
 */
function fitToFrame(tree: Tree, params: TreeParams): Tree {
  const points = tree.traces.flatMap((trace) => trace.points);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const availableWidth = params.width - params.sideMargin * 2;
  const availableHeight = params.height - params.baseMargin - params.topMargin;
  const scale = Math.min(availableWidth / boxWidth, availableHeight / boxHeight);

  const centerX = (minX + maxX) / 2;
  const bottomY = params.height - params.baseMargin;

  const map = (point: Point): Point => ({
    x: params.width / 2 + (point.x - centerX) * scale,
    y: bottomY - (maxY - point.y) * scale,
  });

  return {
    ...tree,
    traces: tree.traces.map((trace) => ({
      ...trace,
      points: trace.points.map(map),
      width: trace.width * scale,
    })),
    vias: tree.vias.map((via) => ({ ...via, point: map(via.point), radius: via.radius * scale })),
    anchorsByBranch: tree.anchorsByBranch.map((branch) =>
      branch.map((anchor) => ({
        ...anchor,
        point: map(anchor.point),
        path: anchor.path.map(map),
        pathLength: anchor.pathLength * scale,
      })),
    ),
    base: map(tree.base),
    silkArea: {
      ...tree.silkArea,
      x: params.width / 2 - tree.silkArea.width / 2,
      y: bottomY + 14,
    },
  };
}

/** Сколько всего листьев дерево способно принять. */
export function anchorCapacity(tree: Tree): number {
  return tree.anchorsByBranch.reduce((sum, branch) => sum + branch.length, 0);
}
