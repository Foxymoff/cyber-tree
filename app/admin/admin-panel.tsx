'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSpecialty } from '@/config/specialties';
import type { AdminQueueResponse, UpdateWishRequest, Wish } from '@/lib/types';
import styles from './admin-panel.module.css';

type Tab = 'queue' | 'approved';

const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function mergeWishes(current: readonly Wish[], incoming: readonly Wish[]): Wish[] {
  const byId = new Map(current.map((wish) => [wish.id, wish]));
  for (const wish of incoming) byId.set(wish.id, wish);
  return Array.from(byId.values());
}

function sortQueue(left: Wish, right: Wish): number {
  const flagOrder = Number(Boolean(right.autoFlag)) - Number(Boolean(left.autoFlag));
  return flagOrder || left.createdAt.localeCompare(right.createdAt);
}

function sortApproved(left: Wish, right: Wish): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function AdminPanel() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const knownPendingIdsRef = useRef(new Set<number>());

  const playNotification = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || !soundEnabledRef.current) return;

    void context.resume().then(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(720, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | undefined;

    async function poll(): Promise<void> {
      try {
        const url = cursor
          ? `/api/admin/queue?since=${encodeURIComponent(cursor)}`
          : '/api/admin/queue';
        const response = await fetch(url, { cache: 'no-store' });

        if (response.status === 401) {
          window.location.reload();
          return;
        }

        const body = (await response.json()) as AdminQueueResponse | { error: string };
        if (!response.ok || !('wishes' in body)) {
          throw new Error('error' in body ? body.error : 'Не удалось обновить очередь');
        }

        if (stopped) return;
        const isInitial = cursor === undefined;
        const newPending = body.wishes.filter(
          (wish) => wish.status === 'pending' && !knownPendingIdsRef.current.has(wish.id),
        );
        for (const wish of body.wishes) {
          if (wish.status === 'pending') knownPendingIdsRef.current.add(wish.id);
        }

        setWishes((current) => mergeWishes(current, body.wishes));
        setError(null);
        setLoading(false);
        cursor = body.now;
        if (!isInitial && newPending.length > 0) playNotification();
      } catch (pollError) {
        if (!stopped) {
          setError(pollError instanceof Error ? pollError.message : 'Не удалось обновить очередь');
          setLoading(false);
        }
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 2000);
      }
    }

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [playNotification]);

  const queue = useMemo(
    () => wishes.filter((wish) => wish.status === 'pending').sort(sortQueue),
    [wishes],
  );
  const approved = useMemo(
    () => wishes.filter((wish) => wish.status === 'approved').sort(sortApproved),
    [wishes],
  );
  const visibleWishes = tab === 'queue' ? queue : approved;
  const effectiveSelectedId = visibleWishes.some((wish) => wish.id === selectedId)
    ? selectedId
    : (visibleWishes[0]?.id ?? null);
  const selectedWish = visibleWishes.find((wish) => wish.id === effectiveSelectedId) ?? null;

  const patchWish = useCallback(async (id: number, patch: UpdateWishRequest): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/wishes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = (await response.json()) as Wish | { error: string };
      if (response.status === 401) {
        window.location.reload();
        return;
      }
      if (!response.ok || 'error' in body) {
        throw new Error('error' in body ? body.error : 'Не удалось изменить пожелание');
      }
      setWishes((current) => mergeWishes(current, [body]));
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Не удалось изменить пожелание');
    } finally {
      setBusyId(null);
    }
  }, []);

  const startEditing = useCallback((wish: Wish) => {
    setSelectedId(wish.id);
    setEditingId(wish.id);
    setEditDraft(wish.wish);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (editingId !== null || busyId !== null) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (visibleWishes.length === 0) return;
        const currentIndex = visibleWishes.findIndex((wish) => wish.id === effectiveSelectedId);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), visibleWishes.length - 1);
        setSelectedId(visibleWishes[nextIndex].id);
        return;
      }

      if (!selectedWish) return;
      if (tab === 'queue' && (event.code === 'Space' || event.key === 'Enter')) {
        event.preventDefault();
        void patchWish(selectedWish.id, { status: 'approved' });
      } else if (tab === 'queue' && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        void patchWish(selectedWish.id, { status: 'rejected' });
      } else if (tab === 'queue' && event.key.toLocaleLowerCase() === 'e') {
        event.preventDefault();
        startEditing(selectedWish);
      } else if (tab === 'approved' && event.key.toLocaleLowerCase() === 'u') {
        event.preventDefault();
        void patchWish(selectedWish.id, { status: 'rejected' });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    busyId,
    editingId,
    effectiveSelectedId,
    patchWish,
    selectedWish,
    startEditing,
    tab,
    visibleWishes,
  ]);

  async function enableSound(): Promise<void> {
    if (soundEnabled) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      return;
    }

    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    await context.resume();
    soundEnabledRef.current = true;
    setSoundEnabled(true);
    playNotification();
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>, id: number): Promise<void> {
    event.preventDefault();
    await patchWish(id, { wish: editDraft });
    setEditingId(null);
  }

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Кибер-дерево знаний</p>
          <h1>Модерация</h1>
        </div>
        <button className={styles.soundButton} type="button" onClick={() => void enableSound()}>
          {soundEnabled ? 'Звук включён' : 'Включить звук'}
        </button>
      </header>

      {!soundEnabled ? (
        <p className={styles.soundReminder}>До начала мероприятия нажмите «Включить звук».</p>
      ) : null}

      <nav className={styles.tabs} aria-label="Разделы панели">
        <button
          type="button"
          className={tab === 'queue' ? styles.activeTab : undefined}
          onClick={() => setTab('queue')}
        >
          Очередь <span>{queue.length}</span>
        </button>
        <button
          type="button"
          className={tab === 'approved' ? styles.activeTab : undefined}
          onClick={() => setTab('approved')}
        >
          Опубликованные <span>{approved.length}</span>
        </button>
      </nav>

      <div className={styles.shortcuts} aria-label="Горячие клавиши">
        {tab === 'queue' ? (
          <>
            <span>↑ ↓ выбор</span>
            <span>Space / Enter одобрить</span>
            <span>Delete отклонить</span>
            <span>E править</span>
          </>
        ) : (
          <>
            <span>↑ ↓ выбор</span>
            <span>U снять с экрана</span>
          </>
        )}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className={styles.empty}>Загружаем очередь…</p> : null}
      {!loading && visibleWishes.length === 0 ? (
        <div className={styles.empty}>
          <strong>
            {tab === 'queue' ? 'Очередь разобрана' : 'Опубликованных пожеланий пока нет'}
          </strong>
          <span>Панель обновляется автоматически раз в 2 секунды.</span>
        </div>
      ) : null}

      <div className={styles.list}>
        {visibleWishes.map((wish) => {
          const selected = wish.id === effectiveSelectedId;
          const editing = wish.id === editingId;
          const specialty = getSpecialty(wish.specialty);

          return (
            <article
              key={wish.id}
              className={`${styles.wishCard} ${selected ? styles.selected : ''} ${wish.autoFlag ? styles.flagged : ''}`}
              aria-current={selected ? 'true' : undefined}
              onClick={() => {
                setSelectedId(wish.id);
                if (tab === 'queue' && busyId === null && !editing) {
                  void patchWish(wish.id, { status: 'approved' });
                }
              }}
            >
              <div className={styles.cardHeader}>
                <div>
                  <strong>{wish.name}</strong>
                  <span>{specialty?.label ?? wish.specialty}</span>
                </div>
                <time dateTime={wish.createdAt}>
                  {TIME_FORMAT.format(new Date(wish.createdAt))}
                </time>
              </div>

              {wish.autoFlag ? <p className={styles.flag}>Автомод: {wish.autoFlag}</p> : null}

              {editing ? (
                <form
                  className={styles.editor}
                  onSubmit={(event) => void saveEdit(event, wish.id)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <label htmlFor={`edit-${wish.id}`}>Текст пожелания</label>
                  <textarea
                    id={`edit-${wish.id}`}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    minLength={3}
                    maxLength={120}
                    autoFocus
                    required
                  />
                  <div>
                    <button type="submit" disabled={busyId === wish.id}>
                      Сохранить
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <p className={styles.wishText}>{wish.wish}</p>
              )}

              {!editing ? (
                <div className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
                  {tab === 'queue' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === wish.id}
                        onClick={() => void patchWish(wish.id, { status: 'approved' })}
                      >
                        Одобрить
                      </button>
                      <button type="button" onClick={() => startEditing(wish)}>
                        Править
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === wish.id}
                      onClick={() => void patchWish(wish.id, { status: 'rejected' })}
                    >
                      Снять с экрана
                    </button>
                  )}
                </div>
              ) : null}

              {tab === 'queue' ? (
                <button
                  className={styles.rejectButton}
                  type="button"
                  aria-label={`Отклонить пожелание: ${wish.name}`}
                  disabled={busyId === wish.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(wish.id);
                    void patchWish(wish.id, { status: 'rejected' });
                  }}
                >
                  ×
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
