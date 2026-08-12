/**
 * ЗАГЛУШКА. Панель модератора.
 *
 * Зона агента-бэкендера (app/admin/** в AGENTS.md), задачи 5–7
 * в docs/task-backend.md. Вёрстки здесь намеренно нет.
 */
export default function AdminPage() {
  return (
    <main style={{ padding: '2rem', lineHeight: 1.6 }}>
      <h1>/admin</h1>
      <p>
        Панель модератора. Зона агента-бэкендера по <code>AGENTS.md</code>, задачи 5–7 в{' '}
        <code>docs/task-backend.md</code>.
      </p>
    </main>
  );
}
