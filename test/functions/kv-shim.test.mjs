import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../helpers/fake-d1.mjs';
import { kvFor } from '../../functions/api/_kv.js';

test('kv：set/get/exists/del，物件自動 stringify、get 回原始字串', async () => {
  const kv = kvFor(createFakeD1());
  await kv.set('wy_rt:a', { x: 1 });
  assert.equal(await kv.get('wy_rt:a'), '{"x":1}');
  assert.equal(await kv.exists('wy_rt:a'), 1);
  await kv.del('wy_rt:a');
  assert.equal(await kv.get('wy_rt:a'), null);
});

test('kv：TTL 惰性過期', async () => {
  const kv = kvFor(createFakeD1());
  await kv.set('wy_rt:t', 'v', { ex: -1 }); // 已過期
  assert.equal(await kv.get('wy_rt:t'), null);
  assert.equal(await kv.exists('wy_rt:t'), 0);
});

test('kv：incr 原子遞增＋首建即帶 TTL', async () => {
  const kv = kvFor(createFakeD1());
  assert.equal(await kv.incr('wy_rt:rl:x', 60), 1);
  assert.equal(await kv.incr('wy_rt:rl:x', 60), 2);
});

test('hash：hset/hget/hgetall/hlen', async () => {
  const kv = kvFor(createFakeD1());
  await kv.hset('wy_rt:h', { a: '1', b: { c: 2 } });
  assert.equal(await kv.hget('wy_rt:h', 'a'), '1');
  assert.deepEqual(await kv.hgetall('wy_rt:h'), { a: '1', b: '{"c":2}' });
  assert.equal(await kv.hlen('wy_rt:h'), 2);
  assert.equal(await kv.hgetall('wy_rt:none'), null);
});

test('zset：zadd/zincrby/zrange（rev、withScores）/zrem', async () => {
  const kv = kvFor(createFakeD1());
  await kv.zadd('wy_rt:z', { score: 10, member: '甲' });
  await kv.zadd('wy_rt:z', { score: 30, member: '乙' });
  assert.equal(await kv.zincrby('wy_rt:z', 5, '甲'), 15);
  assert.deepEqual(await kv.zrange('wy_rt:z', 0, -1, { rev: true }), ['乙', '甲']);
  assert.deepEqual(await kv.zrange('wy_rt:z', 0, -1, { rev: true, withScores: true }), ['乙', 30, '甲', 15]);
  await kv.zrem('wy_rt:z', '甲');
  assert.deepEqual(await kv.zrange('wy_rt:z', 0, -1), ['乙']);
});

test('list：lpush 新的在前、lrange 含端點、ltrim 保留區間', async () => {
  const kv = kvFor(createFakeD1());
  await kv.lpush('wy_rt:l', 'a'); await kv.lpush('wy_rt:l', 'b'); await kv.lpush('wy_rt:l', 'c');
  assert.deepEqual(await kv.lrange('wy_rt:l', 0, 1), ['c', 'b']);
  await kv.ltrim('wy_rt:l', 0, 0);
  assert.deepEqual(await kv.lrange('wy_rt:l', 0, -1), ['c']);
});
