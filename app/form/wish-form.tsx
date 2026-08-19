'use client';

import { useEffect, useRef, useState } from 'react';
import { SPECIALTIES } from '@/config/specialties';
import type { SubmitWishResponse, WishStatus } from '@/lib/types';
import styles from './form.module.css';

const DEVICE_HASH_KEY = 'cyber-tree-device-hash';
const WISH_LIMIT = 120;
const DEVICE_HASH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface OwnWish {
  name: string;
  specialty: string;
  wish: string;
  status: WishStatus;
  createdAt: string;
}

const STATUS_MESSAGES: Record<WishStatus, string> = {
  pending: 'Пожелание ожидает проверки. После одобрения оно появится на большом экране.',
  approved: 'Пожелание уже появилось на дереве на большом экране.',
  rejected: 'Пожелание проверено модератором.',
};

function createDeviceHash(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function loadOwnWish(deviceHash: string): Promise<OwnWish | null> {
  const response = await fetch(`/api/wishes/mine?deviceHash=${encodeURIComponent(deviceHash)}`, {
    cache: 'no-store',
  });
  const body = (await response.json()) as { wish?: OwnWish | null; error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Не удалось проверить отправленное пожелание');
  return body.wish ?? null;
}

export function WishForm() {
  const [deviceHash, setDeviceHash] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [existingWish, setExistingWish] = useState<OwnWish | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [wish, setWish] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  async function checkExisting(hash: string): Promise<void> {
    setChecking(true);
    setError(null);
    try {
      setExistingWish(await loadOwnWish(hash));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Сервис временно недоступен');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function initialize(): Promise<void> {
      const saved = localStorage.getItem(DEVICE_HASH_KEY);
      const hash = saved && DEVICE_HASH.test(saved) ? saved : createDeviceHash();
      if (hash !== saved) localStorage.setItem(DEVICE_HASH_KEY, hash);

      try {
        const found = await loadOwnWish(hash);
        if (active) setExistingWish(found);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Сервис временно недоступен');
        }
      } finally {
        if (active) {
          setDeviceHash(hash);
          setChecking(false);
        }
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deviceHash || submitLock.current) return;

    submitLock.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specialty, wish, deviceHash }),
      });
      const body = (await response.json()) as SubmitWishResponse;

      if (!body.ok) {
        if (response.status === 409) {
          const found = await loadOwnWish(deviceHash);
          if (found) {
            setExistingWish(found);
            return;
          }
        }
        throw new Error(body.error);
      }

      setExistingWish({
        name: name.trim(),
        specialty,
        wish: wish.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    } catch (submitError) {
      submitLock.current = false;
      setError(
        submitError instanceof Error ? submitError.message : 'Не удалось отправить пожелание',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const specialtyLabel = existingWish
    ? (SPECIALTIES.find((item) => item.id === existingWish.specialty)?.label ??
      existingWish.specialty)
    : null;

  if (checking) {
    return (
      <main className={styles.shell}>
        <section className={styles.card} aria-live="polite">
          <p className={styles.eyebrow}>Кибер-дерево знаний</p>
          <h1>Проверяем устройство…</h1>
          <p>Это займёт пару секунд.</p>
        </section>
      </main>
    );
  }

  if (existingWish) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Пожелание отправлено</p>
          <h1>Спасибо, {existingWish.name}!</h1>
          <p>{STATUS_MESSAGES[existingWish.status]}</p>
          <div className={styles.savedWish}>
            <span>{specialtyLabel}</span>
            <blockquote>{existingWish.wish}</blockquote>
          </div>
          <p className={styles.note}>С одного устройства можно отправить только одно пожелание.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Кибер-дерево знаний</p>
        <h1>Добавь свой лист</h1>
        <p>Напиши пожелание на учебный год. После проверки оно появится на дереве.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="name">Имя</label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={30}
            autoComplete="name"
            required
          />

          <label htmlFor="specialty">Специальность</label>
          <select
            id="specialty"
            name="specialty"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            required
          >
            <option value="" disabled>
              Выбери из списка
            </option>
            {SPECIALTIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.short} — {item.label}
              </option>
            ))}
          </select>

          <div className={styles.wishLabel}>
            <label htmlFor="wish">Пожелание</label>
            <output aria-live="polite">осталось {WISH_LIMIT - Array.from(wish).length}</output>
          </div>
          <textarea
            id="wish"
            name="wish"
            value={wish}
            onChange={(event) => setWish(event.target.value)}
            minLength={3}
            maxLength={WISH_LIMIT}
            rows={5}
            required
          />

          {error ? (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              {deviceHash ? (
                <button
                  className={styles.retry}
                  type="button"
                  onClick={() => void checkExisting(deviceHash)}
                >
                  Проверить ещё раз
                </button>
              ) : null}
            </div>
          ) : null}

          <button className={styles.submit} type="submit" disabled={submitting || !deviceHash}>
            {submitting ? 'Отправляем…' : 'Отправить пожелание'}
          </button>
        </form>
      </section>
    </main>
  );
}
