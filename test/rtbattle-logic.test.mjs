import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/rtbattle-logic.js'; // 執行 IIFE，掛 globalThis.WYRtLogic

const L = globalThis.WYRtLogic;

// 假 TEXTS：3 篇（2 J + 1 S），各帶 questions
const TEXTS = [
  { id: 't01', level: 'J', questions: [] },
  { id: 't02', level: 'J', questions: [] },
  { id: 't08', level: 'S', questions: [] },
];
// 假 buildQuiz：每篇回 4 題，題目/選項固定（便於斷言確定性）
const stubQuiz = (id, { seed }) => ({
  title: id, textId: id,
  questions: Array.from({ length: 4 }, (_, i) => ({
    id: `${id}-q${i}`, stem: `${id}題${i}`, options: ['甲', '乙', '丙', '丁'],
    answerIdx: (seed + i) % 4, explain: '', type: 'char',
  })),
});

test('mulberry32：同 seed 序列完全一致', () => {
  const a = L.mulberry32(42); const b = L.mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('pickTexts：single/level/mixed 皆回排序去重 id', () => {
  assert.deepEqual(L.pickTexts(TEXTS, { mode: 'single', textId: 't08' }), ['t08']);
  assert.deepEqual(L.pickTexts(TEXTS, { mode: 'level', level: 'J' }), ['t01', 't02']);
  assert.deepEqual(L.pickTexts(TEXTS, { mode: 'mixed' }), ['t01', 't02', 't08']);
});

test('buildRounds：同 seed 同 scope → 同題同序；不看 TEXTS 傳入順序', () => {
  const q1 = L.buildRounds(TEXTS, { mode: 'mixed' }, 7, 20, stubQuiz);
  const q2 = L.buildRounds([...TEXTS].reverse(), { mode: 'mixed' }, 7, 20, stubQuiz);
  assert.deepEqual(q1, q2);
  assert.ok(q1.every((q) => q.textId));
});

test('buildRounds：題庫不足 rounds 時全取；single 只取該篇', () => {
  const single = L.buildRounds(TEXTS, { mode: 'single', textId: 't01' }, 3, 20, stubQuiz);
  assert.equal(single.length, 4); // 一篇 4 題
  assert.ok(single.every((q) => q.textId === 't01'));
});

test('resolveAnswer：答對疊 combo 造傷、答錯清 combo；雙倍與 comboBoost 生效', () => {
  let s = L.newLocalState(100);
  s = L.resolveAnswer(s, true); // combo1: 10+4=14
  assert.equal(s.dmg, 14);
  assert.equal(s.combo, 1);
  const dbl = L.resolveAnswer(s, true, { double: true }); // combo2: (10+8)*2=36
  assert.equal(dbl.dmg, 14 + 36);
  const wrong = L.resolveAnswer(s, false);
  assert.equal(wrong.combo, 0);
});

test('dealtDamage：取 hpB 差值、不為負', () => {
  assert.equal(L.dealtDamage({ hpB: 100 }, { hpB: 86 }), 14);
  assert.equal(L.dealtDamage({ hpB: 100 }, { hpB: 100 }), 0);
  assert.equal(L.dealtDamage({ hpB: 100 }, { hpB: 120 }), 0);
});

test('judge：血歸零、雙完比血、斷線判勝、未分勝負', () => {
  const base = { myHp: 100, oppHp: 100, myDone: false, oppDone: false, oppHbAgeMs: 0 };
  assert.equal(L.judge({ ...base, myHp: 0 }), 'lose');
  assert.equal(L.judge({ ...base, oppHp: 0 }), 'win');
  assert.equal(L.judge({ ...base, myDone: true, oppDone: true, myHp: 80, oppHp: 60 }), 'win');
  assert.equal(L.judge({ ...base, myDone: true, oppDone: true, myHp: 60, oppHp: 60 }), 'draw');
  assert.equal(L.judge({ ...base, oppHbAgeMs: L.DEAD_MS + 1 }), 'win');
  assert.equal(L.judge(base), null);
});
