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

test('recordResult：勝+20、敗+5（不倒扣）、平+5；跨季歸零', () => {
  store.clear();
  let r = S.recordResult('2026-07-20', 'win');
  assert.deepEqual([r.pts, r.wins, r.battles], [20, 1, 1]);
  r = S.recordResult('2026-07-21', 'lose');
  assert.deepEqual([r.pts, r.wins, r.battles], [25, 1, 2]);
  assert.equal(r.title, '童生');
  r = S.recordResult('2026-08-01', 'draw'); // 換季歸零
  assert.deepEqual([r.key, r.pts, r.battles], ['2026-08', 5, 1]);
});
