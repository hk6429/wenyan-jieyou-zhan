import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../helpers/fake-d1.mjs';
import { onRequestPost } from '../../functions/api/rt-live.js';

const call = (env, body) => onRequestPost({
  request: new Request('http://x/api/rt-live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://wenyan-jieyou-zhan.pages.dev' },
    body: JSON.stringify(body),
  }),
  env,
}).then((r) => r.json());
const env = () => ({ wenyan_db: createFakeD1() });

test('start → state → next → answer → roster → end 全流程', async () => {
  const e = env();
  const scope = { mode: 'mixed' };
  const s = await call(e, { op: 'start', code: '5A03', pin: '8888', qn: 10, scope });
  assert.equal(s.ok, 1);
  assert.equal(s.live.phase, 'lobby');
  assert.equal(typeof s.live.seed, 'number');

  await call(e, { op: 'key', code: '5A03', pin: '8888', answerKey: [1,0,0,0,0,0,0,0,0,0] });
  const st = await call(e, { op: 'state', code: '5A03' });
  assert.equal(st.ok, 1);
  assert.equal(st.live.pin, undefined); // pin 絕不外洩

  const n = await call(e, { op: 'next', code: '5A03', pin: '8888' });
  assert.equal(n.live.phase, 'q');
  assert.equal(n.live.qNo, 1);
  assert.equal((await call(e, { op: 'next', code: '5A03', pin: '0000' })).ok, 0); // 錯主持碼

  await call(e, { op: 'answer', code: '5A03', nick: '小明', deviceTag: 'abc123', qNo: 1, answerIdx: 1 });
  await call(e, { op: 'answer', code: '5A03', nick: '小華', deviceTag: 'def456', qNo: 1, answerIdx: 0 });
  const r = await call(e, { op: 'roster', code: '5A03' });
  assert.deepEqual(r.list[0], { nick: '小明', score: 1, qNo: 1, hist: '1' });
  assert.deepEqual(r.list[1], { nick: '小華', score: 0, qNo: 1, hist: '0' });

  const end = await call(e, { op: 'end', code: '5A03', pin: '8888' });
  assert.equal(end.live.phase, 'end');
});

test('answer：重複回報同一題不重複計分；髒字暱稱擋下', async () => {
  const e = env();
  await call(e, { op: 'start', code: 'C001', pin: '1234', qn: 5, scope: { mode: 'level', level: 'J' } });
  await call(e, { op: 'key', code: 'C001', pin: '1234', answerKey: [2,0,0,0,0] });
  await call(e, { op: 'next', code: 'C001', pin: '1234' });
  await call(e, { op: 'answer', code: 'C001', nick: '阿珠', deviceTag: 'abc123', qNo: 1, answerIdx: 2, correct: false });
  await call(e, { op: 'answer', code: 'C001', nick: '阿珠', deviceTag: 'abc123', qNo: 1, answerIdx: 2 }); // 重送
  const r = await call(e, { op: 'roster', code: 'C001' });
  assert.equal(r.list[0].score, 1);
  assert.equal((await call(e, { op: 'answer', code: 'C001', nick: '白癡', deviceTag: 'abc123', qNo: 1, answerIdx: 2 })).ok, 0);
});

test('start：同班級碼進行中場次擋下重開', async () => {
  const e = env();
  await call(e, { op: 'start', code: 'DUP1', pin: '1111', qn: 5, scope: { mode: 'mixed' } });
  const again = await call(e, { op: 'start', code: 'DUP1', pin: '2222', qn: 5, scope: { mode: 'mixed' } });
  assert.equal(again.ok, 0);
});
