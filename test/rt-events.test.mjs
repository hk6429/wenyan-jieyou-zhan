import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/rt-events.js';

const E = globalThis.WYRtEvents;

test('buildScript：每 5 題一事件、鍵為 {5,10,15,20}、同 seed 同序列', () => {
  const s1 = E.buildScript(99);
  const s2 = E.buildScript(99);
  assert.deepEqual([...s1.keys()], [5, 10, 15, 20]);
  assert.deepEqual([...s1.entries()].map(([k, v]) => [k, v.id]), [...s2.entries()].map(([k, v]) => [k, v.id]));
});

test('buildScript：只用三種支援的效果、台詞為硯靈腔', () => {
  const ok = new Set(['double', 'eliminate', 'comboBoost']);
  for (const ev of E.buildScript(7).values()) {
    assert.ok(ok.has(ev.effect), `不支援的效果 ${ev.effect}`);
    assert.match(ev.line, /^硯靈曰：/);
  }
});

test('buildScript：不同 seed 大機率不同序列、相鄰不重複同事件', () => {
  const ids = (m) => [...m.values()].map((e) => e.id).join(',');
  assert.notEqual(ids(E.buildScript(1)), ids(E.buildScript(2)));
  for (let seed = 0; seed < 50; seed++) {
    const seq = [...E.buildScript(seed).values()].map((e) => e.id);
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
  }
});
