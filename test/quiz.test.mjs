// js/quiz.js 出題層測試：重點在新增的 cloze 填空生成題（B1）——須從既有原文＋注釋即時生成、不捏造、寬鬆比對。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadQuiz() {
  const code = readFileSync(new URL('../js/quiz.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', `${code}\nreturn module.exports;`)(mod, undefined);
  return mod.exports;
}
const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));
const Q = loadQuiz();
Q.init(TEXTS);

test('checkCloze 寬鬆比對：全形/半形/前後空白都容忍，空字串必錯', () => {
  const q = { answerText: '慢', accept: ['慢'] };
  assert.equal(Q.checkCloze(q, '慢'), true);
  assert.equal(Q.checkCloze(q, ' 慢 '), true);
  assert.equal(Q.checkCloze(q, ''), false);
  assert.equal(Q.checkCloze(q, '快'), false);
  const q2 = { answerText: '12', accept: ['12'] };
  assert.equal(Q.checkCloze(q2, '１２'), true); // 全形數字→半形
});

test('buildClozeQuiz：每題的挖空詞必真的出現在該段原文（守住不捏造）', () => {
  let checked = 0;
  for (const t of TEXTS) {
    const quiz = Q.buildClozeQuiz(t.id, { seed: 1, n: 50 });
    for (const q of quiz.questions) {
      const seg = t.segments.find((s) => s.no === q.segNo);
      assert.ok(seg, `${q.id} 找得到對應 segment`);
      assert.ok(seg.text.includes(q.answerText), `${q.id} 的「${q.answerText}」須在原句中`);
      assert.ok(q.prompt.includes('＿'), `${q.id} 要有挖空底線`);
      assert.ok(!q.prompt.includes(q.answerText), `${q.id} 挖空後原句不應再含答案`);
      assert.ok(q.hint && q.hint.length > 0, `${q.id} 要有白話提示`);
      assert.ok(Q.checkCloze(q, q.answerText), `${q.id} 自身答案要判對`);
      checked++;
    }
  }
  assert.ok(checked > 100, `全庫應生成足量填空題，實得 ${checked}`);
});

test('buildClozeQuiz：seed 相同結果一致（可重現），n 限制題數', () => {
  const a = Q.buildClozeQuiz(TEXTS[0].id, { seed: 7, n: 5 });
  const b = Q.buildClozeQuiz(TEXTS[0].id, { seed: 7, n: 5 });
  assert.deepEqual(a.questions.map((x) => x.id), b.questions.map((x) => x.id));
  assert.ok(a.questions.length <= 5);
  assert.equal(a.mode, 'cloze');
});

test('buildClozeQuiz：未知 textId 回空題組不丟例外', () => {
  const r = Q.buildClozeQuiz('nope', {});
  assert.deepEqual(r.questions, []);
  assert.equal(r.mode, 'cloze');
});

test('typeLabel 認得 cloze', () => {
  assert.equal(Q.typeLabel('cloze'), '填空');
});

test('提示券只會挑一個尚未排除的錯誤選項', () => {
  const q = { answerIdx: 2, options: ['甲', '乙', '丙', '丁'] };
  const first = Q.hintWrongIndex(q);
  assert.ok([0, 1, 3].includes(first));
  const second = Q.hintWrongIndex(q, [first]);
  assert.ok([0, 1, 3].includes(second));
  assert.notEqual(second, first);
  assert.equal(Q.hintWrongIndex(q, [0, 1, 3]), -1);
});

test('混合 8 題依字義、句義、段旨、篇章文意各抽 2 題', () => {
  const r = Q.buildQuiz('t01', { seed: 21, n: 8, ramp: true });
  const counts = r.questions.reduce((out, q) => ({ ...out, [q.type]: (out[q.type] || 0) + 1 }), {});
  for (const type of ['char', 'sentence', 'gist', 'theme']) {
    assert.equal(counts[type], 2, `${type} 應有 2 題`);
  }
});

test('混合題庫某一題型不足時，以其他題型補滿且不重複', () => {
  const Mini = loadQuiz();
  const types = ['char', 'char', 'char', 'sentence', 'gist', 'gist', 'theme', 'theme'];
  const questions = types.map((type, i) => ({
    id: `m${i}`, type, stem: `題 ${i}`, options: ['甲', '乙', '丙', '丁'], answer: 0, explain: '解析',
  }));
  Mini.init([{ id: 'mini', title: '迷你題庫', questions }]);
  const r = Mini.buildQuiz('mini', { seed: 5, n: 8 });
  assert.equal(r.questions.length, 8);
  assert.equal(new Set(r.questions.map((q) => q.id)).size, 8);
  assert.equal(r.questions.filter((q) => q.type === 'sentence').length, 1);
  assert.equal(r.questions.filter((q) => q.type === 'char').length, 3);
});

test('buildReviewQuiz：fc- 閃卡到期題可重建為語譯選擇題，且每場最多 10 題', () => {
  const ids = TEXTS[0].segments.map((s) => `fc-${TEXTS[0].id}-${s.no}`);
  const r = Q.buildReviewQuiz([...ids, ...TEXTS[0].questions.slice(0, 20).map((q) => q.id)], { seed: 9 });
  assert.ok(r.questions.some((q) => q.id.startsWith('fc-')));
  assert.ok(r.questions.length <= 10);
  for (const q of r.questions) assert.equal(q.options.length, 4);
});

test('混合暖身前三題由易到難，其餘仍維持交錯而非整批依題型排序', () => {
  const r = Q.buildQuiz('t01', { seed: 21, n: 20, ramp: true });
  const order = r.questions.map((q) => ({ char: 0, sentence: 1, gist: 2, theme: 3 }[q.type]));
  assert.deepEqual(order.slice(0, 3), order.slice(0, 3).toSorted((a, b) => a - b));
  assert.equal(order[0], Math.min(...order));
  assert.ok(order.slice(3).some((x, i, a) => i > 0 && x < a[i - 1]), `暖身後題型應交錯，實得 ${order}`);
});
