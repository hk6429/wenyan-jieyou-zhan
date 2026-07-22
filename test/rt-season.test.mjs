import { test } from 'node:test';
import assert from 'node:assert/strict';

// 注入假 localStorage（node 沒有 window）——必須在 import 前備好
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

await import('../js/rt-season.js');
const S = globalThis.WYRtSeason;

test('seasonKey：月賽季', () => {
  assert.equal(S.seasonKey('2026-07-20'), '2026-07');
  assert.equal(S.seasonKey('2026-12-01'), '2026-12');
});

test('titleFor：六階功名門檻', () => {
  assert.equal(S.titleFor(0), '童生');
  assert.equal(S.titleFor(59), '童生');
  assert.equal(S.titleFor(60), '秀才');
  assert.equal(S.titleFor(160), '舉人');
  assert.equal(S.titleFor(320), '貢士');
  assert.equal(S.titleFor(560), '進士');
  assert.equal(S.titleFor(880), '狀元');
  assert.equal(S.titleFor(99999), '狀元');
});

test('recordResult：功名分綁答對，勝僅小加成；敗／平只記參與；跨季歸零', () => {
  store.clear();
  let r = S.recordResult('2026-07-20', 'win', 8);
  assert.deepEqual([r.pts, r.wins, r.battles, r.correct], [10, 1, 1, 8]);
  r = S.recordResult('2026-07-21', 'lose', 6);
  assert.deepEqual([r.pts, r.wins, r.battles, r.correct, r.participation], [10, 1, 2, 14, 1]);
  assert.equal(r.title, '童生');
  r = S.recordResult('2026-08-01', 'draw', 5); // 換季歸零
  assert.deepEqual([r.key, r.pts, r.battles, r.correct], ['2026-08', 0, 1, 5]);
});
