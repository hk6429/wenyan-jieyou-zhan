// 文房市集前端邏輯層測試。js/market-store.js 是瀏覽器 classic <script>（IIFE 全域），以 vm 載入讀 module.exports。
// 另 import 後端 market.js 做「前後端規則同步」交叉驗證：道具白名單、tierOf、價格帶、開市時窗兩份必須一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../functions/api/market.js';

// 在本測試 realm 內執行（用 Function 而非 vm.createContext），避免跨 realm 造成 deepEqual 對陣列/物件
// 因 prototype 不同而誤判 not-reference-equal。localStorage/window 以參數傳 undefined → 走 store 的 guard。
function loadStore() {
  const code = readFileSync(new URL('../js/market-store.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'window', 'localStorage', `${code}\nreturn module.exports;`)(mod, undefined, undefined);
  return mod.exports;
}
const M = loadStore();
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

test('前後端規則同步：道具白名單 id→price 完全一致（防雙表漂移）', () => {
  const front = Object.fromEntries(M.GEAR.map((g) => [g.id, g.price]));
  assert.equal(M.GEAR.length, 12);
  assert.deepEqual(front, api.GEAR_WHITELIST);
});
test('前後端規則同步：tierOf / PRICE_BAND / isMarketOpen / weekKey 交叉一致', () => {
  for (const id of ['bi_tu', 'yan_she', 'mo_long', 'nope', 'yinyi']) assert.equal(M.tierOf(id), api.tierOf(id));
  for (const ts of [Date.UTC(2026, 6, 24, 7, 59), Date.UTC(2026, 6, 24, 8, 0), Date.UTC(2026, 6, 26, 15, 59), Date.UTC(2026, 6, 26, 16, 0), Date.UTC(2026, 6, 22, 4, 0)]) {
    assert.equal(M.isMarketOpen(ts), api.isMarketOpen(ts));
    assert.equal(M.weekKey(ts), api.weekKey(ts));
  }
  assert.deepEqual(M.bandOf('yan_duan'), api.PRICE_BAND.zhen);
  assert.deepEqual(M.PRICE_BAND, api.PRICE_BAND);
});

test('sellableGear 只列已擁有；removeOwned 同步清 loadout；addOwned 擋未知 id', () => {
  M.setStorageBackend(memStorage());
  M.saveGear({ owned: ['bi_tu', 'yan_duan'], loadout: ['bi_tu'] });
  assert.deepEqual(M.sellableGear().map((g) => g.id), ['bi_tu', 'yan_duan']);
  assert.equal(M.sellableGear()[0].tierLabel, '凡品');
  assert.equal(M.removeOwned('bi_tu').ok, true);
  assert.deepEqual(M.loadGear().owned, ['yan_duan']);
  assert.deepEqual(M.loadGear().loadout, []); // 移除最後一件同款 → 退出 loadout
  assert.equal(M.addOwned('不存在').ok, false);
  assert.equal(M.addOwned('mo_hui').ok, true);
});

test('裝備上限與加成：筆/硯→傷害、墨/紙→墨錠掉落，封頂防濫用', () => {
  M.setStorageBackend(memStorage());
  M.saveGear({ owned: ['bi_zi', 'yan_duan', 'mo_long', 'zhi_cheng', 'bi_tu'], loadout: [] });
  // 珍品筆 +3、珍品硯 +3 → damageBonus 6
  M.toggleEquip('bi_zi'); M.toggleEquip('yan_duan');
  assert.deepEqual(M.activeGearMods(), { damageBonus: 6, inkDropBonus: 0 });
  // 已滿 4 件前，加兩件墨/紙 → inkDropBonus 0.15+0.15=0.3
  M.toggleEquip('mo_long'); M.toggleEquip('zhi_cheng');
  assert.equal(M.activeGearMods().inkDropBonus, 0.3);
  // 第 5 件被 EQUIP_MAX 擋
  assert.equal(M.toggleEquip('bi_tu').reason, 'full');
});

test('rollDrop：機率為 0 不掉、為 1 必掉且回合法 gearId；mastery 不掉珍品', () => {
  assert.equal(M.rollDrop({ event: 'battleWin', rng: () => 0.99 }), null); // 高 rng → 不觸發
  const g = M.rollDrop({ event: 'battleWin', combo: 0, rng: () => 0 });    // rng=0 必觸發、選第一階第一件
  assert.ok(M.GEAR_BY_ID[g]);
  // mastery 權重無珍品：掃多個 rng 種子都不該掉珍品
  for (let i = 0; i < 20; i++) {
    const seed = i / 20;
    const d = M.rollDrop({ event: 'mastery', rng: () => seed });
    if (d) assert.notEqual(M.tierOf(d), 'zhen');
  }
});

test('claims / buysToday / everOwned 持久化（注入 storage）', () => {
  M.setStorageBackend(memStorage());
  assert.deepEqual(M.getClaims(), []);
  M.addClaim({ id: 'x1', claimKey: 'k', gearId: 'bi_tu', price: 50 });
  assert.equal(M.getClaims().length, 1);
  M.removeClaim('x1');
  assert.deepEqual(M.getClaims(), []);
  const t = Date.UTC(2026, 6, 25, 4, 0);
  assert.equal(M.buysToday(t), 0);
  M.bumpBuys(t); M.bumpBuys(t);
  assert.equal(M.buysToday(t), 2);
  assert.equal(M.buysToday(t + 86400 * 1000), 0); // 跨日歸零
  M.recordEverOwned({ gearId: 'bi_tu', dir: 'sold', peer: '小華', ts: t });
  assert.equal(M.getEverOwned()[0].dir, 'sold');
  assert.equal(M.THANKS_CARDS.length, 6);
  assert.equal(M.DAILY_BUY_CAP, 3);
});

test('getNick/setNick：裁切 12 字、空字串不覆寫', () => {
  M.setStorageBackend(memStorage());
  assert.equal(M.getNick(), '');
  assert.equal(M.setNick('  阿明  '), '阿明');
  assert.equal(M.getNick(), '阿明');
  assert.equal(M.setNick(''), '');
  assert.equal(M.getNick(), '阿明'); // 空字串不覆寫既有
});
