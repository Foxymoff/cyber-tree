'use client';

/**
 * Сцена дерева на PixiJS. Раздел 8 ТЗ.
 *
 * Компонент грузится только в браузере — см. tree-mount.tsx.
 *
 * Три слоя: свечение под bloom (дорожки, импульсы, листья), шелкография вне
 * bloom (счётчик, логотипы) и накладка обычным DOM (карточка пожелания).
 *
 * Размер сцены всегда 1920x1080. На панели большего разрешения растёт не
 * сцена, а renderer.resolution: иначе поплывут все выверенные по скриншотам
 * размеры дорожек и листьев.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { getSpecialty } from '@/config/specialties';
import { generateTree } from '@/lib/tree/generate';
import { createMockWishes } from '@/lib/tree/mock-wishes';
import { PALETTE } from '@/lib/tree/palette';
import type { PublicWish } from '@/lib/types';
import styles from './display.module.css';
import { TreeScene } from './scene';
import { useWishFeed } from './use-wish-feed';

/** Размер сцены в её собственных единицах. Не меняется никогда. */
const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;

/** Выше этого поднимать resolution бессмысленно: память тратится, глаз не видит. */
const MAX_RESOLUTION = 3;

/** Сколько держится карточка пожелания, раздел 8 ТЗ. */
const CARD_MS = 6000;
/** Пауза между карточками, чтобы они не наезжали друг на друга. */
const CARD_GAP_MS = 600;
/** Сколько висит негромкое всплытие старого пожелания. */
const ECHO_MS = 7000;

export interface TreeProps {
  seed: string;
  mock: number;
  /** Стоп-кадр для съёмки: покой заморожен, кадр воспроизводим. */
  still: boolean;
}

function computeResolution(cssWidth: number): number {
  const ratio = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);
  return Math.min(MAX_RESOLUTION, Math.max(1, (cssWidth * ratio) / SCENE_WIDTH));
}

function computeCanvasSize(): { width: number; height: number } {
  const scale = Math.min(window.innerWidth / SCENE_WIDTH, window.innerHeight / SCENE_HEIGHT);
  return { width: SCENE_WIDTH * scale, height: SCENE_HEIGHT * scale };
}

/**
 * Имя шрифта, которое подставил next/font, — Pixi нужна именно строка.
 *
 * Читаем переменную с переданного элемента, а не с documentElement: next/font
 * вешает --font-mono на <main> этой страницы, а не на :root. С documentElement
 * значение пустое, и Pixi молча берёт системный моноширинный вместо
 * JetBrains Mono, которого требует раздел 8. Холдер канваса лежит внутри
 * <main> и переменную наследует.
 */
function cssFont(element: Element, variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(element).getPropertyValue(variable).trim();
  return value.length > 0 ? `${value}, ${fallback}` : fallback;
}

export default function Tree({ seed, mock, still }: TreeProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TreeScene | null>(null);

  const [card, setCard] = useState<PublicWish | null>(null);
  const [echo, setEcho] = useState<PublicWish | null>(null);

  // Пожелания приходят пачками: модератор одобряет несколько подряд, и в один
  // ответ опроса прилетает три-четыре штуки. Карточки становятся в очередь и
  // показываются по одной — наложения быть не должно.
  const cardQueue = useRef<PublicWish[]>([]);
  const cardBusy = useRef(false);

  // Именованное функциональное выражение: рекурсивный вызов идёт на саму
  // функцию, а не на переменную снаружи, поэтому очередь разбирается до конца.
  const pumpCards = useCallback(function pump(): void {
    if (cardBusy.current) return;
    const next = cardQueue.current.shift();
    if (!next) return;

    cardBusy.current = true;
    setCard(next);
    window.setTimeout(() => {
      setCard(null);
      window.setTimeout(() => {
        cardBusy.current = false;
        pump();
      }, CARD_GAP_MS);
    }, CARD_MS);
  }, []);

  const enqueueCard = useCallback(
    (wish: PublicWish) => {
      cardQueue.current.push(wish);
      pumpCards();
    },
    [pumpCards],
  );

  const showEcho = useCallback((wish: PublicWish) => {
    // Всплытие не должно спорить с карточкой прилёта за внимание.
    if (cardBusy.current) return;
    setEcho(wish);
    window.setTimeout(() => setEcho(null), ECHO_MS);
  }, []);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let disposed = false;
    let application: Application | null = null;
    let handleResize: (() => void) | null = null;

    const start = async () => {
      // Шрифты нужны до создания Text: иначе Pixi запечёт запасной шрифт
      // в текстуру и уже не перерисует.
      if (document.fonts?.ready) await document.fonts.ready;
      if (disposed) return;

      const size = computeCanvasSize();
      const app = new Application();
      await app.init({
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        background: PALETTE.bg,
        antialias: true,
        resolution: computeResolution(size.width),
        autoDensity: false,
        powerPreference: 'high-performance',
      });

      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      application = app;
      app.canvas.style.width = `${size.width}px`;
      app.canvas.style.height = `${size.height}px`;
      holder.appendChild(app.canvas);

      const tree = generateTree(seed);
      const scene = new TreeScene(
        app,
        tree,
        cssFont(holder, '--font-mono', 'ui-monospace, monospace'),
        { onWishArrived: enqueueCard, onEcho: showEcho },
        still,
      );
      sceneRef.current = scene;

      // Диагностический хук. Нужен, чтобы проверять поведение экрана снаружи:
      // сколько листьев висит сейчас и виден ли лист с таким id. На
      // мероприятии пригодится, чтобы убедиться, что снятие доехало, не
      // вглядываясь в дерево.
      (window as unknown as { cyberTree?: unknown }).cyberTree = {
        leafCount: () => scene.leafCount,
      };

      // Моковый режим: дерево наполняется тестовыми листьями без обращения
      // к базе. Они появляются сразу, без импульсов и карточек.
      if (mock > 0) {
        for (const wish of createMockWishes(seed, mock)) scene.addWish(wish, false);
      }

      handleResize = () => {
        if (!application) return;
        const next = computeCanvasSize();
        application.renderer.resolution = computeResolution(next.width);
        application.canvas.style.width = `${next.width}px`;
        application.canvas.style.height = `${next.height}px`;
      };
      window.addEventListener('resize', handleResize);
    };

    void start();

    return () => {
      disposed = true;
      if (handleResize) window.removeEventListener('resize', handleResize);
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (application) {
        application.destroy(true, { children: true });
        application = null;
      }
    };
  }, [seed, mock, still, enqueueCard, showEcho]);

  // Клавиша S — выгрузка снимка дерева в двойном разрешении. Раздел 12 ТЗ.
  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      // Раскладка тут не важна: событие по коду клавиши, поэтому «ы» тоже
      // сработает — на мероприятии переключать язык никто не будет.
      if (event.code !== 'KeyS' || event.metaKey || event.ctrlKey || event.altKey) return;
      const scene = sceneRef.current;
      if (!scene) return;

      const blob = await scene.capture(2);
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `кибер-дерево-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.png`;
      link.click();
      URL.revokeObjectURL(url);
    };

    // Обёртка именованная: снимать надо ровно ту же ссылку, иначе слушатель
    // останется висеть после размонтирования.
    const handler = (event: KeyboardEvent) => void onKeyDown(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useWishFeed(
    {
      onArrive: (wish, initial) => sceneRef.current?.addWish(wish, !initial),
      onRemove: (id) => sceneRef.current?.removeWish(id),
    },
    // В моковом режиме к базе не ходим вовсе.
    mock === 0,
  );

  const cardSpecialty = card ? getSpecialty(card.specialty) : undefined;
  const echoSpecialty = echo ? getSpecialty(echo.specialty) : undefined;

  return (
    <>
      <div ref={holderRef} className={styles.canvasHolder} />

      <div className={`${styles.card} ${card ? styles.cardVisible : ''}`} aria-hidden={!card}>
        <p className={styles.cardText}>{card?.wish}</p>
        <p
          className={styles.cardMeta}
          style={{ color: cardSpecialty?.color ?? 'var(--copper-hot)' }}
        >
          {card?.name}
          {cardSpecialty ? ` · ${cardSpecialty.label}` : ''}
        </p>
      </div>

      <div className={`${styles.echo} ${echo ? styles.echoVisible : ''}`} aria-hidden={!echo}>
        <p className={styles.echoText}>{echo?.wish}</p>
        <p className={styles.echoMeta}>
          {echo?.name}
          {echoSpecialty ? ` · ${echoSpecialty.label}` : ''}
        </p>
      </div>
    </>
  );
}
