'use client';

/**
 * Сцена дерева на PixiJS. Раздел 8 ТЗ.
 *
 * Компонент грузится только в браузере — см. tree-mount.tsx.
 *
 * Три слоя, как требует ТЗ:
 *   свечение     — дорожки и листья, под AdvancedBloomFilter;
 *   шелкография  — логотипы и счётчик, плоский цвет, вне bloom;
 *   накладка     — карточка пожелания, обычный DOM поверх канваса.
 *
 * Размер сцены всегда 1920x1080. На панели большего разрешения растёт не
 * сцена, а renderer.resolution: иначе поплывут все выверенные по скриншотам
 * размеры дорожек и листьев.
 */
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { generateTree } from '@/lib/tree/generate';
import { PALETTE } from '@/lib/tree/palette';
import { buildSilkPlaceholders, buildTreeGraphics } from '@/lib/tree/render';
import styles from './display.module.css';

/** Размер сцены в её собственных единицах. Не меняется никогда. */
const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;

/** Выше этого поднимать resolution бессмысленно: память тратится, глаз не видит. */
const MAX_RESOLUTION = 3;

export interface TreeProps {
  seed: string;
  mock: number;
}

/** Во сколько физических пикселей укладывается одна единица сцены. */
function computeResolution(cssWidth: number): number {
  const ratio = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);
  return Math.min(MAX_RESOLUTION, Math.max(1, (cssWidth * ratio) / SCENE_WIDTH));
}

/** Размер канваса на экране: вписываем 16:9 целиком, без обрезки. */
function computeCanvasSize(): { width: number; height: number } {
  const scale = Math.min(window.innerWidth / SCENE_WIDTH, window.innerHeight / SCENE_HEIGHT);
  return { width: SCENE_WIDTH * scale, height: SCENE_HEIGHT * scale };
}

/** Имя шрифта, которое подставил next/font, — Pixi нужна именно строка. */
function cssFont(variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value.length > 0 ? `${value}, ${fallback}` : fallback;
}

export default function Tree({ seed, mock }: TreeProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [leafCount] = useState(0);
  const counterRef = useRef<Text | null>(null);

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

      // Слой свечения: дорожки и листья.
      const glowLayer = new Container();
      glowLayer.addChild(buildTreeGraphics(tree));
      // Без явной области фильтр пересчитывает границы каждый кадр.
      glowLayer.filterArea = new Rectangle(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
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

      const counter = new Text({
        text: `листьев на дереве: ${leafCount}`,
        style: new TextStyle({
          fontFamily: cssFont('--font-mono', 'ui-monospace, monospace'),
          fontSize: 22,
          fill: PALETTE.silk,
          letterSpacing: 1.4,
        }),
      });
      counter.alpha = 0.5;
      counter.position.set(48, SCENE_HEIGHT - 56);
      counterRef.current = counter;
      silkLayer.addChild(counter);

      app.stage.addChild(glowLayer, silkLayer);

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
      counterRef.current = null;
      if (application) {
        application.destroy(true, { children: true });
        application = null;
      }
    };
  }, [seed, mock, leafCount]);

  return <div ref={holderRef} className={styles.canvasHolder} />;
}
