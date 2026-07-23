import { readFileSync, writeFileSync } from 'node:fs';

const DATA_URL = new URL('../data/texts.json', import.meta.url);

// FNV-1a：固定、跨平台、無時間與 Math.random 依賴。
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function countsOf(texts) {
  const counts = [0, 0, 0, 0];
  texts.forEach((t) => t.questions.forEach((q) => { counts[q.answer] += 1; }));
  return counts;
}

const texts = JSON.parse(readFileSync(DATA_URL, 'utf8'));
const before = countsOf(texts);

for (const text of texts) {
  for (const q of text.questions) {
    if (!Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.answer)) {
      throw new Error(`${text.id}/${q.id} 的 options/answer 格式不合法`);
    }
    const original = q.options.slice();
    const correctText = original[q.answer];
    const target = hash(q.id) % 4;
    const distractors = original
      .filter((_, index) => index !== q.answer)
      .sort((a, b) => hash(`${q.id}:${a}`) - hash(`${q.id}:${b}`));
    const next = [];
    let d = 0;
    for (let i = 0; i < 4; i++) next.push(i === target ? correctText : distractors[d++]);
    if (next[target] !== correctText) throw new Error(`${text.id}/${q.id} 正解文字在重排時改變`);
    if (JSON.stringify([...next].sort()) !== JSON.stringify([...original].sort())) {
      throw new Error(`${text.id}/${q.id} 選項內容在重排時改變`);
    }
    q.options = next;
    q.answer = target;
  }
}

writeFileSync(DATA_URL, `${JSON.stringify(texts, null, 2)}\n`);
const after = countsOf(texts);
const total = after.reduce((sum, n) => sum + n, 0);
const fmt = (counts) => counts.map((n, i) => `${i}:${n} (${(n / total * 100).toFixed(2)}%)`).join(', ');
console.log(`固定種子選項重排完成，共 ${total} 題。`);
console.log(`before ${fmt(before)}`);
console.log(`after  ${fmt(after)}`);
