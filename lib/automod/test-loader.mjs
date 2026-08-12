/**
 * Next/TypeScript понимают локальные импорты без расширения, нативный loader
 * Node при прямом запуске .ts — нет. Для тестов дополняем только относительные
 * импорты расширением .ts, не меняя общие tsconfig и package.json.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
