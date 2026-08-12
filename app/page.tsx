import Link from 'next/link';

/**
 * Корневая страница. В работе мероприятия не участвует — три рабочие
 * поверхности открываются по своим адресам. Нужна, чтобы человек, впервые
 * открывший проект, сразу увидел, что где.
 */
export default function Home() {
  return (
    <main style={{ padding: '2rem', lineHeight: 1.6 }}>
      <h1>Кибер-дерево знаний</h1>
      <p>Каркас проекта. Три поверхности:</p>
      <ul>
        <li>
          <Link href="/form">/form</Link> — форма для телефона, открывается по QR
        </li>
        <li>
          <Link href="/display">/display</Link> — дерево на плазменной панели
        </li>
        <li>
          <Link href="/admin">/admin</Link> — панель модератора
        </li>
      </ul>
      <p>Полное ТЗ: docs/spec.md. Зоны ответственности: AGENTS.md.</p>
    </main>
  );
}
