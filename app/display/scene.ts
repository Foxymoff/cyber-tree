/**
 * Сцена дерева: слои, листья, импульсы, режим покоя.
 *
 * Модуль знает про Pixi и ничего не знает про React и про опрос API — снаружи
 * ему говорят «прилетело пожелание» и «убери лист», остальное его дело.
 */
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { LEAF_SIDE_OFFSET, type Anchor, type Point, type Tree } from '@/lib/tree/generate';
import { createLeaf } from '@/lib/tree/leaf';
import { PALETTE } from '@/lib/tree/palette';
import { randomFromSeed } from '@/lib/tree/random';
import { buildSilkPlaceholders, buildTreeGraphics, specialtyColor } from '@/lib/tree/render';
import type { PublicWish } from '@/lib/types';

/** Длительность бега импульса от корня до листа, раздел 8 ТЗ: 0.8–1.2 с. */
const PULSE_MIN_MS = 800;
const PULSE_MAX_MS = 1200;
/** Вспышка листа сразу после прилёта. */
const FLASH_MS = 520;
/** Раз в сколько всплывает случайное старое пожелание. */
const ECHO_MIN_MS = 20_000;
const ECHO_MAX_MS = 30_000;
/** Как часто по случайной дорожке пробегает фоновый импульс. */
const AMBIENT_MIN_MS = 2600;
const AMBIENT_MAX_MS = 6200;

export interface SceneCallbacks {
  /** Показать карточку пожелания поверх экрана. */
  onWishArrived: (wish: PublicWish) => void;
  /** Негромко всплыть старым пожеланием в углу. */
  onEcho: (wish: PublicWish) => void;
}

interface ActivePulse {
  path: Point[];
  lengths: number[];
  total: number;
  color: number;
  elapsed: number;
  duration: number;
  /** Что сделать, когда импульс дошёл. */
  onArrive?: () => void;
}

interface PlacedLeaf {
  wish: PublicWish;
  anchor: Anchor;
  view: Container;
  label: Text;
  /** Сдвиг фазы дыхания, чтобы листья не мигали в такт. */
  phase: number;
  /** Остаток вспышки после прилёта. */
  flash: number;
}

function segmentLengths(path: readonly Point[]): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const length = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lengths.push(length);
    total += length;
  }
  return { lengths, total };
}

/** Точка на ломаной по доле пройденного пути. */
function pointAt(path: readonly Point[], lengths: readonly number[], distance: number): Point {
  let left = distance;
  for (let i = 0; i < lengths.length; i += 1) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : Math.min(1, left / lengths[i]);
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        y: path[i].y + (path[i + 1].y - path[i].y) * t,
      };
    }
    left -= lengths[i];
  }
  return path[path.length - 1];
}

export class TreeScene {
  private readonly app: Application;
  private readonly tree: Tree;
  private readonly callbacks: SceneCallbacks;
  private readonly fontFamily: string;

  /** Всё содержимое сцены — чтобы двигать камеру одним объектом. */
  private readonly world = new Container();
  private readonly leavesLayer = new Container();
  /** Подписи листьев: вне bloom, чтобы имена не размывались. */
  private readonly labelsLayer = new Container();
  private readonly pulseGraphics = new Graphics();
  private readonly counter: Text;

  private readonly leaves = new Map<number, PlacedLeaf>();
  /** Сколько точек крепления из общего пула уже занято. */
  private taken = 0;
  private readonly pulses: ActivePulse[] = [];

  private elapsed = 0;
  private nextEchoAt = ECHO_MIN_MS;
  private nextAmbientAt = AMBIENT_MIN_MS;
  /**
   * Случайность режима покоя. Посажена на тот же seed, что и дерево: иначе
   * фазы дыхания и фоновые импульсы каждый раз разные, и два скриншота одного
   * seed отличаются. Цикл доводки по картинкам этим ломается насмерть.
   */
  private readonly noise: () => number;
  /**
   * Стоп-кадр: покой заморожен, камера не дрейфует, фоновых импульсов нет.
   * Режим для съёмки — только в нём кадр воспроизводим байт в байт.
   */
  private readonly still: boolean;

  constructor(
    app: Application,
    tree: Tree,
    fontFamily: string,
    callbacks: SceneCallbacks,
    still = false,
  ) {
    this.app = app;
    this.tree = tree;
    this.fontFamily = fontFamily;
    this.callbacks = callbacks;
    this.still = still;
    this.noise = randomFromSeed(`${tree.seed}:idle`);

    // Слой свечения: дорожки, импульсы, листья.
    const glowLayer = new Container();
    glowLayer.addChild(buildTreeGraphics(tree));
    glowLayer.addChild(this.pulseGraphics);
    glowLayer.addChild(this.leavesLayer);
    // Область фильтра — ровно сцена. Без неё Pixi пересчитывает границы
    // каждый кадр, а лишний запас по краям это чистая трата закраски.
    glowLayer.filterArea = new Rectangle(0, 0, tree.width, tree.height);

    const bloom = new AdvancedBloomFilter({
      threshold: 0.52,
      bloomScale: 0.72,
      brightness: 1,
      blur: 5,
      quality: 4,
    });
    // Свечение считается в половинном разрешении. Bloom на весь экран —
    // самая дорогая часть кадра, а размытое пятно от снижения разрешения
    // вдвое на глаз не отличается. Раздел 8 ТЗ прямо предупреждает, что
    // полноэкранный bloom надо проверять заранее.
    bloom.resolution = 0.5;
    glowLayer.filters = [bloom];

    // Слой шелкографии: плоский цвет, вне bloom — иначе подписи поплывут.
    const silkLayer = new Container();
    silkLayer.addChild(buildSilkPlaceholders(tree));
    silkLayer.addChild(this.labelsLayer);

    this.counter = new Text({
      text: 'листьев на дереве: 0',
      style: new TextStyle({
        fontFamily,
        fontSize: 22,
        fill: PALETTE.silk,
        letterSpacing: 1.4,
      }),
    });
    this.counter.alpha = 0.5;
    this.counter.position.set(48, tree.height - 56);

    this.world.addChild(glowLayer, silkLayer);
    app.stage.addChild(this.world);
    // Счётчик вне мира: он не должен ездить вместе с камерой.
    app.stage.addChild(this.counter);

    app.ticker.add(this.tick);
  }

  /**
   * Следующая свободная точка из общего пула. Пул упорядочен снизу вверх
   * слоями, поэтому дерево заполняется от основания независимо от того, какой
   * специальности пришло пожелание.
   */
  private takeAnchor(): Anchor | null {
    if (this.taken >= this.tree.anchors.length) return null;
    const anchor = this.tree.anchors[this.taken];
    this.taken += 1;
    return anchor;
  }

  /**
   * Добавить лист.
   *
   * animate = false для листьев, которые уже висели на дереве до открытия
   * страницы: они должны просто быть, без импульса и карточки.
   */
  addWish(wish: PublicWish, animate: boolean): void {
    if (this.leaves.has(wish.id)) return;

    const anchor = this.takeAnchor();
    if (anchor === null) return;

    // Цвет — от специальности пожелания, а не от того, на какую магистраль
    // лист сел. Так цвета перемешаны, а не собраны кучками.
    const color = specialtyColor(wish.specialty);
    const { view, label } = createLeaf({
      name: wish.name,
      color,
      size: anchor.size,
      fontFamily: this.fontFamily,
    });
    // Корпус смещён от дорожки в сторону, чтобы не лежать прямо на ней.
    const x = anchor.point.x;
    const y = anchor.point.y + anchor.side * LEAF_SIDE_OFFSET;
    view.position.set(x, y);
    label.position.set(x, y);

    const placed: PlacedLeaf = {
      wish,
      anchor,
      view,
      label,
      phase: this.noise() * Math.PI * 2,
      flash: 0,
    };

    if (animate) {
      view.alpha = 0;
      label.alpha = 0;
      const { lengths, total } = segmentLengths(anchor.path);
      this.pulses.push({
        path: anchor.path,
        lengths,
        total,
        color: PALETTE.copperHot,
        elapsed: 0,
        duration: PULSE_MIN_MS + this.noise() * (PULSE_MAX_MS - PULSE_MIN_MS),
        onArrive: () => {
          placed.flash = FLASH_MS;
        },
      });
      // Карточка идёт одновременно с импульсом — так требует раздел 8.
      this.callbacks.onWishArrived(wish);
    }

    this.leavesLayer.addChild(view);
    this.labelsLayer.addChild(label);
    this.leaves.set(wish.id, placed);
    this.updateCounter();
  }

  /** Снять лист с экрана: модератор отклонил уже опубликованное. */
  removeWish(id: number): void {
    const placed = this.leaves.get(id);
    if (!placed) return;

    this.leavesLayer.removeChild(placed.view);
    this.labelsLayer.removeChild(placed.label);
    placed.view.destroy({ children: true });
    placed.label.destroy();
    this.leaves.delete(id);

    // Точку крепления не возвращаем в оборот: пусть дерево не перекладывает
    // уже висящие листья. Свободных мест кратно больше, чем пожеланий.
    this.updateCounter();
  }

  private updateCounter(): void {
    this.counter.text = `листьев на дереве: ${this.leaves.size}`;
  }

  /** Фоновый импульс по случайной дорожке — экран не должен выглядеть мёртвым. */
  private startAmbientPulse(): void {
    const traces = this.tree.traces;
    if (traces.length === 0) return;
    const trace = traces[Math.floor(this.noise() * traces.length)];
    const { lengths, total } = segmentLengths(trace.points);
    if (total <= 0) return;

    this.pulses.push({
      path: trace.points,
      lengths,
      total,
      color: PALETTE.copperDim,
      elapsed: 0,
      duration: 900 + this.noise() * 700,
    });
  }

  private drawPulses(deltaMs: number): void {
    this.pulseGraphics.clear();

    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i];
      pulse.elapsed += deltaMs;
      const progress = Math.min(1, pulse.elapsed / pulse.duration);
      const head = pulse.total * progress;

      // Хвост: несколько точек позади головы, ярче к голове.
      const tail = Math.min(120, pulse.total * 0.22);
      const steps = 9;
      for (let s = 0; s < steps; s += 1) {
        const back = (tail * s) / steps;
        const distance = head - back;
        if (distance < 0) continue;
        const point = pointAt(pulse.path, pulse.lengths, distance);
        const fade = 1 - s / steps;
        this.pulseGraphics
          .circle(point.x, point.y, 1.6 + fade * 3.4)
          .fill({ color: pulse.color, alpha: fade * 0.9 });
      }

      if (progress >= 1) {
        pulse.onArrive?.();
        this.pulses.splice(i, 1);
      }
    }
  }

  private driftCamera(): void {
    // Очень медленный дрейф: за минуту сдвиг едва заметен глазу.
    const t = this.elapsed / 1000;
    const scale = 1.012 + Math.sin(t * 0.037) * 0.012;
    this.world.scale.set(scale);
    this.world.position.set(
      (this.tree.width * (1 - scale)) / 2 + Math.sin(t * 0.021) * 12,
      (this.tree.height * (1 - scale)) / 2 + Math.cos(t * 0.017) * 9,
    );
  }

  private breatheLeaves(deltaMs: number): void {
    for (const leaf of this.leaves.values()) {
      if (this.still) {
        leaf.view.scale.set(1);
        leaf.view.alpha = 0.9;
        leaf.label.scale.set(1);
        leaf.label.alpha = 0.9;
        continue;
      }
      if (leaf.flash > 0) {
        leaf.flash = Math.max(0, leaf.flash - deltaMs);
        const t = leaf.flash / FLASH_MS;
        // Вспышка ярче нормы, затем оседание.
        leaf.view.alpha = 1 + t * 0.9;
        leaf.view.scale.set(1 + t * 0.12);
        leaf.label.alpha = 1 + t * 0.9;
        leaf.label.scale.set(1 + t * 0.12);
        continue;
      }
      leaf.view.scale.set(1);
      leaf.label.scale.set(1);
      // Еле заметное дыхание свечения.
      const alpha = 0.9 + Math.sin(this.elapsed / 1400 + leaf.phase) * 0.08;
      leaf.view.alpha = alpha;
      leaf.label.alpha = alpha;
    }
  }

  private maybeEcho(): void {
    if (this.elapsed < this.nextEchoAt) return;
    this.nextEchoAt = this.elapsed + ECHO_MIN_MS + this.noise() * (ECHO_MAX_MS - ECHO_MIN_MS);

    const all = [...this.leaves.values()];
    if (all.length === 0) return;
    const pick = all[Math.floor(this.noise() * all.length)];
    this.callbacks.onEcho(pick.wish);
  }

  private readonly tick = (): void => {
    const deltaMs = this.app.ticker.deltaMS;

    if (this.still) {
      // В стоп-кадре время не идёт: ни дрейфа, ни импульсов, ни всплытий.
      this.breatheLeaves(deltaMs);
      return;
    }

    this.elapsed += deltaMs;

    if (this.elapsed >= this.nextAmbientAt) {
      this.nextAmbientAt =
        this.elapsed + AMBIENT_MIN_MS + this.noise() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
      this.startAmbientPulse();
    }

    this.drawPulses(deltaMs);
    this.breatheLeaves(deltaMs);
    this.driftCamera();
    this.maybeEcho();
  };

  /** Сколько листьев сейчас на дереве. */
  get leafCount(): number {
    return this.leaves.size;
  }

  /**
   * Снимок сцены в двойном разрешении. Раздел 12 ТЗ, для соцсетей колледжа.
   *
   * Берётся именно через renderer.extract, а не скриншотом окна: так в кадр
   * попадает ровно сцена 1920x1080 без браузерной обвязки и в честном 2x.
   */
  async capture(scale = 2): Promise<Blob | null> {
    const canvas = this.app.renderer.extract.canvas({
      target: this.app.stage,
      resolution: scale,
    }) as HTMLCanvasElement;

    if (typeof canvas.toBlob !== 'function') return null;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.leaves.clear();
    this.pulses.length = 0;
  }
}
