import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automoderateWish,
  containsProfanity,
  normalizeAllCaps,
  normalizeForModeration,
} from './index.ts';

test('переводит латинские омоглифы в кириллицу', () => {
  assert.equal(normalizeForModeration('c y к а'), 'сука');
});

test('переводит цифры в буквы', () => {
  assert.equal(normalizeForModeration('3aлупa'), 'залупа');
});

test('схлопывает повторы букв', () => {
  assert.equal(normalizeForModeration('бляяяяядь'), 'блядь');
});

test('удаляет пробелы, точки и дефисы между буквами', () => {
  assert.equal(normalizeForModeration('п . и-з д а'), 'пизда');
});

test('закрывает дополнительные обходы через звёздочки, подчёркивания и zero-width', () => {
  assert.equal(normalizeForModeration('б_л*\u200dя/д-ь'), 'блядь');
});

test('ловит мат после разных вариантов нормализации', () => {
  for (const value of ['c y к а', '3aлупa', 'бляяяяядь', 'п . и-з д а', 'б_л*я/д-ь']) {
    assert.equal(containsProfanity(value), true, value);
  }
});

test('не флагает похожие обычные слова', () => {
  for (const value of [
    'Пожалуйста, подстрахуйте команду',
    'Учёба начинается завтра',
    'Требуется помощь',
  ]) {
    assert.equal(containsProfanity(value), false, value);
  }
});

test('исправляет только текст, целиком написанный капсом', () => {
  assert.equal(normalizeAllCaps('ПУСТЬ ВСЁ ПОЛУЧИТСЯ!'), 'Пусть всё получится!');
  assert.equal(normalizeAllCaps('Хочу выиграть CTF'), 'Хочу выиграть CTF');
});

test('возвращает все причины, но не принимает решение о публикации', () => {
  const result = automoderateWish('ПИШИ @USER НА HTTPS://EXAMPLE.COM ИЛИ +7 (999) 123-45-67');
  assert.equal(result.wish, 'Пиши @user на https://example.com или +7 (999) 123-45-67');
  assert.equal(result.autoFlag, 'ссылка, упоминание, номер телефона');
});

test('находит дубликат без учёта регистра, пунктуации и е/ё', () => {
  const result = automoderateWish('ПУСТЬ ВСЕ ПОЛУЧИТСЯ!!!', {
    existingWishes: ['Пусть всё получится'],
  });
  assert.equal(result.autoFlag, 'дубликат');
});

test('не смешивает разные числа при поиске дублей', () => {
  const result = automoderateWish('Уникальная заявка номер 11', {
    existingWishes: ['Уникальная заявка номер 1'],
  });
  assert.equal(result.autoFlag, null);
});
