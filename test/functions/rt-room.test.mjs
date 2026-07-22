import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../helpers/fake-d1.mjs';
import { onRequestPost } from '../../functions/api/rt-room.js';

const SCOPE = { mode: 'mixed' };
const SNAP = { nick: '小書生', hp: 100, scope: SCOPE };
const call = (env, body, ip = '1.2.3.4') => onRequestPost({
  request: new Request('http://x/api/rt-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://wenyan-jieyou-zhan.pages.dev' },
    body: JSON.stringify(body),
  }),
  env,
}).then((r) => r.json());
const env = () => ({ wenyan_db: createFakeD1() });

test('create → join → push → poll 全流程', async () => {
  const e = env();
  const c = await call(e, { op: 'create', snap: SNAP });
  assert.equal(c.ok, 1);
  assert.match(c.code, /^\d{4}$/);
  assert.equal(typeof c.seed, 'number');

  const j = await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '對手' } }, '5.6.7.8');
  assert.equal(j.ok, 1);
  assert.equal(j.seed, c.seed);
  assert.deepEqual(j.scope, SCOPE);
  assert.equal(j.opp.nick, '小書生');

  const p = await call(e, { op: 'push', code: c.code, role: 'p2', state: { dmg: 30, round: 3, combo: 2, correct: 3, done: 0 } }, '5.6.7.8');
  assert.equal(p.ok, 1);

  const q = await call(e, { op: 'poll', code: c.code, role: 'p1' });
  assert.equal(q.ok, 1);
  assert.equal(q.opp.state.dmg, 30);
  assert.equal(q.opp.snap.nick, '對手');
  assert.equal(typeof q.now, 'number');
});

test('scope：single 需合法 textId、level 需 J/S，壞的擋下', async () => {
  const e = env();
  const single = await call(e, { op: 'create', snap: { ...SNAP, scope: { mode: 'single', textId: 't08' } } });
  assert.equal(single.ok, 1);
  const level = await call(e, { op: 'create', snap: { ...SNAP, scope: { mode: 'level', level: 'S' } } });
  assert.equal(level.ok, 1);
  const bad = await call(e, { op: 'create', snap: { ...SNAP, scope: { mode: 'single', textId: 'x99' } } });
  assert.equal(bad.ok, 0);
  const bad2 = await call(e, { op: 'create', snap: { ...SNAP, scope: { mode: 'level', level: 'Z' } } });
  assert.equal(bad2.ok, 0);
});

test('join：不存在的房回 ok:0；滿房回 ok:0', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'join', code: '0000', snap: SNAP })).ok, 0);
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '乙' } }, '5.6.7.8');
  const full = await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '丙' } }, '9.9.9.9');
  assert.equal(full.ok, 0);
});

test('輸入驗證：髒字暱稱、壞房號、壞 role、超界 state 全擋＋clamp', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '笨蛋' } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'push', code: 'abcd', role: 'p1', state: { dmg: 1 } })).error, 'bad req');
  assert.equal((await call(e, { op: 'push', code: '1234', role: 'p3', state: { dmg: 1 } })).error, 'bad req');
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'push', code: c.code, role: 'p1', state: { dmg: 999999999, round: 999, combo: -5, correct: 3, done: 1 } });
  const q = await call(e, { op: 'poll', code: c.code, role: 'p2' });
  assert.equal(q.opp.state.dmg, 99999);
  assert.equal(q.opp.state.round, 40);
  assert.equal(q.opp.state.combo, 0);
});

test('限流：同 IP create 超過 30 次回 429 錯誤', async () => {
  const e = env();
  let last = null;
  for (let i = 0; i < 31; i++) last = await call(e, { op: 'create', snap: SNAP });
  assert.ok(last.error && last.error.includes('頻繁'));
});

test('戰帖：challenge → accept → challengeResult 全流程，scope 保形、小寫碼也吃', async () => {
  const e = env();
  const scope = { mode: 'single', textId: 't10' };
  const c = await call(e, { op: 'challenge', seed: 123456, scope, nick: '甲同學', score: 480 });
  assert.equal(c.ok, 1);
  assert.match(c.code, /^[A-Z0-9]{6}$/);
  const a = await call(e, { op: 'accept', code: c.code.toLowerCase() });
  assert.equal(a.ok, 1);
  assert.equal(a.seed, 123456);
  assert.deepEqual(a.scope, scope);
  assert.equal(a.challenger, '甲同學');
  assert.equal(a.score, 480);
  const r = await call(e, { op: 'challengeResult', code: c.code, nick: '乙同學', score: 520 });
  assert.equal(r.ok, 1);
  assert.deepEqual(r.challenger, { nick: '甲同學', score: 480 });
  assert.deepEqual(r.accepter, { nick: '乙同學', score: 520 });
});

test('戰帖：壞碼/過期碼回 ok:0，不炸 500', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'accept', code: 'zz' })).ok, 0);
  assert.equal((await call(e, { op: 'accept', code: 'AAAAAA' })).ok, 0);
});

test('賽季：只接受一次性已結算憑證，積分綁答對，並支援班級榜', async () => {
  const e = env();
  const makeToken = async (nick, correct, win = true) => {
    const c = await call(e, { op: 'challenge', seed: 1, scope: { mode: 'mixed' }, nick: '對手', score: win ? 10 : 30 });
    const r = await call(e, { op: 'challengeResult', code: c.code, nick, score: 20, correct, classCode: '5A03' });
    return r.seasonToken;
  };
  const t1 = await makeToken('甲', 8);
  const r1 = await call(e, { op: 'seasonAdd', seasonToken: t1 });
  assert.equal(r1.total, 10);
  assert.equal((await call(e, { op: 'seasonAdd', seasonToken: t1 })).ok, 0); // 不可重放
  await call(e, { op: 'seasonAdd', seasonToken: await makeToken('甲', 10) });
  await call(e, { op: 'seasonAdd', seasonToken: await makeToken('乙', 5, false) });
  const top = await call(e, { op: 'seasonTop', classCode: '5A03' });
  assert.equal(top.ok, 1);
  assert.match(top.season, /^\d{4}-\d{2}$/);
  assert.deepEqual(top.top, [{ nick: '甲', pts: 22 }, { nick: '乙', pts: 0 }]);
});
