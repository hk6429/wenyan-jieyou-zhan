// 文房市集後端純邏輯＋marketOp 記帳測試。用既有 helpers/fake-d1（真 schema.sql）造 D1，經 kvFor 走真實 shim。
// 簽章密鑰與時鐘全注入（ctx.secret / nowMs），不依賴真實時鐘或環境變數 → 可重現。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fake-d1.mjs';
import { kvFor } from '../functions/api/_kv.js';
import {
  GEAR_WHITELIST, tierOf, validPrice, isMarketOpen, weekKey, okNick, okClass, sigOf, memberOf, marketOp, PRICE_BAND,
} from '../functions/api/market.js';

const redis = () => kvFor(createFakeD1());
const ENV = { secret: 'test-secret', forceOpen: true };
const OPEN_TS = Date.UTC(2026, 6, 25, 4, 0); // 週六，開市中

// —— 純邏輯 ——
test('tierOf：80→fan、150→liang、300→zhen；文豪/文魄/未知 id 一律 null', () => {
  assert.equal(tierOf('bi_tu'), 'fan');
  assert.equal(tierOf('yan_she'), 'liang');
  assert.equal(tierOf('mo_long'), 'zhen');
  assert.equal(tierOf('yinyi'), null);   // 文魄 id 不在白名單
  assert.equal(tierOf('t08'), null);     // 文豪選文 id 不可交易
  assert.equal(tierOf(''), null);
  assert.equal(tierOf(null), null);
});
test('GEAR_WHITELIST：12 件、皆為 80/150/300', () => {
  assert.equal(Object.keys(GEAR_WHITELIST).length, 12);
  for (const v of Object.values(GEAR_WHITELIST)) assert.ok([80, 150, 300].includes(v));
});
test('validPrice：整數且落在該階價格帶', () => {
  assert.equal(validPrice('bi_tu', 40), true);
  assert.equal(validPrice('bi_tu', 120), true);
  assert.equal(validPrice('bi_tu', 39), false);
  assert.equal(validPrice('bi_tu', 121), false);
  assert.equal(validPrice('bi_tu', 50.5), false);
  assert.equal(validPrice('yan_duan', 450), true);
  assert.equal(validPrice('nope', 100), false);
});
test('isMarketOpen：UTC+8 週五16:00 起、週日24:00 止', () => {
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 7, 59)), false); // 週五 15:59
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 8, 0)), true);   // 週五 16:00
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 25, 4, 0)), true);   // 週六中午
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 26, 15, 59)), true); // 週日 23:59
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 26, 16, 0)), false); // 週一 00:00
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 22, 4, 0)), false);  // 週三
});
test('weekKey：同一開市週末落同桶、跨週不同桶', () => {
  assert.equal(weekKey(Date.UTC(2026, 6, 24, 9, 0)), weekKey(Date.UTC(2026, 6, 26, 12, 0)));
  assert.notEqual(weekKey(Date.UTC(2026, 6, 24, 9, 0)), weekKey(Date.UTC(2026, 6, 31, 9, 0)));
});
test('okNick / okClass：驗證與注入防禦', () => {
  assert.equal(okNick('小明'), true);
  assert.equal(okNick(''), false);
  assert.equal(okNick('a'.repeat(13)), false);
  assert.equal(okNick('<img>'), false);
  assert.equal(okNick('笨蛋'), false);
  assert.equal(okClass('ABCD1'), true);      // 4~8 英數大寫
  assert.equal(okClass('AB'), false);
  assert.equal(okClass('七年三班'), false);   // 非英數
  assert.equal(okClass('a;DROP'), false);
});
test('sigOf：同 payload 同 secret 穩定；欄位或密鑰變動即不同', () => {
  const p = { gearId: 'bi_tu', price: 50, seller: '小明', id: 'abc123' };
  assert.equal(sigOf(p, 's1'), sigOf({ ...p }, 's1'));
  assert.equal(sigOf(p, 's1').length, 24);
  assert.notEqual(sigOf(p, 's1'), sigOf({ ...p, price: 51 }, 's1'));
  assert.notEqual(sigOf(p, 's1'), sigOf(p, 's2'));
});

// —— post / list ——
test('post：合法上架回 id+claimKey，list 查得到', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal(a.ok, 1);
  assert.equal(typeof a.id, 'string');
  assert.equal(typeof a.claimKey, 'string');
  const l = await marketOp(r, { op: 'list', classCode: 'DEMO', scope: 'class' }, ENV, OPEN_TS);
  assert.equal(l.list.length, 1);
  assert.equal(l.list[0].gearId, 'bi_tu');
  assert.equal(l.list[0].price, 50);
});

test('post：掛單憑證不自動過期，未售出道具可在任何時間下架拿回', async () => {
  const db = createFakeD1();
  const r = kvFor(db);
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  const exp = await db.prepare('SELECT exp FROM kv WHERE k=?1').bind(`wy_mkt:item:${a.id}`).first('exp');
  assert.equal(exp, null);
  const c = await marketOp(r, { op: 'cancel', id: a.id, claimKey: a.claimKey }, { ...ENV, forceOpen: false }, OPEN_TS + 60 * 86400 * 1000);
  assert.equal(c.ok, 1);
  assert.equal(c.gearId, 'bi_tu');
});
test('post：文魄/文豪、價格出帶、髒話暱稱、非開市全拒', async () => {
  const r = redis();
  assert.equal((await marketOp(r, { op: 'post', gearId: 'yinyi', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 0);
  assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 999, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 0);
  assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '笨蛋', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 0);
  const closed = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
  assert.equal(closed.ok, 0);
  assert.match(closed.error, /開市/);
});
test('post：同賣家同時最多 3 筆', async () => {
  const r = redis();
  for (let i = 0; i < 3; i++) assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 1);
  const d = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal(d.ok, 0);
  assert.match(d.error, /3/);
});

// —— buy ——
test('buy：合法購買回 gearId+price；掛單從 list 消失；買家/小卡入檔', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  const b = await marketOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'DEMO', cardId: 3 }, ENV, OPEN_TS);
  assert.equal(b.ok, 1);
  assert.equal(b.gearId, 'bi_tu');
  assert.equal(b.price, 50);
  const l = await marketOp(r, { op: 'list', classCode: 'DEMO', scope: 'class' }, ENV, OPEN_TS);
  assert.equal(l.list.length, 0);
  const rec = JSON.parse(await r.get(`wy_mkt:item:${a.id}`));
  assert.equal(rec.sold, 1); assert.equal(rec.buyer, '小華'); assert.equal(rec.card, 3);
});
test('buy：不能買自己的、簽章竄改、非開市全拒', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal((await marketOp(r, { op: 'buy', id: a.id, nick: '小明', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 0);
  const rec = JSON.parse(await r.get(`wy_mkt:item:${a.id}`)); rec.price = 1; // 竄改價格 → 簽章失效
  await r.set(`wy_mkt:item:${a.id}`, JSON.stringify(rec));
  assert.match((await marketOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'DEMO' }, ENV, OPEN_TS)).error, /簽章/);
});
test('buy：每日限購 3 件伺服器硬擋；失敗的購買不燒配額', async () => {
  const r = redis();
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: `賣家${i}`, classCode: 'DEMO' }, ENV, OPEN_TS)).id);
  await marketOp(r, { op: 'buy', id: 'no-such-id', nick: '小華', classCode: 'DEMO' }, ENV, OPEN_TS); // 失敗不計
  for (let i = 0; i < 3; i++) assert.equal((await marketOp(r, { op: 'buy', id: ids[i], nick: '小華', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 1);
  const d = await marketOp(r, { op: 'buy', id: ids[3], nick: '小華', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal(d.ok, 0);
  assert.match(d.error, /限購/);
});

// —— cancel / claim ——
test('cancel：憑 claimKey 下架；錯 claimKey 拒；售出後不可下架', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'yan_she', price: 100, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal((await marketOp(r, { op: 'cancel', id: a.id, claimKey: 'wrong' }, ENV, OPEN_TS)).ok, 0);
  const c = await marketOp(r, { op: 'cancel', id: a.id, claimKey: a.claimKey }, ENV, OPEN_TS);
  assert.equal(c.ok, 1); assert.equal(c.gearId, 'yan_she');
  assert.equal((await marketOp(r, { op: 'list', classCode: 'DEMO', scope: 'class' }, ENV, OPEN_TS)).list.length, 0);
});
test('claim：售出後領款＝floor(price*0.9)、附買家與小卡；重複領拒；未售出回 sold:0；全週可用', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'yan_duan', price: 333, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal((await marketOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey }, ENV, OPEN_TS)).sold, 0);
  await marketOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'DEMO', cardId: 5 }, ENV, OPEN_TS);
  // 非開市時段也能領款（善後）
  const k = await marketOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
  assert.equal(k.ok, 1);
  assert.equal(k.pearls, 299);  // floor(333*0.9)
  assert.equal(k.buyer, '小華');
  assert.equal(k.card, 5);
  assert.match((await marketOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey }, ENV, OPEN_TS)).error, /領過/);
});

// —— 保留單（同班名單）／珍品週限量／集市達人 ——
test('post+reserveFor：同班名單內放行；名單外、留給自己全拒', async () => {
  const r = redis();
  const ROSTER = { ...ENV, roster: new Set(['小華', '小美']) };
  assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO', reserveFor: '小華' }, ROSTER, OPEN_TS)).ok, 1);
  assert.match((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO', reserveFor: '陌生人' }, ROSTER, OPEN_TS)).error, /同班/);
  assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO', reserveFor: '小明' }, ROSTER, OPEN_TS)).ok, 0);
});
test('保留單：只有被指定同學買得走', async () => {
  const r = redis();
  const ROSTER = { ...ENV, roster: new Set(['小華', '小美']) };
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO', reserveFor: '小華' }, ROSTER, OPEN_TS);
  assert.match((await marketOp(r, { op: 'buy', id: a.id, nick: '小美', classCode: 'DEMO' }, ROSTER, OPEN_TS)).error, /保留/);
  assert.equal((await marketOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'DEMO' }, ROSTER, OPEN_TS)).ok, 1);
});
test('roster hash 自動登記：賣家上架後成為同班已知暱稱，可被指定為保留對象', async () => {
  const r = redis();
  // 不注入 ctx.roster → 走真實 wy_mkt:roster hash（fail-closed）
  await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '阿丁', classCode: 'DEMO' }, ENV, OPEN_TS);
  const ok = await marketOp(r, { op: 'post', gearId: 'bi_hu', price: 100, seller: '阿甲', classCode: 'DEMO', reserveFor: '阿丁' }, ENV, OPEN_TS);
  assert.equal(ok.ok, 1);
  const no = await marketOp(r, { op: 'post', gearId: 'bi_hu', price: 100, seller: '阿甲', classCode: 'DEMO', reserveFor: '路人' }, ENV, OPEN_TS);
  assert.equal(no.ok, 0);
});
test('珍品每週限量：第 11 件拒收，凡品不受限', async () => {
  const r = redis();
  for (let i = 0; i < 10; i++) assert.equal((await marketOp(r, { op: 'post', gearId: 'yan_duan', price: 200, seller: `賣${i}`, classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 1);
  assert.match((await marketOp(r, { op: 'post', gearId: 'yan_duan', price: 200, seller: '新賣家', classCode: 'DEMO' }, ENV, OPEN_TS)).error, /限量/);
  assert.equal((await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '新賣家', classCode: 'DEMO' }, ENV, OPEN_TS)).ok, 1);
});
test('stars：成交後買賣雙方各 +1，排行由高到低', async () => {
  const r = redis();
  const a = await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '小明', classCode: 'DEMO' }, ENV, OPEN_TS);
  await marketOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'DEMO' }, ENV, OPEN_TS);
  const s = await marketOp(r, { op: 'stars', classCode: 'DEMO' }, ENV, OPEN_TS);
  assert.equal(s.ok, 1);
  assert.deepEqual(s.top.map((x) => x.deals), [1, 1]);
  assert.deepEqual(new Set(s.top.map((x) => x.name)), new Set(['小明', '小華']));
});

// —— 全站公開 opt-in 隔離 ——
test('班級隔離：預設不進 pub；opt-in pub 才跨班可見/可買', async () => {
  const r = redis();
  await marketOp(r, { op: 'post', gearId: 'bi_tu', price: 50, seller: '甲', classCode: 'AAAA' }, ENV, OPEN_TS);
  const pub0 = await marketOp(r, { op: 'list', scope: 'pub' }, ENV, OPEN_TS);
  assert.equal(pub0.list.length, 0);
  const a = await marketOp(r, { op: 'post', gearId: 'bi_hu', price: 100, seller: '乙', classCode: 'AAAA', pub: 1 }, ENV, OPEN_TS);
  const pub1 = await marketOp(r, { op: 'list', scope: 'pub' }, ENV, OPEN_TS);
  assert.equal(pub1.list.length, 1);
  // 別班同學靠 pub 買得到
  assert.equal((await marketOp(r, { op: 'buy', id: a.id, nick: '丙', classCode: 'BBBB' }, ENV, OPEN_TS)).ok, 1);
});
