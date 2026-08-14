/**
 * Дерево на плазменной панели. Раздел 8 ТЗ.
 *
 * Серверный компонент: он только разбирает параметры адреса и подключает
 * шрифты. Всё, что связано с PixiJS, живёт ниже в клиентских компонентах —
 * на сервере Pixi падает.
 *
 * Параметры адреса:
 *   ?seed=demo   — какое дерево генерировать, одно и то же при одном seed;
 *   ?mock=30     — наполнить тестовыми листьями, не обращаясь к базе.
 */
import { Golos_Text, JetBrains_Mono, Unbounded } from 'next/font/google';
import styles from './display.module.css';
import TreeMount from './tree-mount';

// Шрифты раздела 8. Подключены здесь, а не в общем layout.tsx: они нужны
// только на этой странице, а форма и админка оформлены своими средствами.
const mono = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-mono',
  display: 'swap',
});

const display = Unbounded({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-body',
  display: 'swap',
});

interface DisplayPageProps {
  searchParams: Promise<{ seed?: string | string[]; mock?: string | string[] }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function DisplayPage({ searchParams }: DisplayPageProps) {
  const params = await searchParams;
  const seed = firstValue(params.seed) ?? 'demo';
  const mockRaw = Number.parseInt(firstValue(params.mock) ?? '', 10);
  const mock = Number.isFinite(mockRaw) && mockRaw > 0 ? Math.min(mockRaw, 400) : 0;

  return (
    <main className={`${mono.variable} ${display.variable} ${body.variable} ${styles.stage}`}>
      <TreeMount seed={seed} mock={mock} />
    </main>
  );
}
