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
const stripBad = (x) => String(x ?? '').replace(/[<>&"']/g, '');
const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|三小|幹你|靠北|媽的|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const okNick = (n) => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 12 && !BAD_WORDS.test(n);
const okCode = (c) => typeof c === 'string' && c.trim().length >= 1 && c.trim().length <= 20;
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

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: CORS(request) });
}

export async function onRequestPost({ request, env }) {
  const kv = kvFor(env.wenyan_db);
  const body = await request.json().catch(() => ({}));
  const { op } = body || {};
  const code = String(body.code || '').trim();
  try {
    if (op === 'start') {
      const { pin, qn } = body;
      const scope = cleanScope(body.scope);
      if (!okCode(code) || !okPin(pin) || !scope) return reply(request, { ok: 0, error: '開場資料不完整（班級碼、4-8 位數主持碼、題數）' }, 400);
      const existing = parse(await kv.get(liveKey(code)));
      if (existing && existing.phase !== 'end') return reply(request, { ok: 0, error: '這個班級碼已有進行中的文會' });
      const live = { seed: Math.floor(Math.random() * 1e9), qn: clamp(qn, 30) || 10, scope, phase: 'lobby', qNo: 0, pin };
      await kv.set(liveKey(code), JSON.stringify(live), { ex: TTL });
      await kv.del(rosterKey(code));
      const { pin: _p, ...pub } = live;
      return reply(request, { ok: 1, live: pub });
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
      const { nick, qNo, correct } = body;
      if (!okCode(code) || !okNick(nick)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const nk = stripBad(nick).trim().slice(0, 12);
      const qn = clamp(qNo, 40);
      const cur = parse(await kv.hget(rosterKey(code), nk)) || { score: 0, qNo: 0, hist: '' };
      if (qn <= cur.qNo) return reply(request, { ok: 1 }); // 防重送灌分：同題或舊題忽略
      cur.qNo = qn;
      cur.score += correct ? 1 : 0;
      cur.hist = (cur.hist + (correct ? '1' : '0')).slice(-40);
      await kv.hset(rosterKey(code), { [nk]: JSON.stringify(cur) });
      await kv.expire(rosterKey(code), TTL);
      return reply(request, { ok: 1 });
    }

    if (op === 'roster') {
      if (!okCode(code)) return reply(request, { ok: 0, error: 'bad req' }, 400);
      const all = await kv.hgetall(rosterKey(code));
      const list = all
        ? Object.entries(all).map(([nick, v]) => { const o = parse(v); return { nick, score: o.score, qNo: o.qNo, hist: o.hist }; })
        : [];
      list.sort((a, b) => b.score - a.score || a.qNo - b.qNo);
      return reply(request, { ok: 1, list });
    }

    return reply(request, { ok: 0, error: 'bad op' }, 400);
  } catch (e) {
    return reply(request, { ok: 0, error: String((e && e.message) || e) }, 500);
  }
}
