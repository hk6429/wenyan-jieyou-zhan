// Redis-over-D1 shim（文言解憂站三子系統共用：擂台 wy_rt: / 合契 wy_fuse: / 市集 wy_mkt:）
// 移植自 vocab-duel functions/api/_redis.js（僅去掉 vercelToPages 轉接層；functions 走原生 onRequestPost 風格）。
// 契約：get/hget/hgetall/lrange 一律回原始字串，呼叫端防禦式 JSON.parse；
//       set/hset/lpush/zadd 傳物件自動 stringify；TTL 存 exp epoch ms、讀取惰性過期。
// 金鑰約定：需要簽章的子系統（市集）用 env.WY_HMAC_SECRET（Pages 環境變數，不入版控）；各子系統 secret 分開命名，不共用。
export function kvFor(db) {
  const now = () => Date.now();

  return {
    // ---- string ----
    async get(k) {
      const v = await db.prepare('SELECT v FROM kv WHERE k=?1 AND (exp IS NULL OR exp>?2)').bind(k, now()).first('v');
      return v == null ? null : v;
    },
    async set(k, v, opts) {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      const exp = opts && opts.ex ? now() + opts.ex * 1000 : null;
      await db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=?2, exp=?3').bind(k, val, exp).run();
      return 'OK';
    },
    // ttlSec 給定時：第一次建立當下就把 exp 一併寫入同一條 INSERT，避免「先 incr 再另外呼叫 expire」
    // 兩步驟之間的 race condition — 若第二步沒執行到，exp 會永遠停在 NULL、計數器永久卡死不過期。
    async incr(k, ttlSec) {
      await db.prepare('DELETE FROM kv WHERE k=?1 AND exp IS NOT NULL AND exp<=?2').bind(k, now()).run();
      const exp = ttlSec ? now() + ttlSec * 1000 : null;
      await db.prepare("INSERT INTO kv (k,v,exp) VALUES (?1,'1',?2) ON CONFLICT(k) DO UPDATE SET v=CAST((CAST(v AS INTEGER)+1) AS TEXT)").bind(k, exp).run();
      const v = await db.prepare('SELECT v FROM kv WHERE k=?1').bind(k).first('v');
      return Number(v);
    },
    async incrby(k, delta, ttlSec) {
      const add = Math.max(0, Math.round(Number(delta) || 0));
      await db.prepare('DELETE FROM kv WHERE k=?1 AND exp IS NOT NULL AND exp<=?2').bind(k, now()).run();
      const exp = ttlSec ? now() + ttlSec * 1000 : null;
      await db.prepare("INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=CAST((CAST(v AS INTEGER)+?2) AS TEXT)").bind(k, String(add), exp).run();
      const v = await db.prepare('SELECT v FROM kv WHERE k=?1').bind(k).first('v');
      return Number(v);
    },
    async del(...keys) {
      for (const k of keys) {
        await db.batch([
          db.prepare('DELETE FROM kv   WHERE k=?1').bind(k),
          db.prepare('DELETE FROM hash WHERE k=?1').bind(k),
          db.prepare('DELETE FROM list WHERE k=?1').bind(k),
          db.prepare('DELETE FROM zset WHERE k=?1').bind(k),
        ]);
      }
      return keys.length;
    },
    async exists(k) {
      const r = await db.prepare('SELECT 1 AS e FROM kv WHERE k=?1 AND (exp IS NULL OR exp>?2)').bind(k, now()).first('e');
      return r ? 1 : 0;
    },
    async expire(k, sec) {
      const exp = now() + sec * 1000;
      await db.batch([
        db.prepare('UPDATE kv   SET exp=?2 WHERE k=?1').bind(k, exp),
        db.prepare('UPDATE hash SET exp=?2 WHERE k=?1').bind(k, exp),
        db.prepare('UPDATE list SET exp=?2 WHERE k=?1').bind(k, exp),
        db.prepare('UPDATE zset SET exp=?2 WHERE k=?1').bind(k, exp),
      ]);
      return 1;
    },

    // ---- hash ----
    async hget(k, f) {
      const v = await db.prepare('SELECT v FROM hash WHERE k=?1 AND f=?2 AND (exp IS NULL OR exp>?3)').bind(k, f, now()).first('v');
      return v == null ? null : v;
    },
    async hgetall(k) {
      const { results } = await db.prepare('SELECT f,v FROM hash WHERE k=?1 AND (exp IS NULL OR exp>?2)').bind(k, now()).all();
      if (!results || !results.length) return null;
      const o = {};
      for (const r of results) o[r.f] = r.v;
      return o;
    },
    async hset(k, obj) {
      const entries = Object.entries(obj);
      const stmts = entries.map(([f, val]) => {
        const s = typeof val === 'string' ? val : JSON.stringify(val);
        return db.prepare('INSERT INTO hash (k,f,v,exp) VALUES (?1,?2,?3,NULL) ON CONFLICT(k,f) DO UPDATE SET v=?3').bind(k, f, s);
      });
      if (stmts.length) await db.batch(stmts);
      return entries.length;
    },
    async hlen(k) {
      const c = await db.prepare('SELECT COUNT(*) AS c FROM hash WHERE k=?1 AND (exp IS NULL OR exp>?2)').bind(k, now()).first('c');
      return Number(c || 0);
    },

    // ---- list（新的在前，用 id 遞增定序）----
    async lpush(k, ...vals) {
      const stmts = vals.map((val) => {
        const s = typeof val === 'string' ? val : JSON.stringify(val);
        return db.prepare('INSERT INTO list (k,v,exp) VALUES (?1,?2,NULL)').bind(k, s);
      });
      if (stmts.length) await db.batch(stmts);
      const c = await db.prepare('SELECT COUNT(*) AS c FROM list WHERE k=?1').bind(k).first('c');
      return Number(c || 0);
    },
    async lrange(k, start, stop) {
      const { results } = await db.prepare('SELECT v FROM list WHERE k=?1 AND (exp IS NULL OR exp>?2) ORDER BY id DESC').bind(k, now()).all();
      const arr = (results || []).map((r) => r.v);
      return sliceRange(arr, start, stop);
    },
    async ltrim(k, start, stop) {
      const { results } = await db.prepare('SELECT id FROM list WHERE k=?1 ORDER BY id DESC').bind(k).all();
      const ids = (results || []).map((r) => r.id);
      const N = ids.length;
      let s = start < 0 ? N + start : start;
      let e = stop < 0 ? N + stop : stop;
      s = Math.max(0, s); e = Math.min(N - 1, e);
      const keep = new Set(s > e ? [] : ids.slice(s, e + 1));
      const del = ids.filter((id) => !keep.has(id));
      if (del.length) {
        const ph = del.map((_, i) => `?${i + 1}`).join(',');
        await db.prepare(`DELETE FROM list WHERE id IN (${ph})`).bind(...del).run();
      }
      return 'OK';
    },

    // ---- sorted-set ----
    async zadd(k, arg) {
      const member = typeof arg.member === 'string' ? arg.member : JSON.stringify(arg.member);
      await db.prepare('INSERT INTO zset (k,member,score,exp) VALUES (?1,?2,?3,NULL) ON CONFLICT(k,member) DO UPDATE SET score=?3').bind(k, member, arg.score).run();
      return 1;
    },
    async zincrby(k, delta, member) {
      const m = typeof member === 'string' ? member : JSON.stringify(member);
      await db.prepare('INSERT INTO zset (k,member,score,exp) VALUES (?1,?2,?3,NULL) ON CONFLICT(k,member) DO UPDATE SET score=score+?3').bind(k, m, delta).run();
      const s = await db.prepare('SELECT score FROM zset WHERE k=?1 AND member=?2').bind(k, m).first('score');
      return Number(s);
    },
    async zrange(k, start, stop, opts) {
      const rev = opts && opts.rev;
      const ws = opts && opts.withScores;
      const order = rev ? 'DESC' : 'ASC';
      const { results } = await db.prepare(
        `SELECT member, score FROM zset WHERE k=?1 AND (exp IS NULL OR exp>?2) ORDER BY score ${order}, member ${order}`
      ).bind(k, now()).all();
      const rows = sliceRange(results || [], start, stop);
      if (ws) {
        const out = [];
        for (const r of rows) { out.push(r.member, r.score); }
        return out;
      }
      return rows.map((r) => r.member);
    },
    async zrem(k, ...members) {
      for (const member of members) {
        const m = typeof member === 'string' ? member : JSON.stringify(member);
        await db.prepare('DELETE FROM zset WHERE k=?1 AND member=?2').bind(k, m).run();
      }
      return members.length;
    },
    async zremrangebyrank(k, start, stop) {
      const { results } = await db.prepare('SELECT member FROM zset WHERE k=?1 ORDER BY score ASC, member ASC').bind(k).all();
      const members = (results || []).map((r) => r.member);
      const N = members.length;
      let s = start < 0 ? N + start : start;
      let e = stop < 0 ? N + stop : stop;
      s = Math.max(0, s); e = Math.min(N - 1, e);
      if (s > e) return 0;
      const toDel = members.slice(s, e + 1);
      if (!toDel.length) return 0;
      const ph = toDel.map((_, i) => `?${i + 2}`).join(',');
      await db.prepare(`DELETE FROM zset WHERE k=?1 AND member IN (${ph})`).bind(k, ...toDel).run();
      return toDel.length;
    },
  };
}

// Redis 風格的區間切片（含端點；負數從尾端算）
function sliceRange(arr, start, stop) {
  const N = arr.length;
  let s = start < 0 ? N + start : start;
  let e = stop < 0 ? N + stop : stop;
  s = Math.max(0, s); e = Math.min(N - 1, e);
  if (s > e) return [];
  return arr.slice(s, e + 1);
}
