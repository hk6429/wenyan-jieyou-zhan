import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));
function classic(file) {
  const code = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', `${code}\nreturn module.exports;`)(mod, undefined);
  return mod.exports;
}

test('34 篇難度皆為 1–5，且 J/S 兩學段內都有細分', () => {
  assert.equal(TEXTS.length, 34);
  assert.ok(TEXTS.every((t) => Number.isInteger(t.difficulty) && t.difficulty >= 1 && t.difficulty <= 5));
  assert.ok(new Set(TEXTS.filter((t) => t.level === 'J').map((t) => t.difficulty)).size >= 3);
  assert.ok(new Set(TEXTS.filter((t) => t.level === 'S').map((t) => t.difficulty)).size >= 3);
  assert.deepEqual(TEXTS.filter((t) => t.difficulty === 1).map((t) => t.id).sort(), ['t06', 't07', 't08']);
});

test('週經典賽同週固定、跨週更換，20 篇且四題型各 5 題', () => {
  const Q = classic('quiz.js'); Q.init(TEXTS);
  const a = Q.buildWeeklyQuiz({ weekKey: '2026-W30' });
  const b = Q.buildWeeklyQuiz({ weekKey: '2026-W30' });
  const c = Q.buildWeeklyQuiz({ weekKey: '2026-W31' });
  assert.deepEqual(a.questions.map((q) => q.id), b.questions.map((q) => q.id));
  assert.notDeepEqual(a.questions.map((q) => q.id), c.questions.map((q) => q.id));
  assert.equal(a.questions.length, 20);
  assert.equal(new Set(a.questions.map((q) => q.textId)).size, 20);
  assert.deepEqual(Object.fromEntries(['char', 'sentence', 'gist', 'theme'].map((ty) => [ty, a.questions.filter((q) => q.type === ty).length])), { char: 5, sentence: 5, gist: 5, theme: 5 });
});

test('CSP 同步放行 visitor badge 與 GoatCounter 所需網域', () => {
  const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const vcsp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  const hcsp = headers.match(/Content-Security-Policy: (.+)/)[1];
  assert.equal(vcsp, hcsp);
  for (const host of ['visitor-badge.laobi.icu', 'gc.zgo.at', 'hk6429.goatcounter.com']) assert.ok(vcsp.includes(host));
});
