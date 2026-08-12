import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, isAdminSession } from '@/lib/admin-auth';
import { loginAdmin, logoutAdmin } from './actions';
import styles from './admin.module.css';

const ERRORS: Record<string, string> = {
  password: 'Пароль не подошёл',
  config: 'На сервере не задан ADMIN_PASSWORD',
};

interface AdminPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const cookieStore = await cookies();
  const authenticated = isAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (authenticated) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Сессия активна</p>
          <h1>Панель модератора</h1>
          <p>Вход защищён. Очередь заявок появится здесь на следующем этапе.</p>
          <form action={logoutAdmin}>
            <button className={styles.secondaryButton} type="submit">
              Выйти
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { error } = await searchParams;
  const errorKey = typeof error === 'string' ? error : undefined;
  const errorMessage = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Кибер-дерево знаний</p>
        <h1>Вход для модератора</h1>
        <p>Введите общий пароль команды мероприятия.</p>
        <form action={loginAdmin} className={styles.form}>
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button type="submit">Войти</button>
        </form>
      </section>
    </main>
  );
}
