import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadRenown(masteredCount) {
  const code = readFileSync(new URL('../js/renown-store.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  const WYStore = {
    allMastered: () => Array.from({ length: masteredCount }, (_, i) => `t${i + 1}`),
    typeStats: () => [{ correct: 0 }],
    load: () => ({}),
    save: () => {},
  };
  return new Function('module', 'window', 'WYStore', `${code}\nreturn module.exports;`)(mod, undefined, WYStore);
}

test('文宗以目前 34 篇全數精通為門檻，不再沿用舊版 27 篇', () => {
  assert.notEqual(loadRenown(27).rank(34).name, '文宗');
  assert.equal(loadRenown(34).rank(34).name, '文宗');
});
