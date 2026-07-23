import { readFileSync } from 'node:fs';

const texts = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url)));
const common = new Set([...'下列何者最能符合關於本文作者這個意思說明選項正確錯誤的是可見其以而之也有無不與為']);
const chars = (s) => [...String(s || '').replace(/[\p{P}\p{S}\s\d]/gu, '')];
const semantic = (s) => new Set(chars(s).filter((c) => !common.has(c)));
const overlap = (a, b) => {
  const aa = semantic(a); const bb = semantic(b);
  if (!aa.size || !bb.size) return 0;
  return [...aa].filter((c) => bb.has(c)).length / Math.min(aa.size, bb.size);
};

const findings = [];
let total = 0;
for (const t of texts) {
  for (const q of t.questions || []) {
    total += 1;
    if (!Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.answer)) continue;
    const answer = q.options[q.answer];
    const lengths = q.options.map((x) => chars(x).length);
    const rawLengths = q.options.map((x) => [...String(x)].length);
    const others = lengths.filter((_, i) => i !== q.answer);
    const answerOutlier = (lengths[q.answer] >= Math.max(...others) + 5) || (lengths[q.answer] + 5 <= Math.min(...others));
    const tinyDistractors = q.options.map((x, i) => ({ i, len: lengths[i] })).filter((x) => x.i !== q.answer && x.len <= 2 && lengths[q.answer] >= 6);
    const uniqueLongest = rawLengths[q.answer] === Math.max(...rawLengths) && rawLengths.filter((x) => x === rawLengths[q.answer]).length === 1;
    if (uniqueLongest && rawLengths[q.answer] - Math.min(...rawLengths) >= 4) {
      findings.push({ severity: 'auto', kind: 'length-leak', textId: t.id, qId: q.id, detail: `含標點長度 ${rawLengths.join('/')}` });
    } else if (answerOutlier || tinyDistractors.length >= 2) {
      findings.push({ severity: 'manual', kind: 'length-outlier', textId: t.id, qId: q.id, detail: `長度 ${lengths.join('/')}` });
    }
    const semanticLinks = q.options.map((opt, i) => i === q.answer || chars(opt).length < 6 || chars(answer).length < 6
      ? null : Math.max(overlap(opt, answer), overlap(opt, q.stem)));
    const checked = semanticLinks.filter((x) => x != null);
    if (checked.length === 3 && checked.every((x) => x === 0)) {
      findings.push({ severity: 'manual', kind: 'semantic-low-overlap', textId: t.id, qId: q.id, detail: '三個誘答與題幹／正解皆無顯著字詞交集' });
    }
  }
}

const auto = findings.filter((x) => x.severity === 'auto');
const manual = findings.filter((x) => x.severity === 'manual');
console.log(`共掃描 ${total} 題。`);
console.log(`可安全機械修補的長度外洩：${auto.length} 筆。`);
console.log(`需人工判斷的長度／語意候選：${manual.length} 筆。`);
for (const item of [...auto, ...manual].slice(0, 40)) console.log(` - [${item.severity}] ${item.textId}/${item.qId} ${item.kind}：${item.detail}`);
if (findings.length > 40) console.log(`…其餘 ${findings.length - 40} 筆省略；請由內容編輯者逐題回看原文後再決定，不自動改寫。`);
console.log('本腳本只稽核、不自動改動語意；auto 為 0 時，代表沒有可安全機械修補項。');
