// js/store.js 前端進度層測試：精通判準（B2 假精熟修正）＋ per-item SRS/錯題本（SRS + 錯題重測共用結構）。
// store.js 是瀏覽器 classic <script>（IIFE 全域），以 Function 載入注入 mem localStorage，讀 module.exports。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
function loadStore() {
  const code = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', 'localStorage', `${code}\nreturn module.exports;`)(mod, undefined, memStorage());
  return mod.exports;
}

// 答一輪自測：四題型各答對 n 題（預設全對），回傳最後的 text state
function drillAllTypes(S, textId, n, correct = true) {
  let t;
  for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < n; i++) t = S.recordAnswer(textId, correct, ty, { qId: `${textId}-${ty}-${i}` });
  }
  return t;
}

test('精通需廣度：只狂刷單一題型（char）即使答很多、答對率高，也不精通', () => {
  const S = loadStore();
  let t;
  for (let i = 0; i < 30; i++) t = S.recordAnswer('t01', true, 'char', { qId: `c${i}` });
  assert.equal(t.total, 30);
  assert.equal(t.mastered, false); // 缺 sentence/gist/theme 廣度 → 不精通
});

test('精通需四題型都練過 + 總數≥10 + 答對率≥80%', () => {
  const S = loadStore();
  // 四型各 3 題全對 = 12 題、100%、四型齊備 → 精通
  const t = drillAllTypes(S, 't02', 3, true);
  assert.equal(t.total, 12);
  assert.equal(t.mastered, true);
});

test('答對率不足 80% 不精通（四型齊備但一半答錯）', () => {
  const S = loadStore();
  let t;
  for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < 3; i++) t = S.recordAnswer('t03', i % 2 === 0, ty, { qId: `${ty}-${i}` }); // 每型 2對1錯
  }
  assert.ok(t.correct / t.total < 0.8);
  assert.equal(t.mastered, false);
});

test('對戰作答（countForMastery:false）只賺墨錠、不灌精通統計，不會靠重複刷同批題精通', () => {
  const S = loadStore();
  const inkBefore = S.getInk();
  let t;
  for (let i = 0; i < 40; i++) t = S.recordAnswer('t04', true, 'char', { countForMastery: false });
  assert.equal(t.total, 0);         // 完全不計入精通統計
  assert.equal(t.mastered, false);
  assert.ok(S.getInk() > inkBefore); // 但仍有墨錠獎勵（受每日上限）
  assert.ok(S.getInk() <= S.DAILY_INK_CAP);
});

test('精通為 sticky：達標後即使再答錯也不回退', () => {
  const S = loadStore();
  drillAllTypes(S, 't05', 3, true);
  assert.equal(S.getTextState('t05').mastered, true);
  let t;
  for (let i = 0; i < 20; i++) t = S.recordAnswer('t05', false, 'char', { qId: `x${i}` });
  assert.equal(t.mastered, true); // 仍精通
});

test('SRS：答錯進錯題本並當日到期；答對同題移出錯題本（訂正閉環）', () => {
  const S = loadStore();
  S.recordAnswer('t06', false, 'char', { qId: 'Q1' });
  assert.deepEqual(S.wrongItems().sort(), ['Q1']);
  assert.ok(S.dueItems().some((x) => x.qId === 'Q1')); // 當日到期可複習
  S.recordAnswer('t06', true, 'char', { qId: 'Q1' });
  assert.deepEqual(S.wrongItems(), []); // 訂正後移出
});

test('SRS：連續答對間隔遞增（1→3→更長），到期日往後推', () => {
  const S = loadStore();
  const today = S.dayNum();
  let it = S.recordItem('Q2', 'good', 't07');
  assert.equal(it.interval, 1);
  assert.equal(it.due, today + 1);
  it = S.recordItem('Q2', 'good', 't07');
  assert.equal(it.interval, 3);
  it = S.recordItem('Q2', 'good', 't07');
  assert.ok(it.interval > 3); // 之後依 ease 放大
});

test('SRS：未到期的題不出現在 dueItems；validIds 可過濾已不存在的題', () => {
  const S = loadStore();
  S.recordItem('Q3', 'good', 't08'); // 明天才到期
  assert.ok(!S.dueItems().some((x) => x.qId === 'Q3'));
  S.recordItem('Q4', 'again', 't08'); // 今天到期
  assert.ok(S.dueItems().some((x) => x.qId === 'Q4'));
  assert.deepEqual(S.dueItems(['nonexistent']), []); // validIds 過濾
});

test('每日墨錠上限仍生效（答對賺取被截斷）', () => {
  const S = loadStore();
  for (let i = 0; i < 100; i++) S.recordAnswer('t09', true, 'char', { qId: `k${i}` });
  assert.equal(S.inkToday().earned, S.DAILY_INK_CAP);
  assert.equal(S.inkToday().left, 0);
});
