/**
 * ЗАГЛУШКА. Дерево на плазменной панели.
 *
 * Чужая зона (app/display/** в AGENTS.md): её делает агент визуализации,
 * агенту-бэкендеру сюда не писать.
 *
 * Серверный компонент. Всё, что связано с PixiJS, живёт ниже по дереву
 * в клиентских компонентах: на сервере Pixi падает.
 */
import TreeMount from './tree-mount';

export default function DisplayPage() {
  return (
    <main style={{ padding: '2rem', lineHeight: 1.6 }}>
      <h1>/display</h1>
      <p>
        Дерево на панели. Зона агента визуализации по <code>AGENTS.md</code>, этапы 4–6 в разделе 10{' '}
        <code>docs/spec.md</code>.
      </p>
      <TreeMount />
    </main>
  );
}
