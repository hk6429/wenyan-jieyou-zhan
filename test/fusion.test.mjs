// 文魄合契純邏輯測試：資格門檻／合契成功（雙親不動）／失敗只扣墨錠／被動二選一／隨行加成／配方揭曉。
// js/fusion-store.js 是瀏覽器 classic <script>（IIFE 全域，無 export），故以 vm 載入後讀 module.exports。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadStore() {
  const code = readFileSync(new URL('../js/fusion-store.js', import.meta.url), 'utf8');
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.module.exports;
}
const FS = loadStore();

// 可注入的假 deps：墨錠餘額 + 各篇精通度（mastery）+ 固定 rng。
function fakeDeps({ ink = 100, mastery = {}, rng = () => 0.5 } = {}) {
  const s = { ink };
  return {
    _s: s,
    rng,
    getInk: () => s.ink,
    spendInk: (a) => { if (s.ink < a) return false; s.ink -= a; return true; },
    addInk: (a) => { s.ink = Math.max(0, s.ink + a); return s.ink; },
    mastery: (tid) => {
      const m = mastery[tid] || { ratio: 0, total: 0, mastered: false };
      return m.mastered === undefined ? { ...m, mastered: true } : m;
    },
    title: (tid) => tid,
    author: () => '',
  };
}
// 隱逸之魄 parents = t18, t22
const both = (o) => ({ t18: o, t22: o });

test('WENPO 資料完整：6 隻、parents 皆合法 textId、riddle 答案索引合法、被動恰兩個', () => {
  assert.equal(FS.WENPO.length, 6);
  const ids = new Set(FS.WENPO.map((w) => w.id));
  assert.equal(ids.size, 6);
  for (const w of FS.WENPO) {
    assert.equal(w.parents.length, 2);
    for (const p of w.parents) assert.match(p, /^t(0[1-9]|1[0-9]|2[0-7])$/);
    assert.equal(w.riddle.options.length, 4);
    assert.ok(w.riddle.answer >= 0 && w.riddle.answer < 4);
    assert.ok(w.riddle.q.length >= 10);
    assert.equal(w.passives.length, 2);
    assert.ok(w.bornLine.length >= 12 && w.desc.length >= 12);
  }
  // 反「選項固定第一位」：正解不可全部落在同一索引
  const answerIdxs = new Set(FS.WENPO.map((w) => w.riddle.answer));
  assert.ok(answerIdxs.size >= 2, '隱藏題正解索引過於集中');
});

test('資格判定門檻：兩篇皆精通(ratio≥0.8且total≥30)＋墨錠足夠才 eligible', () => {
  const f = FS.defaultFusion();
  // 達標
  let e = FS.getEligibility(f, 'yinyi', fakeDeps({ ink: 100, mastery: both({ ratio: 0.9, total: 40 }) }));
  assert.equal(e.eligible, true);
  assert.equal(e.reasons.parents, true);
  assert.equal(e.reasons.ink, true);
  assert.equal(e.cost, FS.FUSE_COST);

  // 其中一篇作答量不足 30 → 不合格
  e = FS.getEligibility(f, 'yinyi', fakeDeps({ mastery: { t18: { ratio: 0.9, total: 40 }, t22: { ratio: 0.9, total: 20 } } }));
  assert.equal(e.eligible, false);
  assert.equal(e.reasons.parents, false);

  // 答對率未達 0.8 → 不合格
  e = FS.getEligibility(f, 'yinyi', fakeDeps({ mastery: both({ ratio: 0.5, total: 40 }) }));
  assert.equal(e.reasons.parents, false);

  // 墨錠不足 → ink=false
  e = FS.getEligibility(f, 'yinyi', fakeDeps({ ink: FS.FUSE_COST - 1, mastery: both({ ratio: 0.9, total: 40 }) }));
  assert.equal(e.reasons.ink, false);
  assert.equal(e.eligible, false);
});

test('合契資格採核心四題型精通旗標，不能只靠總答對率與刷題量通關', () => {
  const f = FS.defaultFusion();
  const highScoreButNotMastered = both({ ratio: 0.95, total: 80, mastered: false });
  const e = FS.getEligibility(f, 'yinyi', fakeDeps({ ink: 100, mastery: highScoreButNotMastered }));
  assert.equal(e.eligible, false);
  assert.equal(e.reasons.parents, false);
});

test('合契成功：出正確文魄、扣合契費、雙親精通度完全不動', () => {
  const f = FS.defaultFusion();
  const mastery = both({ ratio: 0.9, total: 40 });
  const before = JSON.stringify(mastery);
  const deps = fakeDeps({ ink: 100, mastery, rng: () => 0.5 }); // 0.5 ≥ FAIL_RATE → 成功
  const r = FS.fuse(f, 'yinyi', deps);
  assert.equal(r.ok, true);
  assert.equal(r.result, 'success');
  assert.equal(r.wenpo.id, 'yinyi');
  assert.equal(r.wenpo.parents.join(','), 't18,t22');
  assert.equal(deps.getInk(), 100 - FS.FUSE_COST);       // 扣了合契費
  assert.equal(FS.listWenpo(f).find((w) => w.id === 'yinyi').owned, true);
  assert.equal(JSON.stringify(mastery), before);          // 雙親（選文精通度）零異動
});

test('合契達標後保證成功：低亂數不再讓真實學習證據隨機失敗', () => {
  const f = FS.defaultFusion();
  const mastery = both({ ratio: 0.9, total: 40 });
  const deps = fakeDeps({ ink: 100, mastery, rng: () => 0 });
  const r = FS.fuse(f, 'yinyi', deps);
  assert.equal(r.ok, true);
  assert.equal(r.result, 'success');
  assert.equal(deps.getInk(), 100 - FS.FUSE_COST);
  assert.equal(FS.listWenpo(f).find((w) => w.id === 'yinyi').owned, true);
});

test('合契擋下：未擁有資格 / 墨錠不足 / 重複擁有，各回對應 reason', () => {
  const okMastery = both({ ratio: 0.9, total: 40 });
  // 資格不符
  let r = FS.fuse(FS.defaultFusion(), 'yinyi', fakeDeps({ ink: 100, mastery: both({ ratio: 0.3, total: 40 }) }));
  assert.equal(r.reason, 'not-eligible');
  // 墨錠不足
  r = FS.fuse(FS.defaultFusion(), 'yinyi', fakeDeps({ ink: 1, mastery: okMastery }));
  assert.equal(r.reason, 'ink');
  // 重複擁有
  const f = FS.defaultFusion();
  FS.fuse(f, 'yinyi', fakeDeps({ ink: 100, mastery: okMastery }));
  r = FS.fuse(f, 'yinyi', fakeDeps({ ink: 100, mastery: okMastery }));
  assert.equal(r.reason, 'owned');
});

test('被動二選一套用：玩家親選、一次定終身、擋未擁有與不存在被動', () => {
  const f = FS.defaultFusion();
  FS.fuse(f, 'zhongyi', fakeDeps({ ink: 100, mastery: { t04: { ratio: 0.9, total: 40 }, t14: { ratio: 0.9, total: 40 } } }));
  // 未擁有的文魄
  assert.equal(FS.chooseWenpoPassive(f, 'yinyi', 'wangji').reason, 'not-owned');
  // 不存在的被動
  assert.equal(FS.chooseWenpoPassive(f, 'zhongyi', 'nope').reason, 'bad-passive');
  // 正常選定
  assert.equal(FS.chooseWenpoPassive(f, 'zhongyi', 'jinzhong').ok, true);
  assert.equal(FS.listWenpo(f).find((w) => w.id === 'zhongyi').passive, 'jinzhong');
  // 一次定終身
  const again = FS.chooseWenpoPassive(f, 'zhongyi', 'lizhi');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'already-chosen');
});

test('隨行加成計算：activeMods 折出隨行文魄已選被動的效果；無隨行回全零', () => {
  const zeroMods = (m) => assert.ok(m.damageBonus === 0 && m.shieldOnce === 0 && m.inkDropBonus === 0);
  const f = FS.defaultFusion();
  zeroMods(FS.activeMods(f));
  FS.fuse(f, 'zhongyi', fakeDeps({ ink: 100, mastery: { t04: { ratio: 0.9, total: 40 }, t14: { ratio: 0.9, total: 40 } } }));
  // 選傷害型被動並隨行
  FS.chooseWenpoPassive(f, 'zhongyi', 'jinzhong'); // damageBonus 3
  FS.setActive(f, 'zhongyi');
  assert.equal(FS.activeMods(f).damageBonus, 3);
  // 未選被動的文魄隨行 → 不加成
  const g = FS.defaultFusion();
  FS.fuse(g, 'yinyi', fakeDeps({ ink: 100, mastery: both({ ratio: 0.9, total: 40 }) }));
  FS.setActive(g, 'yinyi');
  zeroMods(FS.activeMods(g));
  // 選墨錠型被動
  FS.chooseWenpoPassive(g, 'yinyi', 'danbo'); // inkDropBonus 0.1
  assert.ok(Math.abs(FS.activeMods(g).inkDropBonus - 0.1) < 1e-9);
  // setActive 擋未擁有
  assert.equal(FS.setActive(FS.defaultFusion(), 'yinyi').reason, 'not-owned');
});

test('配方揭曉解謎：未答對前 preview 未知；答對隱藏題後看見真身；答錯可再試', () => {
  const f = FS.defaultFusion();
  let p = FS.getPreview(f, 'yinyi');
  assert.equal(p.known, false);
  assert.ok(p.riddle && p.riddle.options.length === 4);
  const w = FS.WENPO_BY_ID.get('yinyi');
  const wrong = (w.riddle.answer + 1) % 4;
  let r = FS.answerRiddle(f, 'yinyi', wrong);
  assert.equal(r.correct, false);
  assert.equal(FS.getPreview(f, 'yinyi').known, false); // 答錯不揭曉，可再試
  r = FS.answerRiddle(f, 'yinyi', w.riddle.answer);
  assert.equal(r.correct, true);
  p = FS.getPreview(f, 'yinyi');
  assert.equal(p.known, true);
  assert.equal(p.wenpo.id, 'yinyi');
  // 已擁有者自動視為已揭曉
  const g = FS.defaultFusion();
  FS.fuse(g, 'yinyi', fakeDeps({ ink: 100, mastery: both({ ratio: 0.9, total: 40 }) }));
  assert.equal(FS.getPreview(g, 'yinyi').known, true);
});

test('暱稱：正規化、超長截斷至 8 字、空字串清為 null', () => {
  const f = FS.defaultFusion();
  assert.equal(FS.setNickname(f, '  大乃  ').nickname, '大乃');
  assert.equal(FS.setNickname(f, '一二三四五六七八九十').nickname.length, 8);
  assert.equal(FS.setNickname(f, '   ').nickname, null);
});
