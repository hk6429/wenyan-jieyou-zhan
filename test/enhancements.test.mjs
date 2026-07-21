// 遊戲化改版新增函式測試：續玩落點 / 近期正確率 / 備份還原 / 跨篇複習卷 / 能力標籤計數 / 老師逐題冷熱。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// localStorage mock：需支援 length/key(i)，因為 exportAll 以索引迭代所有 wy_ 前綴鍵。
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
  };
}
function loadStore(ls) {
  const code = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', 'localStorage', `${code}\nreturn module.exports;`)(mod, undefined, ls);
  return mod.exports;
}
function loadQuiz() {
  const code = readFileSync(new URL('../js/quiz.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', `${code}\nreturn module.exports;`)(mod, undefined);
  return mod.exports;
}
function loadLiveWall() {
  const code = readFileSync(new URL('../js/livewall.js', import.meta.url), 'utf8');
  const g = {};
  new Function('globalThis', `${code}\nreturn globalThis.WYLiveWall;`)(g);
  return g.WYLiveWall;
}
const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));

test('recordAnswer 記錄最後練習的篇目（續玩落點）', () => {
  const S = loadStore(memStorage());
  assert.equal(S.getLastTextId(), null);
  S.recordAnswer('t06', true, 'char', { qId: 'a1' });
  S.recordAnswer('t09', false, 'gist', { qId: 'b1' });
  assert.equal(S.getLastTextId(), 't09');
});

test('recentAccuracy：滑動視窗只留最近 8 筆，並算連錯尾段', () => {
  const S = loadStore(memStorage());
  assert.deepEqual(S.recentAccuracy(), { ratio: null, n: 0, streakWrong: 0 });
  for (let i = 0; i < 10; i++) S.recordAnswer('t06', true, 'char', { qId: `c${i}` });
  let r = S.recentAccuracy();
  assert.equal(r.n, 8);            // 視窗上限
  assert.equal(r.ratio, 1);
  S.recordAnswer('t06', false, 'char', { qId: 'x1' });
  S.recordAnswer('t06', false, 'char', { qId: 'x2' });
  r = S.recentAccuracy();
  assert.equal(r.streakWrong, 2);  // 尾端連錯 2
});

test('studiedToday：作答後當日為真', () => {
  const S = loadStore(memStorage());
  assert.equal(S.studiedToday(), false);
  S.recordAnswer('t06', true, 'char', { qId: 'a1' });
  assert.equal(S.studiedToday(), true);
});

test('exportAll / importAll：進度可跨裝置備份還原（round-trip）', () => {
  const lsA = memStorage();
  const A = loadStore(lsA);
  for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < 3; i++) A.recordAnswer('t06', true, ty, { qId: `${ty}${i}` });
  }
  const backup = A.exportAll();
  assert.ok(backup.includes('_wy_backup'));

  const lsB = memStorage();
  const B = loadStore(lsB);
  assert.equal(B.getTextState('t06').total, 0);        // 新裝置空白
  const n = B.importAll(backup);
  assert.ok(n > 0);
  assert.equal(B.getTextState('t06').total, 12);       // 還原後進度一致
  assert.equal(B.importAll('壞掉的字串'), -1);          // 非備份格式回 -1
  assert.equal(B.importAll('{"foo":1}'), -1);
});

test('consumeStreakMilestone：跨里程碑當次回報一次，之後為 null', () => {
  const S = loadStore(memStorage());
  // 手動注入連續 6 天，第 7 天作答應觸發里程碑
  const st = S.load();
  const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  st.streak = { last: yday, days: 6 };
  S.save(st);
  S.recordAnswer('t06', true, 'char', { qId: 'm1' });
  assert.equal(S.consumeStreakMilestone(), 7);
  assert.equal(S.consumeStreakMilestone(), null);
});

test('quiz.tagCount：回傳該篇帶指定能力標籤的題數（無標籤回 0）', () => {
  const Q = loadQuiz();
  Q.init(TEXTS);
  let anyTagged = 0;
  for (const t of TEXTS) {
    for (const tag of ['虛詞', '活用', '古今異義', '通假', '句式']) {
      const c = Q.tagCount(t.id, tag);
      assert.ok(c >= 0);
      anyTagged += c;
    }
  }
  assert.ok(anyTagged > 0, '全庫應有帶能力標籤的題');
});

test('quiz.buildReviewQuiz：跨篇 qId 解析回題目，每題帶自己的 textId', () => {
  const Q = loadQuiz();
  Q.init(TEXTS);
  // 取兩篇各一題的真實 qId
  const q1 = Q.buildQuiz('t06', {}).questions[0];
  const q2 = Q.buildQuiz('t09', {}).questions[0];
  const rev = Q.buildReviewQuiz([q1.id, q2.id], { title: '錯題本' });
  assert.equal(rev.mode, 'review');
  assert.equal(rev.title, '錯題本');
  assert.equal(rev.questions.length, 2);
  assert.ok(rev.questions.every((q) => q.textId));   // 複習卷每題須自帶 textId
});

test('livewall.questionHotspots：逐題聚合正確率，<50% 標記 cold', () => {
  const W = loadLiveWall();
  const rows = [
    { nick: 'a', hist: '111' },
    { nick: 'b', hist: '100' },
    { nick: 'c', hist: '110' },
  ];
  const hot = W.questionHotspots(rows, 3);
  assert.equal(hot.length, 3);
  assert.equal(hot[0].pct, 100);      // 第1題：三人皆對
  assert.equal(hot[1].pct, 67);       // 第2題：a對 b錯 c對 → 2/3
  assert.equal(hot[2].pct, 33);       // 第3題：僅 a 對 → 1/3
  assert.equal(hot[2].cold, true);    // <50% 標紅
  assert.equal(hot[0].cold, false);
});
