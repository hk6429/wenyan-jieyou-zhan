import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));
const quizCode = readFileSync(new URL('../js/quiz.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'window', `${quizCode}\nreturn module.exports;`)(mod, undefined);
const Q = mod.exports;
Q.init(TEXTS);

function distribution(indexes) {
  const counts = [0, 0, 0, 0];
  indexes.forEach((i) => { counts[i] += 1; });
  return counts.map((n) => n / indexes.length);
}

test('buildQuiz 顯示後的正解位置四區皆介於 20%～30%', () => {
  const indexes = TEXTS.flatMap((t) => Q.buildQuiz(t.id, { seed: 20260722 }).questions.map((q) => q.answerIdx));
  const ratios = distribution(indexes);
  ratios.forEach((ratio, i) => assert.ok(ratio >= 0.2 && ratio <= 0.3, `index ${i} 實得 ${(ratio * 100).toFixed(2)}%`));
});

test('原始題庫 answer 索引不再有單一位置超過 40%', () => {
  const indexes = TEXTS.flatMap((t) => t.questions.map((q) => q.answer));
  const ratios = distribution(indexes);
  ratios.forEach((ratio, i) => assert.ok(ratio <= 0.4, `index ${i} 實得 ${(ratio * 100).toFixed(2)}%`));
});
