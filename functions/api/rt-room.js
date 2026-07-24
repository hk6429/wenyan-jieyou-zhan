// 文戰擂台房間後端 — 4 位數房號、D1 輪詢制（回合答題 1.5 秒延遲夠用）。
// 伺服器只當狀態郵筒：存房間 meta（seed/scope）＋雙方進度心跳，不存題目（雙方本機同 seed 出題）。
// key 前綴一律 wy_rt:。原生 Cloudflare Pages Functions（onRequestPost），非 vercelToPages。
//
// POST /api/rt-room：
//   { op:'create', snap }                       → { ok:1, code:'1000'~'9999', seed }
//   { op:'join', code, snap }                    → { ok:1, seed, scope, opp } | { ok:0, error }
//   { op:'push', code, role:'p1'|'p2', state }   → { ok:1 }
//   { op:'poll', code, role }                    → { ok:1, opp:{snap,state,hb}|null, now } | { ok:0, error }
//   —— 非同步戰帖（7 天 TTL）——
//   { op:'challenge', seed, scope, nick, score } → { ok:1, code:'6碼' }
//   { op:'accept', code }                        → { ok:1, seed, scope, challenger, score } | { ok:0, error }
//   { op:'challengeResult', code, nick, score }  → { ok:1, challenger, accepter } | { ok:0, error }
//   —— 科舉賽季排位 ——
//   { op:'seasonAdd', nick, pts }                → { ok:1, total }
//   { op:'seasonTop', season? }                  → { ok:1, season, top:[{nick,pts}] }
import { kvFor } from './_kv.js';

const TTL = 600;              // 房間 10 分鐘
const CH_TTL = 7 * 86400;     // 戰帖 7 天
const SEASON_TTL = 100 * 86400; // 賽季榜可回顧上季

const keyOf = (code) => `wy_rt:room:${code}`;
const chKey = (code) => `wy_rt:ch:${code}`;
const seasonKey = (s, classCode = '') => `wy_rt:season:${classCode || 'global'}:${s}`;
const seasonTokenKey = (t) => `wy_rt:season-token:${t}`;
const okClass = (c) => !c || /^[A-Z0-9]{4,8}$/.test(String(c).toUpperCase());
const token = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const stripBad = (x) => String(x ?? '').replace(/[<>&"']/g, '');
// 暱稱黑名單：暱稱會顯示在對戰畫面與戰帖，擋明顯攻擊性字詞（非窮舉）
const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const okNick = (n) => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 12 && !BAD_WORDS.test(n);
const okCode = (c) => typeof c === 'string' && /^\d{4}$/.test(c);
const okRole = (r) => r === 'p1' || r === 'p2';
const okChCode = (c) => typeof c === 'string' && /^[A-Z0-9]{6}$/.test(String(c).trim().toUpperCase());
const genChCode = () => {
  const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 避開易混淆字元 I/O/0/1/L
  let s = '';
  for (let i = 0; i < 6; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
};

// 選題範圍：mode single 需 textId（tNN）；level 需 level（J/S）；mixed 使用全題庫
const OK_MODE = new Set(['single', 'level', 'mixed']);
const OK_LEVEL = new Set(['J', 'S']);
function cleanScope(s) {
  if (!s || !OK_MODE.has(s.mode)) return null;
  if (s.mode === 'single') {
    if (typeof s.textId !== 'string' || !/^t\d{2}$/.test(s.textId)) return null;
    return { mode: 'single', textId: s.textId };
  }
  if (s.mode === 'level') {
    if (!OK_LEVEL.has(s.level)) return null;
    return { mode: 'level', level: s.level };
  }
  return { mode: 'mixed' };
}

function cleanSnap(s) {
  if (!s || !okNick(s.nick)) return null;
  const nick = stripBad(s.nick).trim();
  const scope = cleanScope(s.scope);
  if (!nick || !scope) return null;
  return {
    nick: nick.slice(0, 12),
    hp: clamp(s.hp, 400) || 100,
    scope,
  };
}

function cleanState(s) {
  if (!s) return null;
  return {
    dmg: clamp(s.dmg, 99999), // 累計輸出傷害（攻擊方權威）
    round: clamp(s.round, 40),
    combo: clamp(s.combo, 40),
    correct: clamp(s.correct, 40),
    done: s.done ? 1 : 0,
    hb: Date.now(),          // 伺服器蓋章心跳
  };
}

const ORIGINS = [
  'https://wenyan-jieyou-zhan.vercel.app',
  'https://wenyan-jieyou-zhan.pages.dev',
  'https://wenyan-jieyou-zhan.netlify.app',
  'http://localhost:8788',
  'http://localhost:8080',
];
const CORS = (request) => {
  const o = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[1],
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
};
const reply = (request, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS(request) });
const parse = (raw) => (raw == null ? null : (typeof raw === 'string' ? JSON.parse(raw) : raw));

// 輕量限流：每 IP 每 60 秒 cap 次寫入，超過回 true
async function rateLimited(kv, request, scope, cap = 30) {
  const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const n = await kv.incr(`wy_rt:rl:${scope}:${ip}`, 60);
  return n > cap;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: CORS(request) });
}

export async function onRequestPost({ request, env }) {
  const kv = kvFor(env.wenyan_db);
  const body = await request.json().catch(() => ({}));
  const { op } = body || {};
  try {
    if (op === 'create' || op === 'join' || op === 'challenge' || op === 'challengeResult' || op === 'seasonAdd') {
      if (await rateLimited(kv, request, 'room')) return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
    }

    if (op === 'create') {
      const snap = cleanSnap(body.snap);
      if (!snap) return reply(request, { ok: 0, error: 'bad snap' }, 400);
      let code = '';
      for (let i = 0; i < 8; i++) {
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!(await kv.exists(keyOf(c)))) { code = c; break; }
      }
      if (!code) return reply(request, { ok: 0, error: '房號額滿，請重試' }, 500);
      const seed = Math.floor(Math.random() * 1e9);
      await kv.set(keyOf(code), JSON.stringify({ seed, scope: snap.scope }), { ex: TTL });
      await kv.set(`${keyOf(code)}:p1`, JSON.stringify({ snap, state: null, hb: Date.now() }), { ex: TTL });
      return reply(request, { ok: 1, code, seed });
    }

    if (op === 'join') {
      const { code } = body;
      const snap = cleanSnap(body.snap);
      if (!okCode(code) || !snap) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const meta = parse(await kv.get(keyOf(code)));
      if (!meta) return reply(request, { ok: 0, error: '房間不存在或已過期' });
      if (await kv.exists(`${keyOf(code)}:p2`)) return reply(request, { ok: 0, error: '房間已滿' });
      const p1 = parse(await kv.get(`${keyOf(code)}:p1`));
      await kv.set(`${keyOf(code)}:p2`, JSON.stringify({ snap, state: null, hb: Date.now() }), { ex: TTL });
      return reply(request, { ok: 1, seed: meta.seed, scope: meta.scope, opp: p1 ? p1.snap : null });
    }

    if (op === 'push') {
      if (await rateLimited(kv, request, 'push', 90)) return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
      const { code, role } = body;
      const state = cleanState(body.state);
      if (!okCode(code) || !okRole(role) || !state) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const obj = parse(await kv.get(`${keyOf(code)}:${role}`)) || { snap: null };
      obj.state = state; obj.hb = Date.now();
      await kv.set(`${keyOf(code)}:${role}`, JSON.stringify(obj), { ex: TTL });
      return reply(request, { ok: 1 });
    }

    if (op === 'poll') {
      const { code, role } = body;
      if (!okCode(code) || !okRole(role)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const other = role === 'p1' ? 'p2' : 'p1';
      const [meta, raw] = await Promise.all([kv.get(keyOf(code)), kv.get(`${keyOf(code)}:${other}`)]);
      if (!meta) return reply(request, { ok: 0, error: '房間已過期' });
      const o = parse(raw);
      return reply(request, { ok: 1, opp: o ? { snap: o.snap, state: o.state, hb: o.hb } : null, now: Date.now() });
    }

    // —— 非同步戰帖 ——
    if (op === 'challenge') {
      const { seed, nick, score } = body;
      const scope = cleanScope(body.scope);
      if (!okNick(nick) || !scope) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const rec = { seed: clamp(seed, 1e9), scope, nick: stripBad(nick).trim().slice(0, 12), score: clamp(score, 999999), ts: Date.now() };
      if (!rec.nick) return reply(request, { ok: 0, error: 'bad req' }, 400);
      let code = '';
      for (let i = 0; i < 8; i++) {
        const c = genChCode();
        if (!(await kv.exists(chKey(c)))) { code = c; break; }
      }
      if (!code) return reply(request, { ok: 0, error: '戰帖碼額滿，請重試' }, 500);
      await kv.set(chKey(code), JSON.stringify(rec), { ex: CH_TTL });
      return reply(request, { ok: 1, code });
    }

    if (op === 'accept') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!okChCode(code)) return reply(request, { ok: 0, error: '戰帖碼格式不對' });
      const c = parse(await kv.get(chKey(code)));
      if (!c) return reply(request, { ok: 0, error: '戰帖不存在或已過期' });
      return reply(request, { ok: 1, seed: c.seed, scope: c.scope, challenger: c.nick, score: c.score });
    }

    if (op === 'challengeResult') {
      const code = String(body.code || '').trim().toUpperCase();
      const { nick, score } = body;
      if (!okChCode(code) || !okNick(nick)) return reply(request, { ok: 0, error: '資料不完整' });
      const c = parse(await kv.get(chKey(code)));
      if (!c) return reply(request, { ok: 0, error: '戰帖不存在或已過期' });
      if (c.settled) return reply(request, { ok: 0, error: '這張戰帖已結算' });
      const accepter = { nick: stripBad(nick).trim().slice(0, 12), score: clamp(score, 999999), correct: clamp(body.correct, 30), ts: Date.now() };
      c.accepter = accepter;
      c.settled = true;
      await kv.set(chKey(code), JSON.stringify(c), { ex: CH_TTL });
      const st = token();
      const win = accepter.score > c.score;
      await kv.set(seasonTokenKey(st), JSON.stringify({ nick: accepter.nick, pts: win ? accepter.correct + 2 : 0, classCode: okClass(body.classCode) ? String(body.classCode || '').toUpperCase() : '' }), { ex: 600 });
      return reply(request, { ok: 1, seasonToken: st, challenger: { nick: c.nick, score: c.score }, accepter: { nick: accepter.nick, score: accepter.score } });
    }

    if (op === 'seasonToken') {
      const { code, role, nick } = body;
      if (!okCode(code) || !okRole(role) || !okNick(nick)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const rec = parse(await kv.get(`${keyOf(code)}:${role}`));
      if (!rec || !rec.state || !rec.state.done) return reply(request, { ok: 0, error: '對戰尚未完成' });
      const onceKey = `${keyOf(code)}:${role}:seasoned`;
      if (await kv.exists(onceKey)) return reply(request, { ok: 0, error: '本場已結算' });
      await kv.set(onceKey, '1', { ex: TTL });
      const st = token();
      await kv.set(seasonTokenKey(st), JSON.stringify({ nick: stripBad(nick).trim().slice(0, 12), pts: clamp(rec.state.correct, 30) + (body.verdict === 'win' ? 2 : 0), classCode: okClass(body.classCode) ? String(body.classCode || '').toUpperCase() : '' }), { ex: 600 });
      return reply(request, { ok: 1, seasonToken: st });
    }

    // —— 科舉賽季排位 ——
    if (op === 'seasonAdd') {
      const rec = parse(await kv.get(seasonTokenKey(String(body.seasonToken || ''))));
      if (!rec) return reply(request, { ok: 0, error: '賽季憑證無效或已使用' }, 403);
      await kv.del(seasonTokenKey(String(body.seasonToken || '')));
      const season = new Date().toISOString().slice(0, 7); // 伺服器自算，不信任 client
      const day = new Date().toISOString().slice(0, 10);
      if ((await kv.incr(`wy_rt:season-daily:${day}:${rec.nick}`, 2 * 86400)) > 20) return reply(request, { ok: 0, error: '今日賽季場次已達上限' }, 429);
      const total = await kv.zincrby(seasonKey(season, rec.classCode), rec.pts, rec.nick);
      await kv.expire(seasonKey(season, rec.classCode), SEASON_TTL);
      if (rec.classCode) { await kv.zincrby(seasonKey(season), rec.pts, rec.nick); await kv.expire(seasonKey(season), SEASON_TTL); }
      return reply(request, { ok: 1, total });
    }

    if (op === 'seasonTop') {
      const season = /^\d{4}-\d{2}$/.test(String(body.season || '')) ? body.season : new Date().toISOString().slice(0, 7);
      const classCode = okClass(body.classCode) ? String(body.classCode || '').toUpperCase() : '';
      const flat = await kv.zrange(seasonKey(season, classCode), 0, 9, { rev: true, withScores: true });
      const top = [];
      for (let i = 0; i < flat.length; i += 2) top.push({ nick: flat[i], pts: Number(flat[i + 1]) });
      return reply(request, { ok: 1, season, top });
    }

    return reply(request, { ok: 0, error: 'bad op' }, 400);
  } catch (e) {
    return reply(request, { ok: 0, error: String((e && e.message) || e) }, 500);
  }
}
