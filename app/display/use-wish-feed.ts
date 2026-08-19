'use client';

/**
 * Опрос пожеланий для дерева.
 *
 * Вебсокетов нет и не будет: среда serverless не держит постоянные соединения.
 * Обновление — только опрос раз в 2 секунды по курсору updated_at.
 *
 * Главное требование мероприятия: обрыв интернета не должен стирать дерево.
 * Всё уже полученное живёт в памяти клиента и не перезапрашивается. При ошибке
 * запроса курсор не двигается, листья остаются на месте, а следующий опрос
 * просто пробует ещё раз.
 */
import { useEffect, useRef } from 'react';
import type { PublicWish, WishesResponse } from '@/lib/types';

/** Опрос очереди раз в 2 секунды, раздел 5 ТЗ. */
const POLL_INTERVAL_MS = 2000;

export interface WishFeedCallbacks {
  /** Пожелание одобрено и должно появиться на дереве. */
  onArrive: (wish: PublicWish, initial: boolean) => void;
  /** Пожелание перестало быть одобренным — лист снимается с экрана. */
  onRemove: (id: number) => void;
}

export function useWishFeed(callbacks: WishFeedCallbacks, enabled: boolean): void {
  // Колбэки держим в ref, чтобы их пересоздание не перезапускало опрос:
  // перезапуск сбросил бы курсор и заново проиграл прилёт всех листьев.
  const handlers = useRef(callbacks);
  useEffect(() => {
    handlers.current = callbacks;
  });

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Что уже показано на дереве. Живёт всё время жизни страницы.
    const shown = new Set<number>();
    let cursor: string | null = null;

    const apply = (wishes: readonly PublicWish[], initial: boolean) => {
      for (const wish of wishes) {
        if (wish.status === 'approved') {
          if (!shown.has(wish.id)) {
            shown.add(wish.id);
            handlers.current.onArrive(wish, initial);
          }
          continue;
        }
        // Любой статус кроме approved означает «листа быть не должно».
        if (shown.has(wish.id)) {
          shown.delete(wish.id);
          handlers.current.onRemove(wish.id);
        }
      }
    };

    const poll = async () => {
      if (stopped) return;

      try {
        const url =
          cursor === null ? '/api/wishes' : `/api/wishes?since=${encodeURIComponent(cursor)}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`ответ ${response.status}`);

        const body = (await response.json()) as WishesResponse;
        const initial = cursor === null;
        apply(body.wishes, initial);
        // Курсор двигаем только после успешного разбора: иначе пропустим
        // изменения, случившиеся во время неудачного запроса.
        cursor = body.now;
      } catch {
        // Сеть отвалилась. Дерево остаётся как есть, курсор не двигается,
        // на следующем тике попробуем снова. Это единственная защита от
        // падения Wi-Fi в зале, поэтому здесь ничего не чистим.
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
