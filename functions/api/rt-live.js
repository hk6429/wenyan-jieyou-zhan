// 全班文會後端 — 老師開房、全班同題搶答＋即時排名。key 前綴 wy_rt:live:。
// 主持以「開場自訂 pin」輕量控制（不綁後台帳號）。學生端只看白帽排名（前五＋自己），前端裁切。
//
// POST /api/rt-live：
//   { op:'start', code, pin, qn, scope }   → { ok:1, live }（重複進行中場次擋下）
//   { op:'state', code }                    → { ok:1, live:{seed,qn,scope,phase,qNo}|null }（不含 pin）
//   { op:'next', code, pin } / { op:'end', code, pin } → { ok:1, live } | { ok:0, error }
//   { op:'answer', code, nick, qNo, correct } → { ok:1 }
//   { op:'roster', code }                   → { ok:1, list:[{nick,score,qNo,hist}] }（score 降冪）
import { kvFor } from './_kv.js';

const TTL = 7200; // 2 小時
const liveKey = (code) => `wy_rt:live:${code}`;
const rosterKey = (code) => `wy_rt:live:${code}:roster`;

const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
// ISO 週鍵（YYYY-Www）——班級集體目標每週歸零重來，給每週一個回站的約定
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
const stripBad = (x) => String(x ?? '').replace(/[<>&"']/g, '');
const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const okNick = (n) => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 12 && !BAD_WORDS.test(n);
const okCode = (c) => typeof c === 'string' && /^[A-Z0-9]{4,8}$/.test(c.trim().toUpperCase());
const okPin = (p) => typeof p === 'string' && /^\d{4,8}$/.test(p);

const OK_MODE = new Set(['single', 'level', 'mixed']);
const OK_LEVEL = new Set(['J', 'S']);
function cleanScope(s) {
  if (!s || !OK_MODE.has(s.mode)) return null;
  if (s.mode === 'single') return /^t\d{2}$/.test(s.textId || '') ? { mode: 'single', textId: s.textId } : null;
  if (s.mode === 'level') return OK_LEVEL.has(s.level) ? { mode: 'level', level: s.level } : null;
  return { mode: 'mixed' };
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

async function rateLimited(kv, request, scope, cap = 30) {
  const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  return (await kv.incr(`wy_rt:live:rl:${scope}:${ip}`, 60)) > cap;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: CORS(request) });
}

export async function onRequestPost({ request, env }) {
  const kv = kvFor(env.wenyan_db);
  const body = await request.json().catch(() => ({}));
  const { op } = body || {};
  const code = String(body.code || '').trim().toUpperCase();
  try {
    if (['start', 'key', 'next', 'end', 'answer', 'goal'].includes(op) && await rateLimited(kv, request, op === 'answer' ? 'answer' : op === 'goal' ? 'goal' : 'write', op === 'answer' ? 90 : op === 'goal' ? 20 : 30)) {
      return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
    }
    if (op === 'start') {
      const { pin, qn } = body;
      const scope = cleanScope(body.scope);
      if (!okCode(code) || !okPin(pin) || !scope) return reply(request, { ok: 0, error: '開場資料不完整（班級碼、4-8 位數主持碼、題數）' }, 400);
      const existing = parse(await kv.get(liveKey(code)));
      if (existing && existing.phase !== 'end') return reply(request, { ok: 0, error: '這個班級碼已有進行中的文會' });
      const live = { seed: Math.floor(Math.random() * 1e9), qn: clamp(qn, 30) || 10, scope, phase: 'lobby', qNo: 0, pin, answerKey: [] };
      await kv.set(liveKey(code), JSON.stringify(live), { ex: TTL });
      await kv.del(rosterKey(code));
      const { pin: _p, ...pub } = live;
      return reply(request, { ok: 1, live: pub });
    }

    if (op === 'key') {
      const live = parse(await kv.get(liveKey(code)));
      if (!live || body.pin !== live.pin) return reply(request, { ok: 0, error: '主持碼不對' });
      const key = Array.isArray(body.answerKey) ? body.answerKey.slice(0, live.qn).map((x) => clamp(x, 3)) : [];
      if (key.length !== live.qn) return reply(request, { ok: 0, error: '答案鍵長度不符' }, 400);
      live.answerKey = key;
      await kv.set(liveKey(code), JSON.stringify(live), { ex: TTL });
      return reply(request, { ok: 1 });
    }

    if (op === 'state') {
      if (!okCode(code)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const live = parse(await kv.get(liveKey(code)));
      if (!live) return reply(request, { ok: 1, live: null });
      const { pin: _p, ...pub } = live;
      return reply(request, { ok: 1, live: pub });
    }

    if (op === 'next' || op === 'end') {
      const { pin } = body;
      if (!okCode(code)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const live = parse(await kv.get(liveKey(code)));
      if (!live) return reply(request, { ok: 0, error: '文會不存在或已結束' });
      if (pin !== live.pin) return reply(request, { ok: 0, error: '主持碼不對' });
      if (op === 'end') live.phase = 'end';
      else {
        if (live.phase === 'lobby') { live.phase = 'q'; live.qNo = 1; }
        else if (live.qNo >= live.qn) live.phase = 'end';
        else live.qNo += 1;
      }
      await kv.set(liveKey(code), JSON.stringify(live), { ex: TTL });
      const { pin: _p, ...pub } = live;
      return reply(request, { ok: 1, live: pub });
    }

    if (op === 'answer') {
      const { nick, qNo, answerIdx, deviceTag } = body;
      if (!okCode(code) || !okNick(nick)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const live = parse(await kv.get(liveKey(code)));
      if (!live || !Array.isArray(live.answerKey) || live.answerKey.length < live.qn) return reply(request, { ok: 0, error: '本場答案鍵尚未就緒' }, 409);
      const tag = String(deviceTag || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
      if (tag.length < 4) return reply(request, { ok: 0, error: '裝置識別不完整' }, 400);
      const display = stripBad(nick).trim().slice(0, 12);
      const nk = `${display}·${tag}`;
      const qn = clamp(qNo, 40);
      const correct = clamp(answerIdx, 3) === live.answerKey[qn - 1];
      const cur = parse(await kv.hget(rosterKey(code), nk)) || { nick: display, score: 0, qNo: 0, hist: '' };
      if (qn <= cur.qNo) return reply(request, { ok: 1 }); // 防重送灌分：同題或舊題忽略
      cur.qNo = qn;
      cur.score += correct ? 1 : 0;
      cur.hist = (cur.hist + (correct ? '1' : '0')).slice(-40);
      await kv.hset(rosterKey(code), { [nk]: JSON.stringify(cur) });
      await kv.expire(rosterKey(code), TTL);
      return reply(request, { ok: 1 });
    }

    // 班級集體目標：全班本週累計答對題數。白帽——只 incr（+1/題），不記個人、不做班際排行。
    // { op:'goal', code, n } n=本次要加的答對數（前端節流批量上報，clamp 防灌）；回 { ok, count, weekKey }
    // { op:'goalState', code } 只讀當週累計；回 { ok, count, weekKey }
    if (op === 'goal' || op === 'goalState') {
      if (!okCode(code)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const wk = weekKey();
      const gk = `wy_rt:goal:${code}:${wk}`;
      const rosterN = await kv.hlen(rosterKey(code));
      const target = Math.max(100, rosterN * 20);
      const weeksKey = `wy_rt:goal:${code}:weeks`;
      if (op === 'goalState') {
        const v = await kv.get(gk);
        return reply(request, { ok: 1, count: Number(v) || 0, target, achievedWeeks: Number(await kv.get(weeksKey)) || 0, weekKey: wk });
      }
      const add = clamp(body.n, 5) || 1;
      const count = await kv.incrby(gk, add, 8 * 86400);
      const mark = `${gk}:achieved`;
      if (count >= target && !(await kv.exists(mark))) { await kv.set(mark, '1', { ex: 8 * 86400 }); await kv.incr(weeksKey); }
      return reply(request, { ok: 1, count, target, achievedWeeks: Number(await kv.get(weeksKey)) || 0, weekKey: wk });
    }

    if (op === 'roster') {
      if (!okCode(code)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const all = await kv.hgetall(rosterKey(code));
      const list = all
        ? Object.entries(all).map(([, v]) => { const o = parse(v); return { nick: o.nick, score: o.score, qNo: o.qNo, hist: o.hist }; })
        : [];
      list.sort((a, b) => b.score - a.score || a.qNo - b.qNo);
      return reply(request, { ok: 1, list });
    }

    return reply(request, { ok: 0, error: 'bad op' }, 400);
  } catch (e) {
    return reply(request, { ok: 0, error: String((e && e.message) || e) }, 500);
  }
}
