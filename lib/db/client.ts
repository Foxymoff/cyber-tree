/**
 * Доступ к данным. Единственное место, где живёт SQL.
 *
 * Два режима:
 *   - боевой, если задан DATABASE_URL — Neon через @neondatabase/serverless;
 *   - моковый, если DATABASE_URL пуст — данные из lib/db/mock.ts.
 *
 * Моковый режим — рабочий, а не заглушка на пять минут: по нему параллельно
 * отлаживают форму, админку и визуализацию дерева, пока базы нет. Не выпиливать.
 */
import { neon } from '@neondatabase/serverless';
import type { PublicWish, UpdateWishRequest, Wish, WishStatus } from '@/lib/types';
import { MOCK_WISHES } from './mock';

/** Поля, из которых создаётся запись. Статус всегда pending, его ставит хранилище. */
export interface CreateWishInput {
  name: string;
  specialty: string;
  wish: string;
  deviceHash: string | null;
  /** Причина срабатывания автомода, null если чисто. Автомод сам ничего не публикует. */
  autoFlag: string | null;
}

export interface WishStore {
  /** Работаем на моках, а не на настоящей базе. */
  readonly isMock: boolean;
  /**
   * Для /display. Без since — всё одобренное (первая загрузка).
   * С since — всё изменившееся позже метки, в любом статусе: клиент сам решит,
   * добавить лист или убрать.
   */
  listPublic(since?: string | null): Promise<PublicWish[]>;
  /** Для /admin и экспорта. Без since — всё целиком, с since — изменившееся позже метки. */
  listAll(since?: string | null): Promise<Wish[]>;
  /** Проверка «одно пожелание на устройство». */
  findByDeviceHash(deviceHash: string): Promise<Wish | null>;
  create(input: CreateWishInput): Promise<Wish>;
  /** null, если записи с таким id нет. */
  update(id: number, patch: UpdateWishRequest): Promise<Wish | null>;
}

/** Строка из Postgres: snake_case. В приложении везде camelCase. */
interface WishRow {
  id: number;
  name: string;
  specialty: string;
  wish: string;
  status: string;
  auto_flag: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToWish(row: WishRow): Wish {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    wish: row.wish,
    status: row.status as WishStatus,
    autoFlag: row.auto_flag,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toPublic(wish: Wish): PublicWish {
  return {
    id: wish.id,
    name: wish.name,
    specialty: wish.specialty,
    wish: wish.wish,
    status: wish.status,
    updatedAt: wish.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Боевое хранилище: Neon
// ---------------------------------------------------------------------------

function createNeonStore(connectionString: string): WishStore {
  const sql = neon(connectionString);

  return {
    isMock: false,

    async listPublic(since) {
      const rows = since
        ? ((await sql`
            select * from wishes
            where updated_at > ${since}
            order by updated_at asc
          `) as WishRow[])
        : ((await sql`
            select * from wishes
            where status = 'approved'
            order by updated_at asc
          `) as WishRow[]);
      return rows.map(rowToWish).map(toPublic);
    },

    async listAll(since) {
      const rows = since
        ? ((await sql`
            select * from wishes
            where updated_at > ${since}
            order by updated_at asc
          `) as WishRow[])
        : ((await sql`
            select * from wishes
            order by created_at asc
          `) as WishRow[]);
      return rows.map(rowToWish);
    },

    async findByDeviceHash(deviceHash) {
      const rows = (await sql`
        select * from wishes where device_hash = ${deviceHash} limit 1
      `) as WishRow[];
      return rows.length > 0 ? rowToWish(rows[0]) : null;
    },

    async create(input) {
      const rows = (await sql`
        insert into wishes (name, specialty, wish, status, auto_flag, device_hash)
        values (${input.name}, ${input.specialty}, ${input.wish}, 'pending',
                ${input.autoFlag}, ${input.deviceHash})
        returning *
      `) as WishRow[];
      return rowToWish(rows[0]);
    },

    async update(id, patch) {
      // coalesce вместо сборки динамического SQL: не переданные поля остаются как были.
      // updated_at не трогаем руками — его выставляет триггер wishes_set_updated_at.
      const rows = (await sql`
        update wishes set
          status    = coalesce(${patch.status ?? null}, status),
          name      = coalesce(${patch.name ?? null}, name),
          specialty = coalesce(${patch.specialty ?? null}, specialty),
          wish      = coalesce(${patch.wish ?? null}, wish)
        where id = ${id}
        returning *
      `) as WishRow[];
      return rows.length > 0 ? rowToWish(rows[0]) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Моковое хранилище
// ---------------------------------------------------------------------------

function createMockStore(): WishStore {
  // Состояние в памяти процесса. На Vercel оно НЕ переживает запрос: каждая
  // функция поднимается заново, и всё записанное здесь теряется. Это осознанно —
  // моковый режим нужен для локальной отладки, где процесс один, а не для прода.
  // В боевом режиме состояния на сервере нет вообще, всё лежит в Neon.
  const wishes: Wish[] = MOCK_WISHES.map((w) => ({ ...w }));
  // device_hash → запись. Моковые пожелания заведомо без device_hash, карта
  // наполняется только тем, что прислали через форму в этом же процессе.
  const deviceHashes = new Map<string, Wish>();
  let nextId = wishes.length + 1;

  return {
    isMock: true,

    async listPublic(since) {
      const selected = since
        ? wishes.filter((w) => w.updatedAt > since)
        : wishes.filter((w) => w.status === 'approved');
      return selected
        .slice()
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .map(toPublic);
    },

    async listAll(since) {
      const selected = since ? wishes.filter((w) => w.updatedAt > since) : wishes.slice();
      return selected
        .slice()
        .sort((a, b) =>
          since ? a.updatedAt.localeCompare(b.updatedAt) : a.createdAt.localeCompare(b.createdAt),
        )
        .map((w) => ({ ...w }));
    },

    async findByDeviceHash(deviceHash) {
      const found = deviceHashes.get(deviceHash);
      return found ? { ...found } : null;
    },

    async create(input) {
      const now = new Date().toISOString();
      const created: Wish = {
        id: nextId++,
        name: input.name,
        specialty: input.specialty,
        wish: input.wish,
        status: 'pending',
        autoFlag: input.autoFlag,
        createdAt: now,
        updatedAt: now,
      };
      wishes.push(created);
      if (input.deviceHash) deviceHashes.set(input.deviceHash, created);
      return { ...created };
    },

    async update(id, patch) {
      const target = wishes.find((w) => w.id === id);
      if (!target) return null;
      if (patch.status !== undefined) target.status = patch.status;
      if (patch.name !== undefined) target.name = patch.name;
      if (patch.specialty !== undefined) target.specialty = patch.specialty;
      if (patch.wish !== undefined) target.wish = patch.wish;
      // Руками, потому что триггера в моковом режиме нет.
      target.updatedAt = new Date().toISOString();
      return { ...target };
    },
  };
}

// ---------------------------------------------------------------------------
// Выбор режима
// ---------------------------------------------------------------------------

let store: WishStore | null = null;
let modeReported = false;

/**
 * Хранилище пожеланий. Само выбирает режим по DATABASE_URL.
 * Пустой DATABASE_URL — не ошибка, а рабочий моковый режим.
 */
export function getStore(): WishStore {
  if (store) return store;

  const url = process.env.DATABASE_URL?.trim();
  store = url ? createNeonStore(url) : createMockStore();

  if (!modeReported) {
    modeReported = true;
    console.log(
      store.isMock
        ? '[db] DATABASE_URL пуст — работаем на моках из lib/db/mock.ts. Запись никуда не сохраняется.'
        : '[db] подключение к Neon',
    );
  }

  return store;
}
