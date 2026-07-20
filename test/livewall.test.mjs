import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/livewall.js';

const W = globalThis.WYLiveWall;
const rows = [
  { nick: '甲', score: 9 }, { nick: '乙', score: 8 }, { nick: '丙', score: 7 },
  { nick: '丁', score: 6 }, { nick: '戊', score: 5 }, { nick: '己', score: 4 }, { nick: '庚', score: 1 },
];

test('safeBoard：只露前 5＋自己名次，不外流整份名單', () => {
  const b = W.safeBoard(rows, '庚');
  assert.equal(b.top.length, 5);
  assert.deepEqual(b.top.map((r) => r.nick), ['甲', '乙', '丙', '丁', '戊']);
  assert.deepEqual(b.me, { rank: 7, nick: '庚', score: 1 });
  assert.equal(b.total, 7);
  assert.ok(!('rows' in b));
});

test('safeBoard：自己在前段不重複列、查無自己回 me:null', () => {
  assert.equal(W.safeBoard(rows, '甲').me, null);
  assert.equal(W.safeBoard(rows, '路人').me, null);
});

test('buildHerald：硯靈宣讀開頭、冠軍入詞、濁墨收尾；空榜給邀戰詞', () => {
  const lines = W.buildHerald({ label: '五年三班', rows });
  assert.match(lines[0], /^硯靈宣讀：/);
  assert.ok(lines.some((l) => l.includes('甲')));
  assert.match(lines[lines.length - 1], /濁墨退散/);
  assert.match(W.buildHerald({ label: 'x', rows: [] })[0], /^硯靈宣讀：/);
});
