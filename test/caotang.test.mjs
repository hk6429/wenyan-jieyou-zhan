import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// caotang-store.js 是相容雙載入的 IIFE：副作用 import 後從 globalThis 取 API
import '../js/caotang-store.js';
const CT = globalThis.WYCaotangStore;

// 用真實題庫資料當固定樣本（掛軸/名句池要對真原文驗證）
const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url)));

// 四題型各≥2 的廣度（精通門檻要求，與核心 computeMastered 一致）
const FULL_TYPES = { char: { correct: 2, total: 2 }, sentence: { correct: 2, total: 2 }, gist: { correct: 2, total: 2 }, theme: { correct: 2, total: 2 } };
// 造一份進度物件：mastered = { id: [correct, total] }。total>=10 者補上四題型廣度使其達精通門檻。
function progressOf(map) {
  const texts = {};
  for (const [id, [correct, total]] of Object.entries(map)) {
    texts[id] = { seen: total, correct, total, types: total >= 10 ? FULL_TYPES : {} };
  }
  return { texts };
}
// 讓某篇「精通」：total=10, correct=9 → 90% 且四題型各≥2
const M = [9, 10];
// 讓某篇「未精通」：total=4, correct=4 → 題數不足 10
const NM = [4, 4];

test('isMastered：需 total>=10、答對率>=80% 且四題型各>=2（白帽：不得只刷單一題型）', () => {
  assert.equal(CT.isMastered({ correct: 9, total: 10, types: FULL_TYPES }), true);
  assert.equal(CT.isMastered({ correct: 8, total: 10, types: FULL_TYPES }), true);  // 8/10=0.8 剛好達標
  assert.equal(CT.isMastered({ correct: 9, total: 10 }), false);                    // 缺四題型廣度
  assert.equal(CT.isMastered({ correct: 20, total: 20, types: { char: { correct: 20, total: 20 } } }), false); // 只刷字義
  assert.equal(CT.isMastered({ correct: 8, total: 8, types: FULL_TYPES }), false);  // 題數不足 10
  assert.equal(CT.isMastered({ correct: 7, total: 10, types: FULL_TYPES }), false); // 70%
});

test('三院落 derive 百分比：J/S 精通比例＋藏書閣答題量', () => {
  // J 篇共 11、S 篇共 16（依 texts.json 實況）
  const jTexts = TEXTS.filter((t) => t.level === 'J');
  const sTexts = TEXTS.filter((t) => t.level === 'S');
  // 精通 2 篇 J、1 篇 S；總答題量湊 150
  const prog = progressOf({
    [jTexts[0].id]: M, [jTexts[1].id]: M,
    [sTexts[0].id]: M,
    [sTexts[1].id]: [30, 120], // 灌答題量但不精通(25%)
  });
  const cs = CT.courtyards(TEXTS, prog);
  assert.deepEqual(cs.map((c) => c.name), ['蒙學院', '觀止軒', '藏書閣']);
  const meng = cs.find((c) => c.id === 'meng');
  const guanzhi = cs.find((c) => c.id === 'guanzhi');
  const cangshu = cs.find((c) => c.id === 'cangshu');
  assert.equal(meng.total, jTexts.length);
  assert.equal(meng.done, 2);
  assert.equal(meng.pct, Math.round((2 / jTexts.length) * 100));
  assert.equal(guanzhi.done, 1);
  // 藏書閣：總答題量 = 10+10+10+120 = 150，cap 300 → 50%
  assert.equal(cangshu.done, 150);
  assert.equal(cangshu.pct, 50);
  assert.equal(cangshu.tierName, '漸盛'); // 50 落在 30~60 → tier 2
});

test('flourishTier 門檻 0/10/30/60/100', () => {
  assert.equal(CT.flourishTier(0), 0);
  assert.equal(CT.flourishTier(9), 0);
  assert.equal(CT.flourishTier(10), 1);
  assert.equal(CT.flourishTier(29), 1);
  assert.equal(CT.flourishTier(30), 2);
  assert.equal(CT.flourishTier(60), 3);
  assert.equal(CT.flourishTier(100), 4);
  assert.equal(CT.FLOURISH_TIERS.length, 5);
});

test('文氣十境：以目前題庫篇數為分母，不寫死舊版 27 篇', () => {
  assert.equal(CT.gateStage(TEXTS, progressOf({})).stage, 0);
  const p4 = progressOf({ t01: M, t02: M, t05: M, t06: M });
  const g = CT.gateStage(TEXTS, p4);
  assert.equal(g.masteredCount, 4);
  assert.equal(g.totalTexts, TEXTS.length);
  assert.equal(g.stage, 1);
  assert.equal(g.total, 10);
  assert.equal(g.name, CT.GATE_STAGES[1]);
});

test('精通掛軸清單：只列已精通篇、帶篇名與作者', () => {
  const prog = progressOf({ t10: M, t08: M, t99nope: NM, t02: NM });
  const list = CT.scrolls(TEXTS, prog);
  const ids = list.map((s) => s.id).sort();
  assert.deepEqual(ids, ['t08', 't10']);
  const louShi = list.find((s) => s.id === 't10');
  assert.equal(louShi.title, '陋室銘');
  assert.equal(louShi.author, '劉禹錫');
});

test('名句池只含已精通篇，且每句都是原文子字串（不捏造）', () => {
  const prog = progressOf({ t10: M, t01: M, t18: NM }); // t18 未精通不得入池
  const pool = CT.quotePool(TEXTS, prog);
  const poolTextIds = new Set(pool.map((q) => q.textId));
  assert.ok(poolTextIds.has('t10'));
  assert.ok(poolTextIds.has('t01'));
  assert.ok(!poolTextIds.has('t18')); // 鎖死：未精通就沒有名句
  // 每句必為原文子字串
  const byId = Object.fromEntries(TEXTS.map((t) => [t.id, t.passage || (t.segments || []).map((s) => s.text).join('')]));
  for (const q of pool) {
    assert.ok(byId[q.textId].includes(q.text), `名句非原文：${q.textId} ${q.text}`);
  }
  // 陋室銘應含代表句
  assert.ok(pool.some((q) => q.textId === 't10' && q.text.includes('斯是陋室')));
});

test('裝飾數量需同時滿足真實答對量與精通篇數上限', () => {
  // 只精通 1 篇，即使答對很多，各類裝飾上限仍只解鎖 1 件。
  const prog = progressOf({ t01: [100, 120] });
  const counts = CT.decorCounts(TEXTS, prog);
  assert.equal(counts.bamboo, 1);
  assert.equal(counts.lotus, 1);
  assert.equal(counts.pine, 1);
  assert.equal(counts.koi, 1);
  assert.equal(counts.crane, 0);   // 限定仙鶴不靠答題量／精通篇，未購入即 0
  // 沒有精通篇，純刷答題量不得長出裝飾。
  const none = CT.decorCounts(TEXTS, progressOf({ t01: [7, 100] }));
  assert.deepEqual(none, { bamboo: 0, lotus: 0, pine: 0, koi: 0, crane: 0 });
  // decorations 產生對應件數＋預設座標在界內
  const ds = CT.decorations(TEXTS, prog, CT.defaultState());
  assert.equal(ds.filter((d) => d.kind === 'bamboo').length, 1);
  for (const d of ds) {
    assert.ok(d.x >= 4 && d.x <= 96 && d.y >= 4 && d.y <= 96);
  }
});

test('限定仙鶴：由市集購入數解鎖，封頂 4 隻，不受答題量影響', () => {
  // 一篇未精通、狂刷答題量，仙鶴仍需真的「購入」才長出來。
  const p0 = progressOf({ t01: [7, 100] });
  assert.equal(CT.decorCounts(TEXTS, p0).crane, 0);
  // 購入 2 次 → 2 隻仙鶴
  const p2 = { ...progressOf({ t01: [7, 100] }), caotangDecorPurchases: 2 };
  assert.equal(CT.decorCounts(TEXTS, p2).crane, 2);
  const cranes = CT.decorations(TEXTS, p2, CT.defaultState()).filter((d) => d.kind === 'crane');
  assert.equal(cranes.length, 2);
  // 買超過上限仍封頂 4
  const p9 = { ...progressOf({ t01: [7, 100] }), caotangDecorPurchases: 9 };
  assert.equal(CT.decorCounts(TEXTS, p9).crane, 4);
});

test('自由擺放：寫入座標並夾界；非法 id/座標擋下；還原清空', () => {
  const s = CT.defaultState();
  assert.equal(CT.placeDecoration(s, 'bamboo-0', 120, -9).ok, true);
  assert.deepEqual(s.placements['bamboo-0'], { x: 96, y: 4 });
  assert.equal(CT.placeDecoration(s, 'ghost-0', 10, 10).ok, false);
  assert.equal(CT.placeDecoration(s, 'bamboo-1', NaN, 10).ok, false);
  CT.resetPlacements(s);
  assert.deepEqual(s.placements, {});
});

test('匾額／對聯：只能選名句池的句子（鎖死學習量）', () => {
  const prog = progressOf({ t10: M });
  const pool = CT.quotePool(TEXTS, prog);
  const s = CT.defaultState();
  // 合法：選池中的句
  assert.equal(CT.setPlaque(s, TEXTS, prog, pool[0].id).ok, true);
  assert.equal(CT.getPlaque(s, TEXTS, prog).text, pool[0].text);
  // 非法：偽造的名句 id
  assert.equal(CT.setPlaque(s, TEXTS, prog, 't18#0').ok, false);
  // 對聯：兩句都要在池中且不可同句
  assert.equal(CT.setCouplet(s, TEXTS, prog, pool[0].id, pool[0].id).ok, false);
  if (pool.length >= 2) {
    assert.equal(CT.setCouplet(s, TEXTS, prog, pool[0].id, pool[1].id).ok, true);
    const c = CT.getCouplet(s, TEXTS, prog);
    assert.equal(c.up.text, pool[0].text);
    assert.equal(c.down.text, pool[1].text);
  }
  // 未精通篇的句子做上聯 → 擋下
  assert.equal(CT.setCouplet(s, TEXTS, prog, 't01#0', pool[0].id).ok, false);
});

test('慶典佇列：升境與院落升級各一次；seed 靜默入帳；markCelebrated 去重', () => {
  const prog = progressOf({ t01: M, t02: M, t05: M, t06: M }); // 34 篇題庫需 4 篇進 stage 1
  const s = CT.defaultState();
  let pend = CT.pendingCelebrations(TEXTS, prog, s);
  assert.ok(pend.some((p) => p.id === 'gate-1'));
  CT.markCelebrated(s, 'gate-1');
  CT.markCelebrated(s, 'gate-1');
  assert.equal(s.celebrated.filter((x) => x === 'gate-1').length, 1);
  // seed 後全清、無待辦
  const s2 = CT.defaultState();
  CT.seedCelebrated(TEXTS, prog, s2);
  assert.equal(s2.seeded, true);
  assert.deepEqual(CT.pendingCelebrations(TEXTS, prog, s2), []);
});

test('getView 一次拿齊整包視圖', () => {
  const prog = progressOf({ t10: M });
  const v = CT.getView(TEXTS, prog, CT.defaultState(), { days: 3 });
  assert.equal(v.gate.total, 10);
  assert.equal(v.gate.totalTexts, TEXTS.length);
  assert.equal(v.achievements.find((a) => a.id === 'all-scrolls').need, TEXTS.length);
  assert.match(v.achievements.find((a) => a.id === 'all-scrolls').desc, new RegExp(String(TEXTS.length)));
  assert.equal(v.courtyards.length, 3);
  assert.ok(Array.isArray(v.scrolls));
  assert.ok(Array.isArray(v.decorations));
  assert.ok(Array.isArray(v.quotePool));
  assert.equal(v.achievements.find((a) => a.id === 'first-scroll').unlocked, true);
});
