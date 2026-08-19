'use client';

/**
 * Точка монтирования сцены.
 *
 * Единственная причина, по которой этот файл существует отдельно: в App Router
 * опция ssr: false у next/dynamic разрешена только внутри клиентского
 * компонента. Из серверного она роняет сборку.
 */
import dynamic from 'next/dynamic';

const Tree = dynamic(() => import('./tree'), {
  ssr: false,
  loading: () => null,
});

export interface TreeMountProps {
  seed: string;
  /** Сколько тестовых листьев нарисовать вместо обращения к базе. */
  mock: number;
  /** Стоп-кадр для съёмки. */
  still: boolean;
}

export default function TreeMount({ seed, mock, still }: TreeMountProps) {
  return <Tree seed={seed} mock={mock} still={still} />;
}
