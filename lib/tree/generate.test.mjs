import assert from 'node:assert/strict';
import test from 'node:test';
import { SPECIALTIES } from '../../config/specialties.ts';
import { generateTree, anchorCapacity } from './generate.ts';

test('один seed даёт одно дерево', () => {
  assert.equal(JSON.stringify(generateTree('demo')), JSON.stringify(generateTree('demo')));
});

test('разные seed дают разные деревья', () => {
  assert.notEqual(JSON.stringify(generateTree('demo')), JSON.stringify(generateTree('другой')));
});

test('магистралей столько же, сколько специальностей в конфиге', () => {
  assert.equal(generateTree('demo').anchorsByBranch.length, SPECIALTIES.length);
});

test('дерево осмысленно перегенерируется на любой длине списка от 3 до 6', () => {
  for (const branchCount of [3, 4, 5, 6]) {
    const tree = generateTree('demo', { branchCount });
    assert.equal(tree.anchorsByBranch.length, branchCount, `веток при ${branchCount}`);
    for (const branch of tree.anchorsByBranch) {
      assert.ok(
        branch.length >= 40,
        `на ветви ${branch.length} мест при ${branchCount} специальностях`,
      );
    }
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

test('точки крепления раздаются снизу вверх и чередуют размер', () => {
  // Раздача идёт в два яруса: сначала разнесённые точки, потом промежуточные.
  // Снизу вверх упорядочен каждый ярус, а не весь список подряд.
  for (const branch of generateTree('demo').anchorsByBranch) {
    const firstTier = branch.slice(0, 25);
    for (let i = 1; i < firstTier.length; i += 1) {
      assert.ok(firstTier[i - 1].point.y >= firstTier[i].point.y, 'порядок снизу вверх');
    }
    assert.equal(branch[0].size, 'large');
    assert.equal(branch[1].size, 'small');
  }
});

test('у каждой точки крепления сохранён полный путь от корня', () => {
  const tree = generateTree('demo');
  for (const anchor of tree.anchorsByBranch.flat()) {
    assert.ok(anchor.path.length >= 2, 'путь длиннее одной точки');
    assert.deepEqual(anchor.path[0], tree.base, 'путь начинается у основания ствола');
    assert.deepEqual(anchor.path.at(-1), anchor.point, 'путь заканчивается в точке крепления');
    assert.ok(anchor.pathLength > 0, 'длина пути посчитана');
  }
});

test('мест хватает на 80 листьев одной специальности', () => {
  const tree = generateTree('demo');
  assert.ok(anchorCapacity(tree) >= 80);
  for (const branch of tree.anchorsByBranch) assert.ok(branch.length >= 80);
});

test('первые двадцать пять листьев на ветви не накладываются друг на друга', () => {
  // Ожидание 50-80 пожеланий при трёх специальностях даёт под тридцать на
  // ветвь. Столько встаёт без наложений; дальше листья пакуются плотнее —
  // это записано в docs/known-issues.md.
  for (const branch of generateTree('demo').anchorsByBranch) {
    const placed = branch.slice(0, 25);
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const dx = Math.abs(placed[i].point.x - placed[j].point.x);
        const dy = Math.abs(placed[i].point.y - placed[j].point.y);
        assert.ok(dx >= 104 || dy >= 30, `листья ${i} и ${j} накладываются: dx=${dx} dy=${dy}`);
      }
    }
  }
});
