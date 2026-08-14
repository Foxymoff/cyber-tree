/**
 * Сцена дерева: слои, листья, импульсы, режим покоя.
 *
 * Модуль знает про Pixi и ничего не знает про React и про опрос API — снаружи
 * ему говорят «прилетело пожелание» и «убери лист», остальное его дело.
 */
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { SPECIALTIES } from '@/config/specialties';
import type { Anchor, Point, Tree } from '@/lib/tree/generate';
import { createLeaf } from '@/lib/tree/leaf';
import { PALETTE } from '@/lib/tree/palette';
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
  private readonly pulseGraphics = new Graphics();
  private readonly counter: Text;

  private readonly leaves = new Map<number, PlacedLeaf>();
  /** Сколько точек крепления уже занято на каждой магистрали. */
  private readonly takenByBranch: number[];
  private readonly pulses: ActivePulse[] = [];

  private elapsed = 0;
  private nextEchoAt = ECHO_MIN_MS;
  private nextAmbientAt = AMBIENT_MIN_MS;
  /** Отдельный поток случайности: покой не обязан быть воспроизводимым. */
  private readonly noise = () => Math.random();

  constructor(app: Application, tree: Tree, fontFamily: string, callbacks: SceneCallbacks) {
    this.app = app;
    this.tree = tree;
    this.fontFamily = fontFamily;
    this.callbacks = callbacks;
    this.takenByBranch = tree.anchorsByBranch.map(() => 0);

    // Слой свечения: дорожки, импульсы, листья.
    const glowLayer = new Container();
    glowLayer.addChild(buildTreeGraphics(tree));
    glowLayer.addChild(this.pulseGraphics);
    glowLayer.addChild(this.leavesLayer);
    glowLayer.filterArea = new Rectangle(-200, -200, tree.width + 400, tree.height + 400);
    glowLayer.filters = [
      new AdvancedBloomFilter({
        threshold: 0.52,
        bloomScale: 0.72,
        brightness: 1,
        blur: 5,
        quality: 5,
      }),
    ];

    // Слой шелкографии: плоский цвет, вне bloom — иначе подписи поплывут.
    const silkLayer = new Container();
    silkLayer.addChild(buildSilkPlaceholders(tree));

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

  /** Свободная точка крепления на нужной магистрали, снизу вверх. */
  private takeAnchor(specialtyId: string): Anchor | null {
    const branchIndex = SPECIALTIES.findIndex((item) => item.id === specialtyId);
    // Пожелание с неизвестной специальностью не теряем: вешаем на первую ветвь.
    const index = branchIndex >= 0 ? branchIndex : 0;
    const branch = this.tree.anchorsByBranch[index];
    if (!branch) return null;

    const taken = this.takenByBranch[index];
    if (taken >= branch.length) return null;
    this.takenByBranch[index] = taken + 1;
    return branch[taken];
  }

  /**
   * Добавить лист.
   *
   * animate = false для листьев, которые уже висели на дереве до открытия
   * страницы: они должны просто быть, без импульса и карточки.
   */
  addWish(wish: PublicWish, animate: boolean): void {
    if (this.leaves.has(wish.id)) return;

    const anchor = this.takeAnchor(wish.specialty);
    if (anchor === null) return;

    const color = specialtyColor(anchor.branchIndex);
    const view = createLeaf({
      name: wish.name,
      color,
      size: anchor.size,
      fontFamily: this.fontFamily,
    });
    // Корпус смещён от дорожки в сторону, чтобы не лежать прямо на ней.
    view.position.set(anchor.point.x, anchor.point.y + anchor.side * 16);

    const placed: PlacedLeaf = {
      wish,
      anchor,
      view,
      phase: this.noise() * Math.PI * 2,
      flash: 0,
    };

    if (animate) {
      view.alpha = 0;
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
    this.leaves.set(wish.id, placed);
    this.updateCounter();
  }

  /** Снять лист с экрана: модератор отклонил уже опубликованное. */
  removeWish(id: number): void {
    const placed = this.leaves.get(id);
    if (!placed) return;

    this.leavesLayer.removeChild(placed.view);
    placed.view.destroy({ children: true });
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
      if (leaf.flash > 0) {
        leaf.flash = Math.max(0, leaf.flash - deltaMs);
        const t = leaf.flash / FLASH_MS;
        // Вспышка ярче нормы, затем оседание.
        leaf.view.alpha = 1 + t * 0.9;
        leaf.view.scale.set(1 + t * 0.12);
        continue;
      }
      leaf.view.scale.set(1);
      // Еле заметное дыхание свечения.
      leaf.view.alpha = 0.9 + Math.sin(this.elapsed / 1400 + leaf.phase) * 0.08;
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

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.leaves.clear();
    this.pulses.length = 0;
  }
}
