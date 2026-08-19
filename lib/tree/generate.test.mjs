import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTree, anchorCapacity, LEAF_SIDE_OFFSET } from './generate.ts';

test('один seed даёт одно дерево', () => {
  assert.equal(JSON.stringify(generateTree('demo')), JSON.stringify(generateTree('demo')));
});

test('разные seed дают разные деревья', () => {
  assert.notEqual(JSON.stringify(generateTree('demo')), JSON.stringify(generateTree('другой')));
});

test('число магистралей задаётся параметром, не количеством специальностей', () => {
  // Размещение отвязано от специальностей: веток столько, при скольких крона
  // выглядит лучше, а не столько, сколько специальностей в конфиге.
  for (const branchCount of [3, 4, 5, 6]) {
    const tree = generateTree('demo', { branchCount });
    const branchTraces = new Set(
      tree.traces.filter((t) => t.branchIndex >= 0).map((t) => t.branchIndex),
    );
    assert.equal(branchTraces.size, branchCount, `магистралей при ${branchCount}`);
  }
});

test('дерево осмысленно перегенерируется на любой длине от 3 до 6 веток', () => {
  for (const branchCount of [3, 4, 5, 6]) {
    const tree = generateTree('demo', { branchCount });
    assert.ok(tree.anchors.length >= 100, `кандидатов при ${branchCount}: ${tree.anchors.length}`);
    const xs = tree.traces.flatMap((t) => t.points.map((p) => p.x));
    const ys = tree.traces.flatMap((t) => t.points.map((p) => p.y));
    assert.ok(
      Math.min(...xs) >= 0 && Math.max(...xs) <= tree.width,
      `по горизонтали при ${branchCount}`,
    );
    assert.ok(Math.min(...ys) >= 0, `крона не вылезает вверх при ${branchCount}`);
  }
});

test('все направления дорожек кратны 45 градусам', () => {
  for (const trace of generateTree('demo').traces) {
    for (let i = 1; i < trace.points.length; i += 1) {
      const dx = Math.abs(trace.points[i].x - trace.points[i - 1].x);
      const dy = Math.abs(trace.points[i].y - trace.points[i - 1].y);
      assert.ok(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9, `угол ${dx}:${dy}`);
    }
  }
});

test('толщина дорожки убывает с глубиной', () => {
  const byDepth = new Map();
  for (const trace of generateTree('demo').traces) {
    if (!byDepth.has(trace.depth)) byDepth.set(trace.depth, trace.width);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  for (let i = 1; i < depths.length; i += 1) {
    assert.ok(byDepth.get(depths[i]) < byDepth.get(depths[i - 1]), `глубина ${depths[i]}`);
  }
});

test('пул раздаётся снизу вверх и чередует размер', () => {
  const tree = generateTree('demo');
  const spread = tree.anchors.slice(0, tree.spreadCount);

  // Рост снизу вверх: нижняя половина пула в среднем ниже верхней. Строгой
  // монотонности нет намеренно — внутри слоя порядок перемешан.
  const half = Math.floor(spread.length / 2);
  const avgY = (list) => list.reduce((s, a) => s + a.point.y, 0) / list.length;
  const bottomAvg = avgY(spread.slice(0, half));
  const topAvg = avgY(spread.slice(half));
  assert.ok(
    bottomAvg > topAvg,
    `низ ${bottomAvg.toFixed(0)} должен быть ниже верха ${topAvg.toFixed(0)}`,
  );

  assert.equal(tree.anchors[0].size, 'large');
  assert.equal(tree.anchors[1].size, 'small');
});

test('внутри слоя есть разброс, а не строгий порядок слева направо', () => {
  // Первый слой не должен быть отсортирован по x: иначе заполнение идёт
  // жёстко слева направо, а не с разбросом.
  const tree = generateTree('demo');
  const first = tree.anchors.slice(0, 12).map((a) => a.point.x);
  const sorted = [...first].sort((a, b) => a - b);
  assert.notDeepEqual(first, sorted, 'первый слой оказался строго слева направо');
});

test('у каждой точки крепления сохранён полный путь от корня', () => {
  const tree = generateTree('demo');
  for (const anchor of tree.anchors) {
    assert.ok(anchor.path.length >= 2, 'путь длиннее одной точки');
    assert.deepEqual(anchor.path[0], tree.base, 'путь начинается у основания ствола');
    assert.deepEqual(anchor.path.at(-1), anchor.point, 'путь заканчивается в точке крепления');
    assert.ok(anchor.pathLength > 0, 'длина пути посчитана');
  }
});

test('ёмкость без наложений не меньше 150', () => {
  const tree = generateTree('demo');
  assert.ok(anchorCapacity(tree) >= 150, `без наложений всего ${anchorCapacity(tree)}`);
});

test('первые spreadCount листьев не накладываются друг на друга', () => {
  // Зазор считается по центру корпуса с учётом смещения в сторону, а не по
  // точке на дорожке: иначе два листа с противоположным смещением сходятся.
  const tree = generateTree('demo');
  const centerY = (a) => a.point.y + a.side * LEAF_SIDE_OFFSET;
  const placed = tree.anchors.slice(0, tree.spreadCount);
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const dx = Math.abs(placed[i].point.x - placed[j].point.x);
      const dy = Math.abs(centerY(placed[i]) - centerY(placed[j]));
      assert.ok(dx >= 78 || dy >= 30, `листья ${i} и ${j} накладываются: dx=${dx} dy=${dy}`);
    }
  }
});
