import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));

function runValidatorWith(mutator) {
  const dir = mkdtempSync(join(tmpdir(), 'wenyan-quality-'));
  const file = join(dir, 'texts.json');
  const data = structuredClone(TEXTS);
  mutator(data);
  writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, ['scripts/validate.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WY_TEXTS_PATH: file },
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('解析不引用洗牌後會失效的選項編號', () => {
  const offenders = TEXTS.flatMap((text) =>
    text.questions
      .filter((q) => /選項\s*[1-4一二三四]/.test(q.explain || ''))
      .map((q) => `${text.id}/${q.id}`));

  assert.deepEqual(offenders, []);
});

test('題庫文字不含 UTF-8 誤解碼字串', () => {
  const mojibake = /[\u0080-\u009f]|(?:Ã|Â|â|å|æ|ç|è|é|ï|ð)[^\s，。；：「」『』（）]{1,8}/u;
  const offenders = TEXTS.flatMap((text) =>
    text.questions
      .filter((q) => mojibake.test(`${q.stem}\n${q.options.join('\n')}\n${q.explain}`))
      .map((q) => `${text.id}/${q.id}`));

  assert.deepEqual(offenders, []);
});

test('已確認的段旨題正解對準題幹所引原句', () => {
  const expected = new Map([
    ['t28q31', '列舉菊與牡丹的偏愛，為後文品評蓮花與人格價值鋪路'],
    ['t28q32', '描寫蓮出淤泥不染等特質，象徵君子不受污染、端正自持'],
    ['t28q33', '以菊、牡丹、蓮分別象徵隱士、富貴者與君子'],
    ['t31q33', '複習不是機械重複，而要從舊知中得到新理解'],
  ]);
  const actual = new Map(TEXTS.flatMap((text) =>
    text.questions
      .filter((q) => expected.has(q.id))
      .map((q) => [q.id, q.options[q.answer]])));

  assert.deepEqual(actual, expected);
  const t31q33 = TEXTS.flatMap((text) => text.questions).find((q) => q.id === 't31q33');
  assert.match(t31q33.stem, /溫故而知新/);
});

test('抽核的段旨題正解只概括題幹所指段落', () => {
  const expected = new Map([
    ['t29q32', '透過對話呈現陳堯咨自負動怒，賣油翁指出技藝只因手熟'],
    ['t34q31', '遇險能冷靜說謊、套問弱點並把握時機行動'],
    ['t34q33', '渡水聲引起鬼懷疑，宋定伯再次以新鬼身分化解'],
    ['t34q34', '宋定伯掌握鬼怕唾液的弱點，擒鬼化羊並賣得錢'],
  ]);
  const actual = new Map(TEXTS.flatMap((text) =>
    text.questions
      .filter((q) => expected.has(q.id))
      .map((q) => [q.id, q.options[q.answer]])));

  assert.deepEqual(actual, expected);
});

test('validator 將解析中的選項編號列為錯誤', () => {
  const result = runValidatorWith((data) => {
    data[0].questions[0].explain = '選項1正確，選項2錯誤。';
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /解析引用選項編號/);
});

test('validator 將 UTF-8 誤解碼列為錯誤', () => {
  const result = runValidatorWith((data) => {
    data[0].questions[0].explain = '這是è©²é¸é 。';
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /UTF-8 誤解碼/);
});

test('validator 將同題幹卻指向不同正解文字列為錯誤', () => {
  const result = runValidatorWith((data) => {
    data[0].questions[1].stem = data[0].questions[0].stem;
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /重複題幹卻有不同正解/);
});

test('validator 容許同題幹在選項重排後仍指向同一正解文字', () => {
  const result = runValidatorWith((data) => {
    const source = data[0].questions[0];
    const duplicate = data[0].questions[1];
    duplicate.stem = source.stem;
    duplicate.options = [...source.options].reverse();
    duplicate.answer = 3 - source.answer;
    duplicate.explain = '正解文字相同，僅調整選項顯示順序。';
  });

  assert.equal(result.status, 0, result.stdout);
});
