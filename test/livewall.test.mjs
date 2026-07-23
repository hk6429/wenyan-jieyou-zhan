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

test('本場講評：以題號 hist map 統計有效作答、缺答與需講評題', () => {
  const review = W.buildTeacherReview({
    rows: [
      { nick: '甲', hist: { 1: 1, 2: 0 } },
      { nick: '乙', hist: { 1: 1 } },
      { nick: '丙', hist: { 2: 0 } },
    ],
    questions: [
      { stem: '第一題？', options: ['甲', '乙'], answerIdx: 1 },
      { stem: '第二題？', options: ['是', '否'], answerIdx: 0 },
    ],
  });
  assert.deepEqual(review, [
    { qNo: 1, stem: '第一題？', answer: '乙', correct: 2, answered: 2, missing: 1, pct: 100, needsReview: false },
    { qNo: 2, stem: '第二題？', answer: '是', correct: 0, answered: 2, missing: 1, pct: 0, needsReview: true },
  ]);
});

test('本場講評可匯出 Excel 可讀 CSV，並正確跳脫逗號與雙引號', () => {
  const csv = W.teacherReviewCsv([
    { qNo: 1, stem: '「甲,乙」何者正確？', answer: '"乙"', answered: 8, missing: 2, pct: 75, needsReview: false },
  ]);
  assert.ok(csv.startsWith('\uFEFF題號,題幹,正解,有效作答N,缺答N,正確率,是否需講評\r\n'));
  assert.match(csv, /1,\"「甲,乙」何者正確？\",\"\"\"乙\"\"\",8,2,75%,否/);
});

test('本場講評列印版包含匿名隱私提示、完整欄位與安全文字', () => {
  const html = W.teacherReviewPrintHtml({
    code: '5A03',
    review: [{ qNo: 1, stem: '<辨義>', answer: '正解', answered: 8, missing: 2, pct: 40, needsReview: true }],
  });
  assert.match(html, /本場講評・5A03/);
  assert.match(html, /本表不含學生姓名/);
  assert.match(html, /有效作答N/);
  assert.match(html, /缺答N/);
  assert.match(html, /需講評/);
  assert.doesNotMatch(html, /<辨義>/);
  assert.match(html, /&lt;辨義&gt;/);
});
