/**
 * Скриншот /display для доводки визуала. Раздел 11 ТЗ.
 *
 * Запуск: npm run shot   (dev-сервер должен быть уже поднят)
 *
 * Смысл скрипта в том, что по коду нельзя оценить, красиво ли получилось.
 * Смотреть надо на картинку и править палитру, толщину дорожек, силу свечения,
 * пока не станет хорошо.
 *
 * Адрес и путь переопределяются переменными окружения:
 *   SHOT_URL   — базовый адрес, по умолчанию http://localhost:3000
 *   SHOT_PATH  — что открывать, по умолчанию /display
 *   SHOT_OUT   — куда положить, по умолчанию /tmp/display.png
 *
 * Когда у дерева появится моковый режим (раздел 11 ТЗ), сюда пойдёт
 * SHOT_PATH='/display?seed=demo&mock=30'.
 */
import { chromium } from 'playwright';

const BASE = process.env.SHOT_URL ?? 'http://localhost:3000';
// still=1 обязателен: без него режим покоя дышит и дрейфует, и два
// снимка одного seed не совпадают, а весь цикл доводки построен на сравнении.
const PATH = process.env.SHOT_PATH ?? '/display?seed=demo&still=1';
const OUT = process.env.SHOT_OUT ?? '/tmp/display.png';

// Целевое разрешение панели, раздел 8 ТЗ.
const VIEWPORT = { width: 1920, height: 1080 };

/** Пауза на стабилизацию сцены: анимация прилёта листа длится до 1.2 с. */
const SETTLE_MS = 2000;

async function main(): Promise<void> {
  const url = `${BASE}${PATH}`;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.error('Не удалось запустить Chromium.');
    console.error('Скорее всего, не скачаны браузеры Playwright. Это делается один раз:');
    console.error('  npx playwright install chromium');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    const page = await browser.newPage({ viewport: VIEWPORT });

    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
    } catch {
      console.error(`Страница ${url} не открылась.`);
      console.error('Поднят ли dev-сервер? Он запускается отдельно: npm run dev');
      process.exit(1);
    }

    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: OUT });
    console.log(`Скриншот ${url} сохранён в ${OUT}`);
    console.log('Открой его и посмотри глазами — по коду красоту не оценить.');
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error('Снять скриншот не удалось:', error instanceof Error ? error.message : error);
  process.exit(1);
});
