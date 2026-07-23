import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TEXTS = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url), 'utf8'));

test('每篇文章至少有 5 題段旨題', () => {
  for (const text of TEXTS) {
    const count = text.questions.filter((q) => q.type === 'gist').length;
    assert.ok(count >= 5, `${text.id} ${text.title} 只有 ${count} 題段旨題`);
  }
});

test('本輪新增段旨題都附有可回查既有段落的原文證據', () => {
  const added = TEXTS.flatMap((text) => text.questions
    .filter((q) => q.grounding?.review === 'roadmap-20260722')
    .map((q) => ({ text, q })));
  assert.equal(added.length, 18);
  for (const { text, q } of added) {
    const segment = text.segments.find((s) => Number(s.no) === Number(q.grounding.segment));
    assert.ok(segment, `${q.id} 找不到第 ${q.grounding.segment} 段`);
    const corpus = `${segment.text}\n${segment.translation}\n${segment.note}`;
    assert.ok(corpus.includes(q.grounding.evidence), `${q.id} 證據「${q.grounding.evidence}」不在既有原文／語譯／賞析`);
  }
});

test('glossary 僅保留該段原文實際出現的字詞', () => {
  for (const text of TEXTS) for (const segment of text.segments) for (const item of segment.glossary) {
    assert.ok(segment.text.includes(item.word), `${text.id} 第${segment.no}段 glossary「${item.word}」不在原文`);
  }
});

test('選項長度不再洩漏正解', () => {
  let exploitable = 0;
  for (const text of TEXTS) for (const q of text.questions) {
    const lengths = q.options.map((option) => [...option].length);
    const longest = Math.max(...lengths);
    if (lengths[q.answer] === longest && lengths.filter((n) => n === longest).length === 1 && longest - Math.min(...lengths) >= 4) exploitable += 1;
  }
  assert.equal(exploitable, 0);
});
