import Link from 'next/link';
import { Golos_Text, JetBrains_Mono, Unbounded } from 'next/font/google';
import styles from './page.module.css';

/**
 * Корневая страница — витрина проекта, а не служебная заглушка: её может открыть
 * первый зашедший по адресу. Показываем, что это, и ведём на форму. Внутренние
 * поверхности (/display, /admin) и служебные документы отсюда не светим.
 *
 * Шрифты раздела 8 подключаем здесь же, как на /display: общий layout.tsx их не
 * держит, каждая витрина оформлена своими средствами.
 */
const mono = JetBrains_Mono({ subsets: ['cyrillic', 'latin'], variable: '--font-mono', display: 'swap' });
const display = Unbounded({ subsets: ['cyrillic', 'latin'], variable: '--font-display', display: 'swap' });
const body = Golos_Text({ subsets: ['cyrillic', 'latin'], variable: '--font-body', display: 'swap' });

export default function Home() {
  return (
    <main className={`${mono.variable} ${display.variable} ${body.variable} ${styles.shell}`}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>День первокурсника</p>
        <h1 className={styles.title}>Кибер-дерево знаний</h1>
        <p className={styles.lede}>
          Арт-объект дня первокурсника. Напиши пожелание на учебный год — после проверки оно
          засветится листом на дереве на большом экране рядом.
        </p>
        <Link className={styles.cta} href="/form">
          Оставить пожелание
        </Link>
      </section>

      <footer className={styles.logos} aria-label="Колледж и Университет Иннополис">
        <span className={`${styles.logo} ${styles.college}`} role="img" aria-label="Колледж Иннополис" />
        <span className={`${styles.logo} ${styles.ui}`} role="img" aria-label="Университет Иннополис" />
      </footer>
    </main>
  );
}
