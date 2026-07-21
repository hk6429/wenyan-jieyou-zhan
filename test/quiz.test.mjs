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
