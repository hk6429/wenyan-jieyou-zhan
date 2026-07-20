import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from './fake-d1.mjs';

test('fake-d1：prepare/bind/run/first/all 走 ?N 位置參數', async () => {
  const db = createFakeD1();
  await db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3)').bind('a', 'x', null).run();
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('a').first('v'), 'x');
  const { results } = await db.prepare('SELECT k,v FROM kv').bind().all();
  assert.deepEqual(results, [{ k: 'a', v: 'x' }]);
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('none').first('v'), null);
});

test('fake-d1：batch 依序執行', async () => {
  const db = createFakeD1();
  await db.batch([
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('a', '1'),
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('b', '2'),
  ]);
  const { results } = await db.prepare('SELECT COUNT(*) AS c FROM kv').bind().all();
  assert.equal(results[0].c, 2);
});

test('fake-d1：schema.sql 四表俱在', async () => {
  const db = createFakeD1();
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").bind().all();
  const names = results.map((r) => r.name);
  for (const t of ['hash', 'kv', 'list', 'zset']) assert.ok(names.includes(t), `缺表 ${t}`);
});
