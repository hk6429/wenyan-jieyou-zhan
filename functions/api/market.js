// 文房市集後端 — 學生間掛單交易（只交易文房四寶道具：筆／墨／紙／硯；文豪與文魄一律不可交易）。
// 機制移植自字字珠璣翰墨集市，改 zz→wy 命名與資料形狀：貨幣＝墨錠、班級碼＝WYStore.getClassCode()（4~8 英數）。
// 防作弊：白名單驗貨＋HMAC 整筆簽章（env.WY_HMAC_SECRET）＋IP 限流；D1 key 一律 wy_mkt: 前綴。
// 業務邏輯抽成可注入純函式 marketOp(redis, body, ctx, nowMs)，onRequestPost 只做 wiring（secret／時鐘可注入 → 測試可重現）。
import { createHmac, randomBytes } from 'node:crypto';
import { kvFor } from './_kv.js';

// —— 商品白名單（12 件：筆／墨／紙／硯 × 凡品／良品／珍品）——
// 神獸沒有；文豪、文魄不在此表＝伺服器一律拒收。與前端 js/market-store.js 的 GEAR 同步，
// test/market-store.test.mjs 交叉驗證 id→price 兩表一致，改一邊必改另一邊。
export const GEAR_WHITELIST = {
  bi_tu: 80, bi_hu: 150, bi_zi: 300,       // 兔毫筆／湖筆／紫毫筆
  mo_song: 80, mo_hui: 150, mo_long: 300,  // 松煙墨／徽墨／龍香墨
  zhi_zhu: 80, zhi_xuan: 150, zhi_cheng: 300, // 竹紙／宣紙／澄心堂紙
  yan_tao: 80, yan_she: 150, yan_duan: 300,   // 陶硯／歙硯／端硯
};
export const TIER_OF_PRICE = { 80: 'fan', 150: 'liang', 300: 'zhen' };
export const TIER_LABEL = { fan: '凡品', liang: '良品', zhen: '珍品' };
// 價格帶＝原價 ×0.5 ～ ×1.5（透明規則，前後端同一張表，規則頁原文照列；無隱藏折扣／殺價）
export const PRICE_BAND = { fan: [40, 120], liang: [75, 225], zhen: [150, 450] };

export function tierOf(gearId) {
  const base = GEAR_WHITELIST[gearId];
  return base ? TIER_OF_PRICE[base] : null; // 非白名單（文豪/文魄/雜項）一律 null
}
export function validPrice(gearId, price) {
  const tier = tierOf(gearId);
  if (!tier || !Number.isInteger(price)) return false;
  const [lo, hi] = PRICE_BAND[tier];
  return price >= lo && price <= hi;
}

// 台灣時區固定 UTC+8（無日光節約）：每週五 16:00 起至週日 24:00（＝週一 00:00 前）限時開市。
// post／buy 受限；list／cancel／claim／stars 全週可用（平日只能瀏覽、賣家可善後領款）。
export function isMarketOpen(nowMs = Date.now()) {
  const t = new Date(nowMs + 8 * 3600 * 1000); // 位移後以 UTC getter 讀台灣牆鐘
  const day = t.getUTCDay(), hh = t.getUTCHours();
  if (day === 6 || day === 0) return true;      // 週六、週日整天
  return day === 5 && hh >= 16;                 // 週五 16:00 起
}
// 珍品限量的週桶：以該開市週末的「週五」日期為桶名，五六日共用同桶
export function weekKey(nowMs = Date.now()) {
  const t = new Date(nowMs + 8 * 3600 * 1000);
  const day = t.getUTCDay();
  const back = day === 5 ? 0 : day === 6 ? 1 : day === 0 ? 2 : (day + 2) % 7; // 回推到本檔期週五
  const fri = new Date(t.getTime() - back * 86400 * 1000);
  return fri.toISOString().slice(0, 10);
}

// 暱稱過濾沿用字鬥英雄／擂台的 BAD_WORDS 清單（非窮舉）；暱稱會顯示在掛單卡與達人榜。
const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|王八蛋|三小|幹你|靠北|媽的|滾蛋|垃圾|腦殘|廢咖|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
export function okNick(n) {
  return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n) && !BAD_WORDS.test(n);
}
// 班級碼＝WYStore.setClassCode 正規化後的 4~8 英數大寫（與 js/store.js 一致）
export function okClass(c) {
  return typeof c === 'string' && /^[A-Z0-9]{4,8}$/.test(c);
}
// 整筆掛單簽章：固定欄序 { gearId, price, seller, id }，取 HMAC-SHA256 前 24 碼。
export function sigOf(p, secret) {
  const canon = JSON.stringify({ gearId: p.gearId, price: p.price, seller: p.seller, id: p.id });
  return createHmac('sha256', secret).update(canon).digest('hex').slice(0, 24);
}

// —— D1 key（全 wy_mkt: 前綴）——
const ITEM = (id) => `wy_mkt:item:${id}`;
const ZCLASS = (c) => `wy_mkt:z:c:${c}`;
const ZPUB = 'wy_mkt:z:pub';
const ROSTER = (c) => `wy_mkt:roster:${c}`;     // 同班已知暱稱（保留單驗證用；hash nick→'1'）
const DEALS = (c) => `wy_mkt:deals:${c}`;        // 集市達人成交量 zset
const ITEM_TTL = 7 * 86400;
const MAX_LISTINGS = 3;   // 同賣家同時最多 3 筆
const DAILY_BUY_CAP = 3;  // 買家每日限購 3 件
const RARE_WEEK_CAP = 10; // 珍品每班每週限量 10 件
const TAX = 0.1;          // 成交抽 10% 稅（墨錠回收）

// zset member 標準序列化：固定欄序，post/buy/cancel 三處共用，zrem 才對得起來（vocab-duel 血淚教訓）
export const memberOf = (rec) => JSON.stringify({
  id: rec.id, gearId: rec.gearId, seller: rec.seller, price: rec.price, ts: rec.ts,
  reserved: rec.reserveFor ? 1 : 0, pub: rec.pub ? 1 : 0,
});
const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };
const dayStr = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10); // 台灣日界線

// 同班名單：測試注入 ctx.roster（Set），正式站查 wy_mkt:roster 這個班的 hash（fail-closed）
async function inRoster(redis, ctx, cc, name) {
  if (ctx.roster) return ctx.roster.has(name);
  const v = await redis.hget(ROSTER(cc), name);
  return v != null;
}
async function touchRoster(redis, ctx, cc, name) {
  if (ctx.roster) { ctx.roster.add(name); return; }
  await redis.hset(ROSTER(cc), { [name]: '1' });
}

export async function marketOp(redis, body, ctx, nowMs = Date.now()) {
  const { op } = body || {};
  const open = ctx.forceOpen || isMarketOpen(nowMs);

  if (op === 'list') {
    const scope = body.scope === 'pub' ? 'pub' : 'class';
    if (scope === 'class' && !okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
    const raw = await redis.zrange(scope === 'pub' ? ZPUB : ZCLASS(body.classCode), 0, 49);
    return { ok: 1, list: raw.map(parse).filter(Boolean) };
  }

  if (op === 'post') {
    if (!open) return { ok: 0, error: '集市尚未開市（每週五 16:00 至週日夜間）' };
    const { gearId, seller, classCode } = body;
    const price = Math.round(Number(body.price) || 0);
    if (!tierOf(gearId)) return { ok: 0, error: '這件不在集市可交易清單（文豪與文魄是師友，不是商品）' };
    if (!validPrice(gearId, price)) { const [lo, hi] = PRICE_BAND[tierOf(gearId)]; return { ok: 0, error: `${TIER_LABEL[tierOf(gearId)]}定價要在 ${lo}–${hi} 墨錠` }; }
    if (!okNick(seller)) return { ok: 0, error: '暱稱不合法' };
    if (!okClass(classCode)) return { ok: 0, error: '請先設定班級代碼' };
    const sellerNick = seller.trim();
    const mine = (await redis.zrange(ZCLASS(classCode), 0, 199)).map(parse).filter((x) => x && x.seller === sellerNick);
    if (mine.length >= MAX_LISTINGS) return { ok: 0, error: `最多同時掛 ${MAX_LISTINGS} 筆` };

    // 保留單：對象必須是同班已知暱稱（曾在本班集市留過名），非自由指定陌生人
    let reserveFor = '';
    if (body.reserveFor != null && String(body.reserveFor).trim()) {
      reserveFor = String(body.reserveFor).trim().slice(0, 12);
      if (!okNick(reserveFor) || reserveFor === sellerNick) return { ok: 0, error: '保留對象暱稱不合法' };
      if (!(await inRoster(redis, ctx, classCode, reserveFor))) return { ok: 0, error: '保留對象必須是同班同學的暱稱（對方要先在集市交易過一次）' };
    }
    // 珍品每週限量（所有其他驗證通過後最後一關才 incr）
    if (tierOf(gearId) === 'zhen') {
      const n = await redis.incr(`wy_mkt:rare:${classCode}:${weekKey(nowMs)}`, 8 * 86400);
      if (n > RARE_WEEK_CAP) return { ok: 0, error: `本班珍品週限量 ${RARE_WEEK_CAP} 件已滿，下週開市再來` };
    }

    const id = randomBytes(6).toString('hex');
    const claimKey = randomBytes(12).toString('hex');
    const rec = { id, gearId, seller: sellerNick, price, ts: nowMs, classCode, pub: body.pub ? 1 : 0, reserveFor };
    const sig = sigOf({ gearId, price, seller: sellerNick, id }, ctx.secret);
    await redis.set(ITEM(id), JSON.stringify({ ...rec, claimKey, sig, sold: 0, claimed: 0, card: 0 }), { ex: ITEM_TTL });
    await redis.zadd(ZCLASS(classCode), { score: price, member: memberOf(rec) });
    if (rec.pub) await redis.zadd(ZPUB, { score: price, member: memberOf(rec) });
    await touchRoster(redis, ctx, classCode, sellerNick); // 賣家登記進同班名單
    return { ok: 1, id, claimKey };
  }

  if (op === 'buy') {
    if (!open) return { ok: 0, error: '集市尚未開市（每週五 16:00 至週日夜間）' };
    const { id, nick, classCode } = body;
    if (typeof id !== 'string' || !okNick(nick) || !okClass(classCode)) return { ok: 0, error: '參數不合法' };
    const rec = parse(await redis.get(ITEM(id)));
    if (!rec || rec.sold) return { ok: 0, error: '這件已被買走或下架了' };
    const buyerNick = nick.trim();
    if (rec.seller === buyerNick) return { ok: 0, error: '不能買自己的掛單' };
    if (rec.classCode !== classCode && !rec.pub) return { ok: 0, error: '這是別班集市的掛單' };
    if (rec.reserveFor && rec.reserveFor !== buyerNick) return { ok: 0, error: `這是保留給 ${rec.reserveFor} 的` };
    if (sigOf({ gearId: rec.gearId, price: rec.price, seller: rec.seller, id: rec.id }, ctx.secret) !== rec.sig) return { ok: 0, error: '簽章不符，掛單作廢' };
    // 每日限購伺服器硬擋（失敗的購買在此之前就 return，不燒配額——白帽原則）
    const buys = await redis.incr(`wy_mkt:buys:${buyerNick}:${dayStr(nowMs)}`, 86400);
    if (buys > DAILY_BUY_CAP) return { ok: 0, error: '每日限購 3 件（保護自己練功的樂趣）' };
    const cardId = Number.isInteger(body.cardId) && body.cardId >= 1 && body.cardId <= 6 ? body.cardId : 0;
    // 先 zrem（用未售出時的欄位值）再改 rec 狀態
    await redis.zrem(ZCLASS(rec.classCode), memberOf(rec));
    if (rec.pub) await redis.zrem(ZPUB, memberOf(rec));
    rec.sold = 1; rec.soldTs = nowMs; rec.buyer = buyerNick; rec.card = cardId;
    await redis.set(ITEM(id), JSON.stringify(rec), { ex: ITEM_TTL });
    // 集市達人：買賣雙方各 +1 成交量（鼓勵流通，不偏袒囤貨）
    await redis.zincrby(DEALS(rec.classCode), 1, rec.seller);
    await redis.zincrby(DEALS(rec.classCode), 1, buyerNick);
    await touchRoster(redis, ctx, classCode, buyerNick); // 買家登記進同班名單
    return { ok: 1, gearId: rec.gearId, price: rec.price };
  }

  if (op === 'cancel') {
    const rec = parse(await redis.get(ITEM(body.id)));
    if (!rec || rec.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (rec.sold) return { ok: 0, error: '已售出，請領貨款' };
    await redis.zrem(ZCLASS(rec.classCode), memberOf(rec));
    if (rec.pub) await redis.zrem(ZPUB, memberOf(rec));
    await redis.del(ITEM(body.id));
    return { ok: 1, gearId: rec.gearId };
  }

  if (op === 'claim') {
    const rec = parse(await redis.get(ITEM(body.id)));
    if (!rec || rec.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (!rec.sold) return { ok: 0, sold: 0 };
    if (rec.claimed) return { ok: 0, error: '貨款已領過' };
    rec.claimed = 1;
    await redis.set(ITEM(body.id), JSON.stringify(rec), { ex: ITEM_TTL });
    return { ok: 1, pearls: Math.floor(rec.price * (1 - TAX)), buyer: rec.buyer || '', card: rec.card || 0 };
  }

  if (op === 'stars') {
    if (!okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
    const raw = await redis.zrange(DEALS(body.classCode), 0, 9, { rev: true, withScores: true });
    const top = [];
    for (let i = 0; i < raw.length; i += 2) top.push({ name: raw[i], deals: Math.round(Number(raw[i + 1]) || 0) });
    return { ok: 1, top };
  }

  return { ok: 0, error: 'bad op' };
}

// —— HTTP wiring（原生 Cloudflare Pages Functions；binding 名 wenyan_db，簽章密鑰 WY_HMAC_SECRET）——
const ORIGINS = [
  'https://wenyan-jieyou-zhan.vercel.app',
  'https://wenyan-jieyou-zhan.pages.dev',
  'https://wenyan-jieyou-zhan.netlify.app',
  'http://localhost:8788',
  'http://localhost:8080',
  'http://localhost:8099',
];
const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[1],
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
});

// 輕量限流：每 IP 60 秒 30 次寫入
async function rateLimited(request, redis) {
  const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  return (await redis.incr(`wy_mkt:rl:${ip}`, 60)) > 30;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(request.headers.get('origin'));
  const redis = kvFor(env.wenyan_db);
  let body;
  try { body = await request.json(); } catch { body = {}; }
  try {
    if ((body || {}).op !== 'list' && (await rateLimited(request, redis))) {
      return new Response(JSON.stringify({ ok: 0, error: '操作太頻繁，請稍候再試' }), { status: 429, headers });
    }
    const ctx = { secret: env.WY_HMAC_SECRET || 'wy-mkt-dev', forceOpen: env.WY_MKT_FORCE_OPEN === '1' };
    return new Response(JSON.stringify(await marketOp(redis, body, ctx)), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: 0, error: String((e && e.message) || e) }), { status: 500, headers });
  }
}
